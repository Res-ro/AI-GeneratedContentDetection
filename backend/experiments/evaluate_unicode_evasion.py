"""Repeat deterministic Unicode evasion against the actual saved models.

Requires --run-local and either a labelled CSV or the local evaluation SQLite DB.
No passage text is written to evidence. A child process bounds total run time.
"""
import argparse
import csv
import hashlib
import html
import json
import multiprocessing
import os
from pathlib import Path
import random
import sqlite3
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from experiments.common import BACKEND, bounded_int, default_settings, distribution, output_directory, provenance, write_json

# These are a deterministic, deliberately limited subset handled by sanitise.py.
SWAPS = str.maketrans({'a': '\u0430', 'e': '\u0435', 'o': '\u043e', 'p': '\u0440', 'c': '\u0441', 'x': '\u0445',
                       'A': '\u0391', 'B': '\u0392', 'E': '\u0395', 'O': '\u039f', 'P': '\u03a1', 'T': '\u03a4'})
VARIANTS = ('confusables', 'invisibles', 'combined')


def manipulate(text, variant):
    if variant not in VARIANTS:
        raise ValueError('Unknown manipulation')
    result = text.translate(SWAPS) if variant in ('confusables', 'combined') else text
    if variant in ('invisibles', 'combined'):
        # Alter every third word, leaving alphabetic tokens for the unnormalised
        # model. Altering every word can legitimately trigger InvalidTextError,
        # which is a rejected input, not successful classification evasion.
        word_index = 0
        parts = []
        for i, ch in enumerate(result):
            parts.append(ch)
            if ch.isalpha() and (i == 0 or not result[i-1].isalpha()):
                if word_index % 3 == 0:
                    parts.append('\u200b')
                word_index += 1
        result = ''.join(parts)
    return result


def load_samples(args):
    """No synthetic labelled fallback. Database previews are explicitly retained text."""
    from app.schemas import AnalyzeRequest
    from app.features import split_sentences
    settings = default_settings()
    rows = []
    if args.csv:
        if args.csv.stat().st_size > 25 * 1024 * 1024:
            raise ValueError('Supply a representative CSV no larger than 25 MiB.')
        with args.csv.open(encoding='utf-8-sig', newline='') as handle:
            reader = csv.DictReader(handle)
            if not {'sample_id', 'text', 'label', 'split'} <= set(reader.fieldnames or []):
                raise ValueError('CSV requires sample_id,text,label,split. Use an empty label only when ground truth is unavailable.')
            seen = set()
            for index, row in enumerate(reader):
                if index >= 10000:
                    raise ValueError('Use a sample CSV of at most 10,000 rows.')
                if not row['sample_id'] or row['sample_id'] in seen:
                    raise ValueError('CSV sample IDs must be present and unique.')
                seen.add(row['sample_id'])
                if row['label'] not in ('', '0', '1') or row['split'] not in ('Test', 'Training', 'Validation', 'Unknown'):
                    raise ValueError('Labels must be 0, 1 or empty; split must be Test, Training, Validation or Unknown.')
                if row['split'] == args.split:
                    rows.append({'sample_id': row['sample_id'], 'text': row['text'], 'label': int(row['label']) if row['label'] else None, 'split': row['split'], 'source': 'provided passage'})
        random.Random(args.seed).shuffle(rows)
        rows = rows[:args.samples]
    else:
        if not args.database.is_file():
            raise ValueError('Evaluation database is missing. Import it or supply --csv.')
        db = sqlite3.connect(args.database.resolve().as_uri()+'?mode=ro', uri=True)
        try:
            # Seeded balanced selection is declared, not selected for successful attacks.
            by_label = {label: [r[0] for r in db.execute("SELECT document_id FROM records WHERE level='document' AND split=? AND label=? ORDER BY document_id", (args.split, label))] for label in (0, 1)}
            rng = random.Random(args.seed)
            for ids in by_label.values():
                rng.shuffle(ids)
            for i in range(args.samples):
                label = i % 2
                if not by_label[label]:
                    raise ValueError('Not enough documents of both labels for balanced selection.')
                doc_id = by_label[label].pop()
                sentences = db.execute("SELECT text FROM records WHERE level='sentence' AND document_id=? ORDER BY position", (doc_id,)).fetchall()
                kept = []
                for (sentence,) in sentences[:settings.max_sentences]:
                    candidate = ' '.join([*kept, sentence])
                    if len(manipulate(candidate, 'combined')) > settings.max_text_chars:
                        break
                    kept.append(sentence)
                rows.append({'sample_id': doc_id, 'text': ' '.join(kept), 'label': label, 'split': args.split,
                             'source': 'retained sentence prefix', 'retained_sentences_used': len(kept), 'exported_sentences': len(sentences)})
        finally:
            db.close()
    if len(rows) != args.samples:
        raise ValueError('Insufficient samples in the requested split. Reduce --samples or provide more data.')
    for row in rows:
        for text in [row['text'], *(manipulate(row['text'], v) for v in VARIANTS)]:
            if not settings.min_text_chars <= len(text.strip()) <= settings.max_text_chars:
                raise ValueError('A sample or manipulated variant violates the character limits.')
            AnalyzeRequest(text=text, model=args.model)
            sentences, _ = split_sentences(text, settings.min_sentence_words)
            if not sentences or len(sentences) > settings.max_sentences:
                raise ValueError('A sample or manipulated variant violates the analysed-sentence limits.')
    return rows


