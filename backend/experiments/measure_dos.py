"""Controlled DoS comparison on child servers bound ONLY to 127.0.0.1.

Requires --run-local. No target URL option; environment proxy settings are ignored.
Synthetic workload text has no authorship label and measures resource use only.
"""
import argparse
import asyncio
import csv
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from experiments.common import BACKEND, bounded_int, distribution, local_server, output_directory, provenance, write_json

WORKLOAD_SENTENCE = 'The quick brown fox jumps over the lazy dog near the old river bank today. '


async def trial(url, args, text):
    rows = []
    started = time.perf_counter()
    slots = asyncio.Semaphore(args.concurrency)
    done = asyncio.Event()

    async def request(client, kind, index):
        t = time.perf_counter()
        status, error = None, ''
        try:
            # A wall-clock cap supplements httpx's per-operation timeout.
            async with asyncio.timeout(args.timeout):
                response = await (client.post('/api/analyze', json={'text': text, 'model': args.model}) if kind == 'analysis' else client.get('/api/health'))
                status = response.status_code
                if status >= 400:
                    error = 'http_error'
        except (TimeoutError, httpx.TimeoutException):
            error = 'timeout'
        except httpx.RequestError:
            error = 'transport_error'
        except asyncio.CancelledError:
            error = 'trial_deadline'
        rows.append({'kind': kind, 'request': index, 'status': status, 'error': error,
                     'started_ms': (t-started)*1000, 'latency_ms': (time.perf_counter()-t)*1000})

    async def worker(client, index):
        async with slots:
            await request(client, 'analysis', index)

    async def health(client):
        for i in range(args.health_probes):
            await request(client, 'health', i)
            try:
                await asyncio.wait_for(done.wait(), timeout=.1)
                break
            except TimeoutError:
                pass

    async with httpx.AsyncClient(base_url=url, trust_env=False, follow_redirects=False, timeout=args.timeout,
                                 limits=httpx.Limits(max_connections=args.concurrency)) as client, \
               httpx.AsyncClient(base_url=url, trust_env=False, follow_redirects=False, timeout=args.timeout) as probe_client:
        tasks = [asyncio.create_task(worker(client, i)) for i in range(args.requests)]
        health_task = asyncio.create_task(health(probe_client))
        try:
            async with asyncio.timeout(args.trial_seconds):
                await asyncio.gather(*tasks)
        except TimeoutError:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        finally:
            done.set()
            await health_task
    analysis = [r for r in rows if r['kind'] == 'analysis']
    probes = [r for r in rows if r['kind'] == 'health']
    def summary(items):
        return {'attempted': len(items), 'success': sum(r['status'] == 200 for r in items),
                'http_429': sum(r['status'] == 429 for r in items), 'http_503': sum(r['status'] == 503 for r in items),
                'timeouts': sum(r['error'] in ('timeout', 'trial_deadline') for r in items),
                'other_errors': sum(r['status'] not in (200, 429, 503) and r['error'] not in ('timeout', 'trial_deadline') for r in items),
                'latency_ms': distribution([r['latency_ms'] for r in items]),
                'successful_latency_ms': distribution([r['latency_ms'] for r in items if r['status'] == 200])}
    return rows, {'analysis': summary(analysis), 'health': summary(probes), 'not_started': args.requests-len(analysis),
                  'duration_seconds': time.perf_counter()-started}


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--run-local', action='store_true', help='Explicitly opt in to isolated guard-off/guard-on child processes.')
    p.add_argument('--requests', type=bounded_int(1, 64), default=12)
    p.add_argument('--concurrency', type=bounded_int(1, 16), default=8)
    p.add_argument('--trials', type=bounded_int(1, 5), default=2)
    p.add_argument('--sentences', type=bounded_int(1, 100), default=20)
    p.add_argument('--timeout', type=bounded_int(1, 10), default=5)
    p.add_argument('--trial-seconds', type=bounded_int(5, 60), default=30)
    p.add_argument('--health-probes', type=bounded_int(1, 50), default=20)
    p.add_argument('--rate-limit', type=bounded_int(1, 100), default=20, help='Same per-minute limit for both children; default preserves production limit.')
    p.add_argument('--model', choices=['xgboost', 'logistic'], default='xgboost')
    p.add_argument('--output', type=Path, default=BACKEND/'experiments/results')
    return p


def main():
    p = parser()
    args = p.parse_args()
    if not args.run_local:
        p.error('--run-local is required; this experiment temporarily disables the inference guard in one isolated child.')
    from app.schemas import AnalyzeRequest
    text = WORKLOAD_SENTENCE * args.sentences
    AnalyzeRequest(text=text, model=args.model)
    out = output_directory(args.output, 'dos')
    report = {'provenance': provenance(), 'workload': {k: str(v) if isinstance(v, Path) else v for k,v in vars(args).items()},
              'note': 'Synthetic workload for resource measurements only. Latencies exclude waiting for a client concurrency slot. Fast rejections are not successful service.', 'trials': []}
    all_rows = []
    overall = time.perf_counter()
    try:
        for number in range(1, args.trials+1):
            # Counterbalance ordering across repeats; each condition starts fresh.
            for guard in ([False, True] if number % 2 else [True, False]):
                condition = 'guard_on' if guard else 'guard_off'
                print(f'Trial {number}/{args.trials}, {condition}: {args.requests} requests, concurrency {args.concurrency}', flush=True)
                with local_server(guard=guard, rate_limit=args.rate_limit, log_path=out/f'{number}-{condition}.log') as (url, settings):
                    with httpx.Client(trust_env=False, follow_redirects=False, timeout=10) as warm:
                        response = warm.post(url+'/api/analyze', json={'text': WORKLOAD_SENTENCE, 'model': args.model})
                        response.raise_for_status()
                    rows, result = asyncio.run(trial(url, args, text))
                all_rows.extend({'trial': number, 'condition': condition, **r} for r in rows)
                report['trials'].append({'trial': number, 'condition': condition, 'settings': settings, **result})
                print(f"  200={result['analysis']['success']} 429={result['analysis']['http_429']} 503={result['analysis']['http_503']} timeouts={result['analysis']['timeouts']}; health median={result['health']['latency_ms']['median']} ms", flush=True)
    finally:
        report['duration_seconds_including_startup'] = time.perf_counter()-overall
        report['distributions'] = {condition: {'trial_health_median_ms': distribution([r['health']['latency_ms']['median'] for r in report['trials'] if r['condition'] == condition and r['health']['latency_ms']['median'] is not None]),
                                              'trial_success_count': distribution([r['analysis']['success'] for r in report['trials'] if r['condition'] == condition])} for condition in ('guard_off', 'guard_on')}
        write_json(out/'summary.json', report)
        with (out/'requests.csv').open('w', newline='', encoding='utf-8') as handle:
            writer = csv.DictWriter(handle, fieldnames=['trial', 'condition', 'kind', 'request', 'status', 'error', 'started_ms', 'latency_ms'])
            writer.writeheader()
            writer.writerows(all_rows)
        print(f'Evidence: {out}')


if __name__ == '__main__':
    main()
