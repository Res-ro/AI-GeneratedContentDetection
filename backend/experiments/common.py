"""Small shared helpers for bounded, reproducible local measurements."""
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import socket
import statistics
import subprocess
import sys
import time

import httpx

BACKEND = Path(__file__).resolve().parents[1]


def default_settings(**overrides):
    """Explicit defaults prevent a user's .env/environment widening run limits."""
    from app.config import Settings
    values = {name: field.get_default(call_default_factory=True) for name, field in Settings.model_fields.items()}
    return Settings(_env_file=None, **{**values, **overrides})


def bounded_int(low, high):
    def parse(value):
        result = int(value)
        if not low <= result <= high:
            raise ValueError(f'Must be between {low} and {high}')
        return result
    return parse


def distribution(values):
    values = sorted(values)
    if not values:
        return {'n': 0, 'mean': None, 'median': None, 'p95': None, 'min': None, 'max': None, 'stdev': None}
    index = .95 * (len(values) - 1)
    lo = int(index)
    p95 = values[lo] + (values[min(lo + 1, len(values)-1)] - values[lo]) * (index-lo)
    return {'n': len(values), 'mean': statistics.mean(values), 'median': statistics.median(values),
            'p95': p95, 'min': values[0], 'max': values[-1], 'stdev': statistics.stdev(values) if len(values) > 1 else None}


def provenance():
    settings = default_settings()
    return {'timestamp_utc': datetime.now(timezone.utc).isoformat(), 'python': platform.python_version(),
            'platform': platform.platform(), 'models': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(settings.models_dir.glob('*.pkl'))},
            'source_hashes': {name: hashlib.sha256((BACKEND/name).read_bytes()).hexdigest() for name in
                              ('app/model_service.py', 'app/score_math.py', 'app/sanitise.py', 'app/concurrency.py', 'app/routes.py',
                               'experiments/common.py', 'experiments/measure_dos.py', 'experiments/evaluate_unicode_evasion.py')}}


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, allow_nan=False), encoding='utf-8')


def output_directory(parent, name):
    path = Path(parent) / (name + '-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    path.mkdir(parents=True, exist_ok=False)
    return path


@contextmanager
def local_server(*, guard, rate_limit, log_path):
    """Own one loopback-only child, clean settings, no proxy/redirect routing.

    Only this child has its comparison configuration changed. No .env is edited.
    Stop/kill on completion or failure, including outstanding unguarded work.
    """
    settings = default_settings(inference_guard_enabled=guard, rate_limit_requests=rate_limit,
                                performance_enabled=False, allowed_hosts='127.0.0.1,localhost')
    env = {k: v for k, v in os.environ.items() if not k.startswith('AIDETECT_')}
    env.update({f'AIDETECT_{k.upper()}': str(v).lower() if isinstance(v, bool) else str(v) for k, v in settings.model_dump().items()})
    for key in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS'):
        env[key] = '1'
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    url = f'http://127.0.0.1:{port}'
    with Path(log_path).open('w', encoding='utf-8') as log:
        process = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', str(port),
                                    '--workers', '1', '--no-server-header', '--no-proxy-headers', '--log-level', 'warning'],
                                   cwd=BACKEND, env=env, stdout=log, stderr=log,
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        try:
            until = time.monotonic() + 60
            with httpx.Client(trust_env=False, follow_redirects=False, timeout=1) as client:
                ready = False
                while time.monotonic() < until:
                    if process.poll() is not None:
                        raise RuntimeError('Experiment server exited. Inspect its local server log.')
                    try:
                        if client.get(url + '/api/health').status_code == 200:
                            ready = True
                            break
                    except httpx.RequestError:
                        pass
                    time.sleep(.2)
            if not ready:
                raise RuntimeError('Experiment server did not become ready within 60 seconds.')
            yield url, settings.model_dump(mode='json')
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