def outcome(label, original, attacked, defended):
    """Objective: hide known AI as human, starting from correctly detected AI."""
    eligible = label == 1 and original == 1
    flipped = attacked != original
    return {'eligible_ai': eligible, 'attack_success': attacked == 0 if eligible else None,
            'defended_attack_success': defended == 0 if eligible else None,
            'manipulation_caused_incorrect': (original == label and attacked != label) if label is not None else None,
            'classification_flip': flipped, 'defence_restored_original': defended == original,
            'restored_after_flip': defended == original if flipped else None}


def aggregate(rows):
    def rate(key):
        values = [r[key] for r in rows if r[key] is not None]
        return {'numerator': sum(values), 'denominator': len(values), 'rate': sum(values)/len(values) if values else None}
    return {'comparisons': len(rows), 'unique_samples': len({r['sample_id'] for r in rows}),
            **{key: rate(key) for key in ('attack_success', 'defended_attack_success', 'classification_flip', 'manipulation_caused_incorrect', 'restored_after_flip', 'defence_restored_original')},
            'attack_score_change': distribution([r['attacked_score']-r['original_score'] for r in rows]),
            'defended_score_change': distribution([r['defended_score']-r['original_score'] for r in rows]),
            'defence_overhead_ms': distribution([r['defended_ms']-r['attacked_ms'] for r in rows])}


def plot_svg(path, rows):
    # Standard-library standalone SVG keeps experiment dependencies unchanged.
    # Numeric-only data, labels are static: no sample text or IDs are embedded.
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="900" height="380" viewBox="0 0 900 380" role="img" aria-labelledby="title desc">',
             '<title id="title">Unicode experiment: change from original AI score</title>',
             '<desc id="desc">Each pair is one sample, variant and trial. Orange is attacked minus original; indigo is defended minus original. Classification outcomes are in results.csv.</desc>',
             '<rect width="900" height="380" fill="white"/>', '<text x="50" y="30" font-family="sans-serif" font-size="18">Score changes (not necessarily successful evasions)</text>',
             '<text x="50" y="55" font-family="sans-serif" font-size="12">Orange: attacked − original · Indigo: defended − original</text>']
    for value in (-1, -.5, 0, .5, 1):
        y = 200-value*115
        parts.append(f'<line x1="60" x2="860" y1="{y}" y2="{y}" stroke="#dce2ef"/><text x="15" y="{y+4}" font-size="12">{value:g}</text>')
    for i, row in enumerate(rows):
        x = 65 + 790*i/max(1, len(rows)-1)
        for condition, colour in [('attacked', '#b45309'), ('defended', '#4f46e5')]:
            y = 200-(row[condition+'_score']-row['original_score'])*115
            parts.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="3" fill="{colour}"><title>{html.escape(condition)} change: {row[condition+"_score"]-row["original_score"]:.4f}</title></circle>')
    parts.append('<text x="60" y="355" font-family="sans-serif" font-size="12">Comparison order; repeats of a sample are not independent observations.</text></svg>')
    path.write_text(''.join(parts), encoding='utf-8')


