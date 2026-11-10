"""Contract, middleware-only and experiment-math checks without running workloads."""
import asyncio
import json
from pathlib import Path

import pytest
from pydantic import TypeAdapter

from app.middleware import BodySizeLimitMiddleware, MiddlewareErrorEnvelope
from app.performance_schemas import DatasetStatusResponse, PerformanceSummary, PerformanceRecords, PerformanceDocument
from app.config import Settings
from experiments.common import default_settings, distribution
from experiments.evaluate_unicode_evasion import manipulate, outcome, aggregate, VARIANTS
from experiments.measure_dos import parser
from app.sanitise import normalise_text


def test_production_security_defaults():
    s = Settings(_env_file=None)
    assert s.inference_guard_enabled and s.normalise_input
    assert not s.performance_enabled
    assert s.rate_limit_requests == 20 and s.inference_workers == 2 and s.inference_queue_size == 4


def test_experiment_limits_ignore_inherited_configuration(monkeypatch):
    monkeypatch.setenv('AIDETECT_INFERENCE_WORKERS', '999')
    monkeypatch.setenv('AIDETECT_MAX_TEXT_CHARS', '999999999')
    monkeypatch.setenv('AIDETECT_NORMALISE_INPUT', 'false')
    settings = default_settings()
    assert settings.inference_workers == 2
    assert settings.max_text_chars == 10000
    assert settings.normalise_input is True


def test_schema_examples_validate():
    adapter = TypeAdapter(DatasetStatusResponse)
    for cls in DatasetStatusResponse.__args__:
        for example in cls.model_json_schema()['examples']:
            adapter.validate_python(example)
    for cls in (PerformanceSummary, PerformanceRecords, PerformanceDocument):
        for example in cls.model_json_schema()['examples']:
            cls.model_validate(example)


@pytest.mark.parametrize('lengths,status', [([b'-1'], 400), ([b'2', b'2'], 400), ([b'101'], 413)])
def test_body_middleware_rejects_before_application(lengths, status):
    messages = []
    async def forbidden(*args):
        pytest.fail('Rejected request reached the application')
    async def send(message):
        messages.append(message)
    scope = {'type': 'http', 'headers': [(b'content-length', v) for v in lengths], 'state': {'request_id': 'middleware-test'}}
    asyncio.run(BodySizeLimitMiddleware(forbidden, 100)(scope, forbidden, send))
    assert messages[0]['status'] == status
    assert json.loads(messages[1]['body'])['request_id'] == 'middleware-test'


def test_plain_middleware_rejection_drops_unsafe_body_preserves_headers():
    messages = []
    async def plain(scope, receive, send):
        await send({'type': 'http.response.start', 'status': 400, 'headers': [(b'content-type', b'text/plain'), (b'vary', b'Origin')]})
        await send({'type': 'http.response.body', 'body': b'untrusted secret', 'more_body': True})
        await send({'type': 'http.response.body', 'body': b' path'})
    async def receive():
        return {'type': 'http.request', 'body': b''}
    async def send(message):
        messages.append(message)
    asyncio.run(MiddlewareErrorEnvelope(plain)({'type': 'http', 'state': {'request_id': 'abc'}}, receive, send))
    assert len(messages) == 2
    assert dict(messages[0]['headers'])[b'vary'] == b'Origin'
    body = json.loads(messages[1]['body'])
    assert body['request_id'] == 'abc' and body['error']['code'] == 'bad_request'
    assert b'secret' not in messages[1]['body']


def test_deterministic_unicode_variants_and_attack_definition():
    text = 'A person expects clear prose and examples for each topic in this article.'
    for variant in VARIANTS:
        attack = manipulate(text, variant)
        assert attack == manipulate(text, variant) and attack != text
        assert normalise_text(attack)[0] == text
        assert normalise_text(attack)[1] > 0
        # The unnormalised condition must retain ordinary alphabetic words;
        # mutating every word with an invisible produces input rejection instead.
        if variant == 'invisibles':
            assert any(word.isascii() and word.isalpha() for word in attack.split())
    assert outcome(1, 1, 0, 1)['attack_success'] is True
    assert outcome(1, 0, 0, 0)['attack_success'] is None  # already missed at baseline
    assert outcome(0, 0, 1, 0)['attack_success'] is None  # wrong objective
    assert outcome(None, 1, 0, 1)['attack_success'] is None
    assert outcome(1, 1, 1, 1)['attack_success'] is False  # score change alone is insufficient
    assert aggregate([])['attack_success']['rate'] is None


def test_distribution_and_workload_bounds():
    assert distribution([])['median'] is None
    assert distribution([1, 2, 3])['median'] == 2
    assert distribution([1])['stdev'] is None
    args = parser().parse_args(['--run-local'])
    assert args.requests == 12 and args.concurrency == 8 and args.rate_limit == 20
    for invalid in (['--requests', '100000'], ['--concurrency', '999'], ['--url', 'https://example.com']):
        with pytest.raises(SystemExit):
            parser().parse_args(invalid)


def test_windows_uvloop_marker():
    from packaging.requirements import Requirement
    line = next(line for line in (Path(__file__).parents[1]/'requirements.txt').read_text().splitlines() if line.startswith('uvloop'))
    marker = Requirement(line).marker
    assert not marker.evaluate({'sys_platform': 'win32'})
    assert marker.evaluate({'sys_platform': 'linux'})
