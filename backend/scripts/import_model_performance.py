"""Run from backend: python scripts/import_model_performance.py [--csv PATH]."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import get_settings
from app.integrity import load_checksums, load_verified
from app.performance_import import FEATURES, import_csv


def main():
    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv', type=Path, default=Path(__file__).resolve().parents[2] / 'data_visualisations/model_predictions.csv')
    parser.add_argument('--output', type=Path, default=settings.performance_db)
    args = parser.parse_args()
    metadata_path = settings.models_dir / 'metadata.pkl'
    metadata = load_verified(metadata_path, load_checksums(settings.checksums_file))
    if list(metadata['features']) != FEATURES:
        parser.exit(1, 'Saved metadata uses an unsupported feature schema.\n')
    thresholds = {'logistic': float(metadata['logistic_threshold']), 'xgboost': float(metadata['xgb_threshold'])}
    try:
        result = import_csv(args.csv, args.output, thresholds, hashlib.sha256(metadata_path.read_bytes()).hexdigest())
    except (ValueError, OSError) as exc:
        parser.exit(1, f'Import failed: {exc}\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