def run(args):
    settings = default_settings(inference_workers=1)
    # This executes only in the isolated worker. Override .env/inherited limits
    # before schemas/model_service imports initialise their settings cache.
    os.environ.update({f'AIDETECT_{k.upper()}': str(v).lower() if isinstance(v, bool) else str(v) for k,v in settings.model_dump().items()})
    from app.concurrency import Deadline
    from app.model_service import ModelService
    from app.sanitise import normalise_text
    samples = load_samples(args)
    out = output_directory(args.output, 'unicode')
    service = ModelService(settings)
    # Warm each path before measuring; no warm-up predictions enter the results.
    for enabled in (False, True):
        settings.normalise_input = enabled
        service.analyse(samples[0]['text'], args.model, Deadline(8))
    rows, errors = [], []
    report = {'provenance': provenance(), 'model': args.model, 'thresholds': {m.name: m.threshold for m in service.info().models},
              'split': args.split, 'seed': args.seed, 'trials': args.trials, 'variants': list(VARIANTS),
              'manipulation': 'Fixed Latin-to-Cyrillic/Greek subset; U+200B after the first letter of every third word. See recorded script SHA-256.',
              'source': 'labelled CSV' if args.csv else 'seeded class-balanced retained prefixes from SQLite',
              'selection': [{k:v for k,v in s.items() if k != 'text'} for s in samples],
              'input_hashes': {s['sample_id']: hashlib.sha256(s['text'].encode()).hexdigest() for s in samples},
              'source_sha256': hashlib.sha256(args.csv.read_bytes()).hexdigest() if args.csv else None,
              'limitations': 'Small local repeated-sample experiment, not a generalisation estimate. Trials repeat the same deterministic inputs; they are not independent samples. Restoration can restore an incorrect baseline. Timing includes complete sequential inference, not only normalisation.'}
    if args.database:
        db = sqlite3.connect(args.database.resolve().as_uri()+'?mode=ro', uri=True)
        try:
            report['dataset_provenance'] = json.loads(db.execute('SELECT value FROM metadata').fetchone()[0])
        finally:
            db.close()
    started = time.perf_counter()
    # Counterbalanced condition order reduces warm-cache/order timing bias.
    orders = [('original', 'attacked', 'defended'), ('defended', 'original', 'attacked'), ('attacked', 'defended', 'original')]
    for trial in range(args.trials):
        for sample_index, sample in enumerate(samples):
            for variant_index, variant in enumerate(VARIANTS):
                attacked_text = manipulate(sample['text'], variant)
                values = {}
                for condition in orders[(trial+sample_index+variant_index) % len(orders)]:
                    settings.normalise_input = condition != 'attacked'
                    text = sample['text'] if condition == 'original' else attacked_text
                    tick = time.perf_counter()
                    try:
                        result = service.analyse(text, args.model, Deadline(8))
                        values[condition] = {'prediction': int(result.verdict == 'ai_generated'), 'score': result.ai_score,
                                             'ms': (time.perf_counter()-tick)*1000, 'reported_suspicious': result.suspicious_characters}
                    except Exception as exc:
                        # Log exception class only: never emit passage text or exception values.
                        errors.append({'sample_id': sample['sample_id'], 'trial': trial+1, 'variant': variant, 'condition': condition, 'error_type': type(exc).__name__})
                if len(values) != 3:
                    continue
                row = {'sample_id': sample['sample_id'], 'label': sample['label'], 'split': sample['split'], 'trial': trial+1, 'variant': variant,
                       'original_characters': len(sample['text']), 'attacked_characters': len(attacked_text),
                       'suspicious_characters': normalise_text(attacked_text)[1],
                       **{f'{c}_{k}':v for c, fields in values.items() for k,v in fields.items()}}
                row.update(outcome(sample['label'], *(values[c]['prediction'] for c in ('original', 'attacked', 'defended'))))
                row['attack_score_change'] = row['attacked_score']-row['original_score']
                row['defended_score_change'] = row['defended_score']-row['original_score']
                rows.append(row)
    report.update({'duration_seconds_excluding_setup': time.perf_counter()-started, 'errors': errors,
                   'complete_comparisons': len(rows), 'expected_comparisons': args.samples*args.trials*len(VARIANTS),
                   'aggregate': aggregate(rows), 'by_variant': {v: aggregate([r for r in rows if r['variant'] == v]) for v in VARIANTS},
                   'by_sample': {s['sample_id']: aggregate([r for r in rows if r['sample_id'] == s['sample_id']]) for s in samples}})
    write_json(out/'summary.json', report)
    if rows:
        with (out/'results.csv').open('w', newline='', encoding='utf-8') as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
            writer.writeheader()
            # Protect spreadsheet consumers from formula-like supplied IDs.
            writer.writerows({k: "'"+v if isinstance(v, str) and v.startswith(('=', '+', '-', '@', '\t', '\r', '\n')) else v for k,v in r.items()} for r in rows)
        plot_svg(out/'score_changes.svg', rows)
    print(json.dumps({'evidence': str(out), 'comparisons': len(rows), 'errors': len(errors), 'attack_success': report['aggregate']['attack_success'], 'defended_attack_success': report['aggregate']['defended_attack_success'], 'restored_after_flip': report['aggregate']['restored_after_flip']}, indent=2), flush=True)
    if errors or not rows:
        raise RuntimeError('Incomplete experiment; inspect summary.json. Failed conditions are not counted as evasion successes.')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--run-local', action='store_true')
    source = p.add_mutually_exclusive_group(required=True)
    source.add_argument('--csv', type=Path)
    source.add_argument('--database', type=Path)
    p.add_argument('--split', choices=['Test', 'Validation', 'Training', 'Unknown'], default='Test')
    p.add_argument('--samples', type=bounded_int(2, 50), default=8)
    p.add_argument('--trials', type=bounded_int(1, 5), default=2)
    p.add_argument('--seed', type=int, default=42)
    p.add_argument('--model', choices=['xgboost', 'logistic'], default='xgboost')
    p.add_argument('--max-seconds', type=bounded_int(30, 600), default=180)
    p.add_argument('--output', type=Path, default=BACKEND/'experiments/results')
    args = p.parse_args()
    if not args.run_local:
        p.error('--run-local is required; only the isolated worker changes normalisation settings.')
    for key in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMEXPR_NUM_THREADS'):
        os.environ[key] = '1'
    process = multiprocessing.get_context('spawn').Process(target=run, args=(args,))
    process.start()
    process.join(args.max_seconds)
    if process.is_alive():
        process.terminate()
        process.join(5)
        if process.is_alive():
            process.kill()
            process.join(5)
        p.exit(1, 'Experiment exceeded its wall-clock limit; no complete result is claimed.\n')
    if process.exitcode:
        p.exit(1, 'Experiment did not complete successfully. See local output above.\n')


if __name__ == '__main__':
    main()
