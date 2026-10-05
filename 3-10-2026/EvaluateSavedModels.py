"""Evaluate saved models without fitting models, scalers, or thresholds.

Run after ModelEvaluation.py, using the same processed datasets that produced
the saved artifacts. Outputs go to saved_model_evaluation beside this script.
The KMeans silhouette score uses all AI training sentences, as in training.
Search histories cannot be reconstructed from the final saved models.
"""

from pathlib import Path

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    PrecisionRecallDisplay,
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    silhouette_score,
)


BASE_DIR = Path(__file__).resolve().parent


def save_figure(fig, output_dir, filename):
    fig.tight_layout()
    fig.savefig(output_dir / filename, bbox_inches="tight")
    plt.close(fig)


def evaluate_classifier(name, model, inputs, labels, threshold, output_dir, stem):
    positive_columns = np.flatnonzero(np.asarray(model.classes_) == 1)
    if len(positive_columns) != 1:
        raise ValueError(f"{name} must have a class labelled 1.")
    probabilities = model.predict_proba(inputs)[:, positive_columns[0]]
    predictions = (probabilities >= threshold).astype(int)
    scores = {
        "Accuracy": accuracy_score(labels, predictions),
        "Precision": precision_score(labels, predictions, zero_division=0),
        "Recall": recall_score(labels, predictions, zero_division=0),
        "F1 Score": f1_score(labels, predictions, zero_division=0),
        "ROC-AUC": roc_auc_score(labels, probabilities),
        "Average precision": average_precision_score(labels, probabilities),
    }
    print(f"\n{name} test metrics (saved threshold={threshold:g}):", flush=True)
    for metric, value in scores.items():
        print(f"{metric}: {value:.6f}")
    print("Confusion matrix:\n", confusion_matrix(labels, predictions, labels=[0, 1]))
    fig, ax = plt.subplots()
    ConfusionMatrixDisplay.from_predictions(
        labels, predictions, labels=[0, 1], display_labels=["Human", "AI"], ax=ax
    )
    ax.set_title(f"Confusion Matrix for {name}")
    save_figure(fig, output_dir, f"{stem}_confusion_matrix.png")
    return scores, probabilities


def evaluate_clusters(model, scaler, train_df, features, output_dir):
    ai_train = train_df.loc[train_df["label"] == 1].copy()
    if ai_train.empty:
        raise ValueError("Training data contains no AI sentences (label 1).")
    scaled = scaler.transform(ai_train[features])
    # Predict assignments for the supplied rows; stored labels_ depend on row order.
    ai_train["cluster"] = model.predict(scaled)
    cluster_count = ai_train["cluster"].nunique()
    print(f"\nSaved KMeans: K={model.n_clusters}, AI sentences={len(ai_train):,}", flush=True)
    if 2 <= cluster_count < len(ai_train):
        print("Calculating full-data silhouette score...", flush=True)
        score = silhouette_score(scaled, ai_train["cluster"])
        print(f"Silhouette score: {score:.6f}", flush=True)
    else:
        score = float("nan")
        print("Silhouette score is undefined for these cluster assignments.")
    pd.DataFrame([{"K": model.n_clusters, "Silhouette Score": score}]).to_csv(
        output_dir / "kmeans_metrics.csv", index=False
    )

    ai_means = ai_train[features].mean()
    cluster_means = ai_train.groupby("cluster")[features].mean()
    centers = pd.DataFrame(
        scaler.inverse_transform(model.cluster_centers_), columns=features
    )
    print("AI-class means:\n", ai_means)
    print("Cluster means:\n", cluster_means)
    print("Cluster centers:\n", centers)
    cluster_means.to_csv(output_dir / "cluster_means.csv")
    centers.to_csv(output_dir / "cluster_centers.csv", index_label="cluster")
    for cluster, rows in ai_train.groupby("cluster"):
        print(f"\nCluster {cluster} ({len(rows):,} sentences)")
        for sentence in rows["sentence"].sample(min(3, len(rows)), random_state=42):
            print("-", sentence)

    profiles = (cluster_means - ai_means) / ai_train[features].std(ddof=0).replace(0, 1)
    profiles.to_csv(output_dir / "cluster_profiles.csv")
    data = profiles.T
    limit = max(float(np.abs(data.to_numpy()).max()), 1e-9)
    fig, ax = plt.subplots(figsize=(12, max(6, len(features) * 0.45)))
    heatmap = ax.imshow(data.values, aspect="auto", cmap="coolwarm", vmin=-limit, vmax=limit)
    ax.set_xticks(range(data.shape[1]), labels=[f"Cluster {c}" for c in data.columns])
    ax.set_yticks(range(data.shape[0]), labels=data.index)
    for i in range(data.shape[0]):
        for j in range(data.shape[1]):
            value = data.iloc[i, j]
            ax.text(j, i, f"{value:.2f}", ha="center", va="center",
                    color="white" if abs(value) > 0.7 * limit else "black")
    fig.colorbar(heatmap, ax=ax).set_label("Difference from AI-class mean (standard deviations)")
    ax.set_title("K-Means Cluster Feature Profiles")
    save_figure(fig, output_dir, "Kmeans_cluster_feature_profile.png")


