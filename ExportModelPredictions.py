"""Export saved logistic regression and XGBoost probabilities for all sentence splits."""

import argparse
from pathlib import Path

import joblib
import numpy as np
import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parent
SPLITS = {
    "Training": "train_sentences.csv",
    "Validation": "val_sentences.csv",
    "Test": "test_sentences.csv",
}


def ai_probability(model, inputs):
    """Select P(class 1) explicitly, without applying a classification threshold."""
    ai_columns = np.flatnonzero(np.asarray(model.classes_) == 1)
    if len(ai_columns) != 1:
        raise ValueError("Saved model must contain class 1 (AI-generated).")
    probabilities = model.predict_proba(inputs)[:, ai_columns[0]]
    if not np.isfinite(probabilities).all() or ((probabilities < 0) | (probabilities > 1)).any():
        raise ValueError("Model returned invalid probabilities.")
    return probabilities


def export_predictions(data_dir, model_dir, output):
    """Preserve source rows and columns and append split membership and estimates."""
    for filename in ("metadata.pkl", "scaler.pkl", "LogisticModel.pkl", "XGBModel.pkl"):
        if not (model_dir / filename).is_file():
            raise FileNotFoundError(f"Missing saved model artifact: {model_dir / filename}")
    features = joblib.load(model_dir / "metadata.pkl")["features"]
    if not features or len(features) != len(set(features)):
        raise ValueError("Model metadata must contain a nonempty, unique feature list.")
    scaler = joblib.load(model_dir / "scaler.pkl")
    logistic = joblib.load(model_dir / "LogisticModel.pkl")
    xgb = joblib.load(model_dir / "XGBModel.pkl")
    frames = []
    reserved = {"split", "logistic_ai_probability", "xgboost_ai_probability"}
    for split, filename in SPLITS.items():
        path = data_dir / filename
        if output.resolve() == path.resolve():
            raise ValueError("Output must not overwrite a source dataset.")
        frame = pd.read_csv(path)
        missing = {"doc_ID", "label", "sentence", *features} - set(frame.columns)
        if missing:
            raise ValueError(f"{filename}: missing columns {sorted(missing)}")
        if reserved.intersection(frame.columns):
            raise ValueError(f"{filename}: already contains export columns.")
        if frame.empty or not frame["label"].isin([0, 1]).all():
            raise ValueError(f"{filename}: requires rows with labels 0 (Human) or 1 (AI).")
        if frame[["doc_ID", "sentence"]].isna().any().any():
            raise ValueError(f"{filename}: document IDs and sentences must not be missing.")
        # The saved metadata defines feature order; retain original values in the export.
        inputs = frame[features].apply(pd.to_numeric, errors="raise")
        if not np.isfinite(inputs.to_numpy(dtype=float)).all():
            raise ValueError(f"{filename}: features must contain finite numeric values.")
        frame["split"] = split
        frame["logistic_ai_probability"] = ai_probability(logistic, scaler.transform(inputs))
        frame["xgboost_ai_probability"] = ai_probability(xgb, inputs)
        frames.append(frame)
        print(f"{split}: predicted {len(frame):,} sentences", flush=True)
    combined = pd.concat(frames, ignore_index=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(output, index=False)
    print(f"Saved {len(combined):,} sentences to {output.resolve()}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=PROJECT_DIR / "data")
    parser.add_argument("--model-dir", type=Path, default=PROJECT_DIR / "Models")
    parser.add_argument("--output", type=Path,
                        default=PROJECT_DIR / "data_visualisations" / "model_predictions.csv")
    args = parser.parse_args()
    export_predictions(args.data_dir, args.model_dir, args.output)


if __name__ == "__main__":
    main()
