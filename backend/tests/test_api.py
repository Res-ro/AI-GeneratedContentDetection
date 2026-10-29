"""Run with:  pytest -q      (from the backend folder)"""
import asyncio
import json
import pickle
import shutil

import pytest
from fastapi.testclient import TestClient

from app.concurrency import InferenceGate
from app.config import Settings
from app.errors import ServiceBusyError
from app.integrity import ModelIntegrityError
from app.main import app
from app.model_service import ModelService
from app.rate_limit import SlidingWindowRateLimiter

GOOD_TEXT = (
    "Artificial intelligence has fundamentally transformed the way organisations approach data "
    "analysis and strategic decision making. Furthermore, the integration of advanced machine "
    "learning techniques enables systems to identify complex patterns."
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def fresh_rate_limiter(client):
    client.app.state.rate_limiter = SlidingWindowRateLimiter(10_000, 60)


def post(client, **body):
    return client.post("/api/analyze", json=body)


def assert_error_format(response, status, code):
    assert response.status_code == status
    body = response.json()
    assert set(body) == {"error", "request_id"}
    assert body["error"]["code"] == code
    assert set(body["error"]) == {"code", "message", "details"}
    assert "Traceback" not in response.text and ".py" not in response.text


# ---- happy path & documentation ------------------------------------------------
def test_health_and_model_info(client):
    assert client.get("/api/health").json() == {"status": "ok", "models_loaded": True}
    info = client.get("/api/model-info").json()
    assert info["limits"]["max_text_chars"] == 10_000 and len(info["features"]) == 12


@pytest.mark.parametrize("model", ["xgboost", "logistic"])
def test_analyze_returns_verdict(client, model):
    r = post(client, text=GOOD_TEXT, model=model)
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"] in {"ai_generated", "human_written"}
    assert 0.5 <= body["confidence"] <= 1 and body["sentence_count"] == 2
    assert all(len(s["features"]) == 12 for s in body["sentences"])


def test_docs_describe_every_endpoint(client):
    spec = client.get("/openapi.json").json()
    for path, methods in spec["paths"].items():
        for op in methods.values():
            assert op.get("summary") and op.get("description"), path
    assert "examples" in spec["components"]["schemas"]["AnalyzeRequest"]


# ---- validation & consistent errors ---------------------------------------------
@pytest.mark.parametrize(
    "body",
    [{"text": "hi"}, {"text": 123}, {"text": GOOD_TEXT, "model": "evil"}, {"text": GOOD_TEXT, "admin": True}, {}],
)
def test_invalid_input_is_422(client, body):
    assert_error_format(client.post("/api/analyze", json=body), 422, "validation_error")


def test_validation_error_never_echoes_input(client):
    r = post(client, text="<script>alert('xss')</script>", model="x" * 50)
    assert "<script>" not in r.text


def test_no_long_sentence(client):
    assert_error_format(post(client, text="Short one. Another short one here. Third tiny one."), 422, "invalid_text")


def test_unknown_route_and_method(client):
    assert_error_format(client.get("/nope"), 404, "not_found")
    assert_error_format(client.delete("/api/analyze"), 405, "method_not_allowed")


def test_unexpected_error_is_generic_json(client, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("secret internals /etc/passwd")

    monkeypatch.setattr(client.app.state.model_service, "analyse", boom)
    r = post(client, text=GOOD_TEXT)
    assert_error_format(r, 500, "internal_error")
    assert "secret" not in r.text and "passwd" not in r.text


# ---- security hygiene --------------------------------------------------------------
def test_body_size_limit_enforced_on_backend(client):
    assert_error_format(
        client.post("/api/analyze", content=b'{"text":"' + b"a" * 200_000 + b'"}', headers={"Content-Type": "application/json"}),
        413, "payload_too_large",
    )


def test_chunked_body_without_content_length_is_limited(client):
    def chunks():
        for _ in range(40):
            yield b"a" * 5_000

    r = client.post("/api/analyze", content=chunks(), headers={"Content-Type": "application/json"})
    assert_error_format(r, 413, "payload_too_large")


def test_html_is_treated_as_data(client):
    text = "<img src=x onerror=alert(1)> and this sentence has more than enough words to be analysed properly."
    r = post(client, text=text)
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/json")
    assert r.headers["x-content-type-options"] == "nosniff"


def test_cors_only_allows_own_frontend(client):
    ok = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert ok.headers["access-control-allow-origin"] == "http://localhost:5173"
    bad = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in bad.headers
    with pytest.raises(Exception):
        Settings(cors_origins="*")


def test_security_headers_and_host_check(client):
    h = client.get("/api/health").headers
    assert h["x-frame-options"] == "DENY" and "default-src 'none'" in h["content-security-policy"]
    assert client.get("/api/health", headers={"Host": "evil.com"}).status_code == 400


# ---- rate limiting -------------------------------------------------------------------
def test_rate_limit_returns_429(client):
    client.app.state.rate_limiter = SlidingWindowRateLimiter(3, 60)
    codes = [post(client, text=GOOD_TEXT).status_code for _ in range(5)]
    assert codes == [200, 200, 200, 429, 429]
    r = post(client, text=GOOD_TEXT)
    assert_error_format(r, 429, "rate_limited") and int(r.headers["retry-after"]) >= 1
    assert client.get("/api/health").status_code == 200  # other endpoints unaffected


# ---- denial of service ------------------------------------------------------------------
def test_gate_rejects_excess_with_503():
    async def scenario():
        gate = InferenceGate(max_concurrent=1, max_queue=1, queue_timeout=0.2)
        release = asyncio.Event()

        async def worker():
            async with gate.slot():
                await release.wait()

        running = asyncio.create_task(worker())
        await asyncio.sleep(0.01)
        waiting = asyncio.create_task(worker())
        await asyncio.sleep(0.01)
        with pytest.raises(ServiceBusyError):  # system full: rejected immediately
            async with gate.slot():
                pass
        release.set()
        await asyncio.gather(running, waiting)
        async with gate.slot():  # capacity is released afterwards
            pass

    asyncio.run(scenario())


def test_queue_timeout_returns_503():
    async def scenario():
        gate = InferenceGate(max_concurrent=1, max_queue=2, queue_timeout=0.05)
        release = asyncio.Event()

        async def hold():
            async with gate.slot():
                await release.wait()

        task = asyncio.create_task(hold())
        await asyncio.sleep(0.01)
        with pytest.raises(ServiceBusyError):
            async with gate.slot():
                pass
        release.set()
        await task

    asyncio.run(scenario())


def test_deadline_stops_slow_analysis(client):
    from app.concurrency import Deadline
    from app.errors import InferenceTimeoutError

    with pytest.raises(InferenceTimeoutError):
        client.app.state.model_service.analyse(GOOD_TEXT * 3, "xgboost", Deadline(-1))


# ---- unsafe model loading -------------------------------------------------------------------
def test_tampered_model_is_refused_and_never_executed(tmp_path):
    settings = Settings()
    models = tmp_path / "Models"
    shutil.copytree(settings.models_dir, models)
    marker = tmp_path / "PWNED.txt"

    class Evil:  # unpickling this would create the marker file
        def __reduce__(self):
            return (open, (str(marker), "w"))

    (models / "LogisticModel.pkl").write_bytes(pickle.dumps(Evil()))
    with pytest.raises(ModelIntegrityError):
        ModelService(Settings(models_dir=models))
    assert not marker.exists(), "malicious pickle was executed!"


def test_missing_checksum_file_fails_closed(tmp_path):
    with pytest.raises(ModelIntegrityError):
        ModelService(Settings(checksums_file=tmp_path / "nope.json"))


# ---- evasion defence ---------------------------------------------------------------------------
def test_unicode_lookalikes_are_normalised(client):
    swapped = GOOD_TEXT.translate(str.maketrans({"a": "а", "e": "е", "o": "о"})).replace(" ", "\u200b ")
    original = post(client, text=GOOD_TEXT).json()
    evasive = post(client, text=swapped).json()
    assert evasive["suspicious_characters"] > 0 and evasive["warnings"]
    assert evasive["ai_score"] == original["ai_score"]