def main():
    model_dir = BASE_DIR / "Models"
    metadata = joblib.load(model_dir / "metadata.pkl")
    features = metadata["features"]
    logistic = joblib.load(model_dir / "LogisticModel.pkl")
    xgb = joblib.load(model_dir / "XGBModel.pkl")
    kmeans = joblib.load(model_dir / "KmeansModel.pkl")
    scaler = joblib.load(model_dir / "scaler.pkl")
    kmeans_scaler = joblib.load(model_dir / "scaler.pkl")
    test_df = pd.read_csv(BASE_DIR / "data" / "test_sentences.csv")
    train_df = pd.read_csv(BASE_DIR / "data" / "train_sentences.csv")
    for name, frame in [("test", test_df), ("training", train_df)]:
        required = features + ["label"] + (["sentence"] if name == "training" else [])
        missing = set(required) - set(frame.columns)
        if missing:
            raise ValueError(f"Missing {name} columns: {sorted(missing)}")
        if not np.isfinite(frame[features].to_numpy(dtype=float)).all():
            raise ValueError(f"The {name} features contain missing or infinite values.")
        if set(frame["label"].unique()) != {0, 1}:
            raise ValueError(f"The {name} labels must contain both 0 and 1 only.")
    for name, obj in [("logistic", logistic), ("XGBoost", xgb), ("KMeans", kmeans),
                      ("scaler", scaler), ("KMeans scaler", kmeans_scaler)]:
        if obj.n_features_in_ != len(features):
            raise ValueError(f"Saved {name} feature count does not match metadata.")
        if hasattr(obj, "feature_names_in_") and list(obj.feature_names_in_) != features:
            raise ValueError(f"Saved {name} feature order does not match metadata.")
    for key in ["logistic_threshold", "xgb_threshold"]:
        if not 0 <= metadata[key] <= 1:
            raise ValueError(f"Invalid saved threshold: {key}")

    output_dir = BASE_DIR / "saved_model_evaluation"
    output_dir.mkdir(parents=True, exist_ok=True)
    X, y = test_df[features], test_df["label"]
    lr_scores, lr_prob = evaluate_classifier(
        "Logistic Regression", logistic, scaler.transform(X), y,
        metadata["logistic_threshold"], output_dir, "logistic_regression"
    )
    xgb_scores, xgb_prob = evaluate_classifier(
        "XGBoost Classifier", xgb, X, y,
        metadata["xgb_threshold"], output_dir, "xgb"
    )
    fig, ax = plt.subplots()
    PrecisionRecallDisplay.from_predictions(y, lr_prob, name="Logistic Regression", ax=ax)
    PrecisionRecallDisplay.from_predictions(y, xgb_prob, name="XGBoost Classifier", ax=ax)
    ax.set_title("Precision-Recall Curves")
    save_figure(fig, output_dir, "precision_recall_curves.png")
    results = pd.DataFrame([lr_scores, xgb_scores], index=["Logistic Regression", "XGBoost Classifier"])
    results.index.name = "Model"
    results.to_csv(output_dir / "model_metrics.csv")
    ax = results.plot(kind="bar", figsize=(10, 6))
    ax.set(ylabel="Score", ylim=(0, 1), title="Model Performance Comparison")
    save_figure(ax.figure, output_dir, "model_performance_comparison.png")
    evaluate_clusters(kmeans, kmeans_scaler, train_df, features, output_dir)
    print(f"\nEvaluation outputs saved to {output_dir}")


if __name__ == "__main__":
    main()
