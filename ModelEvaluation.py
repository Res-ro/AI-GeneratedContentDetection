# Train classifiers, explore AI sentence clusters, and save metrics and models.
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedGroupKFold, RandomizedSearchCV
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (accuracy_score, 
                             precision_score, 
                             recall_score, 
                             f1_score, 
                             confusion_matrix, 
                             roc_auc_score,
                             average_precision_score,
                             silhouette_score, 
                             ConfusionMatrixDisplay, 
                             PrecisionRecallDisplay
                             )
from xgboost import XGBClassifier
import matplotlib
matplotlib.use("Agg")  # Save plots without creating Tkinter GUI objects.
import matplotlib.pyplot as plt
import joblib
from pathlib import Path
from sklearn.decomposition import PCA
import numpy as np

# Paths are relative to the project directory; reruns overwrite saved outputs.
model_dir = Path("Models")
fig_dir = Path("model_evaluation")
model_dir.mkdir(parents=True, exist_ok=True)
fig_dir.mkdir(parents=True, exist_ok=True)
# Load the document-separated sentence datasets produced by DataProcessing.py.
test_df = pd.read_csv('data/test_sentences.csv')
train_df = pd.read_csv('data/train_sentences.csv')
val_df = pd.read_csv('data/val_sentences.csv')

# Keep feature order consistent for training and later saved-model inference.
features = [
    'word_count',
    'avg_word_length',
    'lexical_diversity',
    'stopword_ratio',
    'punctuation_ratio',
    'contraction_ratio',
    'transition_word_ratio',
    'noun_ratio',
    'verb_ratio',
    'adjective_ratio',
    'adverb_ratio',
    'pronoun_ratio'
]

scaler = StandardScaler()

# Split features and labels from datasets
train_X = train_df[features]
train_y = train_df['label']
test_X = test_df[features]
test_y = test_df['label']
val_X = val_df[features]
val_y = val_df['label']

# Learn scaling from training data only, then reuse it for validation and testing.
scaled_train_X = scaler.fit_transform(train_X)
scaled_test_X = scaler.transform(test_X)
scaled_val_X = scaler.transform(val_X)

joblib.dump(scaler, model_dir / "scaler.pkl")
#---------------------------------------------------------------------------
#                         Logistic Regression
#---------------------------------------------------------------------------


# Establish a baseline model,  balanced weights compensate for class imbalance.
model = LogisticRegression(max_iter=1000, random_state=42, class_weight="balanced")
model.fit(scaled_train_X, train_y)
val_prediction = model.predict(scaled_val_X)

# Class 1 is AI-generated; ranking metrics use its predicted probabilities.
val_probabilities = model.predict_proba(scaled_val_X)[:, 1]

print("Validation Metrics:")
print("Accuracy:", accuracy_score(val_y, val_prediction))
print("Precision:", precision_score(val_y, val_prediction))
print("Recall:", recall_score(val_y, val_prediction))
print("F1 Score:", f1_score(val_y, val_prediction))
print("Confusion Matrix:\n", confusion_matrix(val_y, val_prediction))
print("ROC-AUC:", roc_auc_score(val_y, val_probabilities))
print("PR-AUC:", average_precision_score(val_y, val_probabilities))

# Choose regularisation strength on validation average precision (reported as PR-AUC).
# Smaller C values apply stronger regularisation.
c_values = [0.01, 0.1, 1, 10, 100]
C_results = {}
for c in c_values:
    model = LogisticRegression(C=c, max_iter=1000, random_state=42, class_weight="balanced")
    model.fit(scaled_train_X, train_y)
    val_probabilities = model.predict_proba(scaled_val_X)[:, 1]

    score = average_precision_score(val_y, val_probabilities)
    C_results[c] = score
    print(f"C={c}: Average Precision Score={score:.4f}")

best_c = max(C_results, key=C_results.get)
print(f"Best C value: {best_c} with Average Precision={C_results[best_c]:.4f}")

# Select the probability cutoff with the highest validation F1 score.
thresholds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
threshold_results = {}
best_c_model = LogisticRegression(C=best_c, max_iter=1000, random_state=42, class_weight="balanced")
best_c_model.fit(scaled_train_X, train_y)
best_c_val_probabilities = best_c_model.predict_proba(scaled_val_X)[:, 1]
for threshold in thresholds:
    predictions = (best_c_val_probabilities >= threshold).astype(int)

    print(f"threshold: {threshold}, precision: {precision_score(val_y, predictions)}, recall: {recall_score(val_y, predictions)}, f1: {f1_score(val_y, predictions)}")
    score = f1_score(val_y, predictions)
    threshold_results[threshold] = score

best_threshold = max(threshold_results, key=threshold_results.get)
print(f"Best threshold: {best_threshold} with F1 score={threshold_results[best_threshold]:.4f}")

# Evaluate the chosen settings on the held-out test set.
tuned_model = LogisticRegression(C=best_c, max_iter=1000, random_state=42, class_weight="balanced")
tuned_model.fit(scaled_train_X, train_y)
logistic_probabilities = tuned_model.predict_proba(scaled_test_X)[:, 1]
test_predictions = (logistic_probabilities >= best_threshold).astype(int)
logistic_accuracy = accuracy_score(test_y, test_predictions)
logistic_precision = precision_score(test_y, test_predictions)
logistic_recall = recall_score(test_y, test_predictions)
logistic_f1 = f1_score(test_y, test_predictions)
logistic_ROC = roc_auc_score(test_y, logistic_probabilities)
logistic_AP = average_precision_score(test_y, logistic_probabilities)
print("Test Metrics:")
print("Accuracy:", logistic_accuracy)
print("Precision:", logistic_precision)
print("Recall:", logistic_recall)
print("F1 Score:", logistic_f1)
print("Confusion Matrix:\n", confusion_matrix(test_y, test_predictions))
print("ROC-AUC:", logistic_ROC)
print("PR-AUC:", logistic_AP)

ConfusionMatrixDisplay.from_predictions(test_y, test_predictions, display_labels=["Human", "AI"])
plt.title("Confusion Matrix for Logistic Regression")
plt.savefig(fig_dir / "logistic_regression_confusion_matrix.png")
plt.close()

joblib.dump(tuned_model, model_dir / "LogisticModel.pkl")


#---------------------------------------------------------------------------
#                            KMeans Clustering
#---------------------------------------------------------------------------
# Explore variation within AI-generated training sentences, using a separate scaler.
ai_train = train_df[train_df['label'] == 1].copy()
X_ai = ai_train[features]
kmeans_scaler = StandardScaler()
X_ai_scaled = kmeans_scaler.fit_transform(X_ai)

# Compare 2-6 clusters on the AI training subset; larger silhouette scores are better.
# Full-data silhouette scoring can be costly for large sentence datasets.
k_scores = {}
for k in range(2, 7):
    model = KMeans(n_clusters=k, random_state=42, n_init=50)
    val_clustering = model.fit_predict(X_ai_scaled)
    score = silhouette_score(X_ai_scaled, val_clustering)
    print(f"K={k}: Silhouette Score={score:.4f}")
    k_scores[k] = score

plt.figure()
plt.plot(list(k_scores.keys()), list(k_scores.values()), marker='o')
plt.title("Silhouette Scores for Different K Values")
plt.xlabel("Number of Clusters (K)")
plt.ylabel("Silhouette Score")
plt.savefig(fig_dir / "silhouette_scores.png")
plt.close()

best_k = max(k_scores, key=k_scores.get)
print(f"Best K value: {best_k} with Silhouette Score={k_scores[best_k]:.4f}")

kmeans_model = KMeans(n_clusters=best_k, random_state=42, n_init=50)
kmeans_model.fit(X_ai_scaled)
ai_train['cluster'] = kmeans_model.labels_
ai_means = ai_train[features].mean()
cluster_means = ai_train.groupby("cluster")[features].mean()
# Convert cluster centres back to original feature units for interpretation.
centers = pd.DataFrame(kmeans_scaler.inverse_transform(kmeans_model.cluster_centers_), columns=features)
print("Overall Means:\n", ai_means)
print("Cluster Means:\n", cluster_means)
print("Cluster Centers:\n", centers)

# Print up to three reproducible example sentences from each cluster.
for cluster in sorted(ai_train['cluster'].unique()):
    print(f"\nCluster {cluster}")
    examples = ai_train[ai_train['cluster'] == cluster]['sentence'].sample(min(3, sum(ai_train['cluster'] == cluster)), random_state=42)
    for sentence in examples:
        print("-", sentence)

ai_std = ai_train[features].std(ddof=0)

cluster_means = (
    ai_train.groupby("cluster")[features].mean()
)

# Express cluster means as deviations from the AI-class mean in standard deviations.
# Replacing zero standard deviations avoids division by zero for constant features.
cluster_profiles_ai = (
    cluster_means - ai_means
) / ai_std.replace(0, 1)

fig, ax = plt.subplots(figsize=(12, 6))
profile_data = cluster_profiles_ai.T
limit = abs(profile_data.values).max()
heatmap = ax.imshow(
    profile_data.values,
    aspect="auto",
    cmap="coolwarm",
    vmin=-limit,
    vmax=limit
)
ax.set_xticks(
    range(profile_data.shape[1]),
    labels=[f"Cluster {i}" for i in profile_data.columns]
)
ax.set_yticks(
    range(profile_data.shape[0]),
    labels=profile_data.index
)
for i in range(profile_data.shape[0]):
    for j in range(profile_data.shape[1]):
        ax.text(j, i, f"{profile_data.iloc[i, j]:.2f}",
                ha="center",
                va="center")
cbar = plt.colorbar(heatmap, ax=ax)
cbar.set_label(
    "Difference from AI-class mean (standard deviations)"
)
plt.title("K-Means Cluster Feature Profiles")
plt.tight_layout()
plt.savefig(fig_dir / "Kmeans_cluster_feature_profile.png")
plt.close(fig)

joblib.dump(kmeans_model, model_dir / "KmeansModel.pkl")
joblib.dump(kmeans_scaler, model_dir / "KmeansScaler.pkl")


#----------------------------------------------------------------------------
#                               PCA
#----------------------------------------------------------------------------
# Project AI features into two dimensions for display; K-Means uses all features.
pca = PCA(n_components=2)
X_ai_pca = pca.fit_transform(X_ai_scaled)
fig,  ax = plt.subplots(figsize=(8, 6))
scatter = ax.scatter(
    X_ai_pca[:, 0],
    X_ai_pca[:, 1],
    c=ai_train["cluster"],
    alpha=0.4
)
ax.set_xlabel(
    f"PC1 ({pca.explained_variance_ratio_[0] * 100:.1f}% variance)"
)

ax.set_ylabel(
    f"PC2 ({pca.explained_variance_ratio_[1] * 100:.1f}% variance)"
)

ax.set_title("PCA Projection of K-Means Clusters")
ax.legend(*scatter.legend_elements(), title="Cluster")
plt.tight_layout()
plt.savefig(fig_dir / "Kmeans_PCA_Visualisation.png")
plt.close(fig)

# Separately inspect cumulative explained variance across all training sentences.
pca_full = PCA()
pca_full.fit(scaled_train_X)

cumulative_variance = np.cumsum(
    pca_full.explained_variance_ratio_
)

plt.figure()
plt.plot(
    range(1, len(cumulative_variance) + 1),
    cumulative_variance,
    marker="o"
)
plt.axhline(
    y=0.95,
    linestyle="--"
)

plt.xlabel("Number of Principal Components")
plt.ylabel("Cumulative Explained Variance")
plt.title("PCA Explained Variance")
plt.ylim(0, 1.05)

plt.tight_layout()
plt.savefig(fig_dir / "Full_PCA.png")

plt.close()
#----------------------------------------------------------------------------
#                         XGBoost Classifier
#----------------------------------------------------------------------------
xgb_model = XGBClassifier(
    objective='binary:logistic',
    eval_metric='logloss',
    random_state=42,
)

# Candidate settings for a reproducible random search over boosted-tree models.
param_grid = {
    'n_estimators': [100, 200, 300, 400, 500],
    'max_depth': [3, 4, 5, 6, 7],
    'learning_rate': [0.01, 0.05, 0.1, 0.2],
    'subsample': [0.6, 0.7, 0.8, 0.9, 1.0],
    'colsample_bytree': [0.6, 0.7, 0.8, 0.9, 1.0],
    'min_child_weight': [1, 3, 5, 10],
    'gamma': [0, 0.1, 0.25, 0.5],
    'reg_alpha': [0, 0.01, 0.1, 0.5],
    'reg_lambda': [1, 2, 5, 10],
}

# Keep sentences from one doc_ID in the same fold, while balancing labels as possible.
# Search 75 candidates across five folds and rank them by average precision.
cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
search = RandomizedSearchCV(
    estimator=xgb_model,
    param_distributions=param_grid,
    n_iter=75,
    scoring='average_precision',
    cv=cv,
    verbose=1,
    random_state=42,
    n_jobs=-1
)

# Tree models use unscaled features. The search refits the best model on training data.
search.fit(train_X, train_y, groups=train_df['doc_ID'])
print("Best parameters found: ", search.best_params_)
print("Best average precision score found: ", search.best_score_)

best_xgb_model = search.best_estimator_

val_prob = best_xgb_model.predict_proba(val_X)[:, 1]

# Compare validation cutoffs for both F1 and precision-focused predictions.
xgb_threshold_results = {}
xgb_precision_threshold_results = {}
xgb_thresholds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
for threshold in xgb_thresholds:
    predict = (
        val_prob >= threshold
    ).astype(int)

    score = f1_score(
        val_y,
        predict
    )
    prec_score = precision_score(
        val_y,
        predict
    )
    xgb_threshold_results[threshold] = score
    xgb_precision_threshold_results[threshold] = prec_score


best_xgb_thres = max(xgb_threshold_results, key=xgb_threshold_results.get)
print(f"Best F1 threshold: {best_xgb_thres} with F1 Score={xgb_threshold_results[best_xgb_thres]:.4f}")
best_precision_thres = max(xgb_precision_threshold_results, key=xgb_precision_threshold_results.get)
print(f"Best Precision threshold: {best_precision_thres} with Precision Score={xgb_precision_threshold_results[best_precision_thres]:.4f}")
# Test the F1-selected cutoff first, then the precision-selected cutoff below.
xgb_tuned_probabilities = best_xgb_model.predict_proba(test_X)[:, 1]
xgb_tuned_predictions = (xgb_tuned_probabilities >= best_xgb_thres).astype(int)
xgb_accuracy = accuracy_score(test_y, xgb_tuned_predictions)
xgb_precision = precision_score(test_y, xgb_tuned_predictions)
xgb_recall = recall_score(test_y, xgb_tuned_predictions)
xgb_f1 = f1_score(test_y, xgb_tuned_predictions)
xgb_ROC = roc_auc_score(test_y, xgb_tuned_probabilities)
xgb_AP = average_precision_score(test_y, xgb_tuned_probabilities)
print("Test Metrics for XGBoost Classifier:")
print("Accuracy:", xgb_accuracy)
print("Precision:", xgb_precision)
print("Recall:", xgb_recall)
print("F1 Score:", xgb_f1)
print("Confusion Matrix:\n", confusion_matrix(test_y, xgb_tuned_predictions))
print("ROC-AUC:", xgb_ROC)
print("PR_AUC:", xgb_AP)
booster = best_xgb_model.get_booster()

xgb_precision_predict = (xgb_tuned_probabilities >= best_precision_thres).astype(int)
xgb_precision_accuracy = accuracy_score(test_y, xgb_precision_predict)
xgb_precision_precision = precision_score(test_y, xgb_precision_predict)
xgb_precision_recall = recall_score(test_y, xgb_precision_predict)
xgb_precision_f1 = f1_score(test_y, xgb_precision_predict)
print("XGB Precision focused threshold metrics:")
print("Accuracy:", xgb_precision_accuracy)
print("Precision:", xgb_precision_precision)
print("Recall:", xgb_precision_recall)
print("F1 Score:", xgb_precision_f1)
print("Confusion Matrix:\n", confusion_matrix(test_y, xgb_precision_predict))
print("ROC-AUC:", xgb_ROC)
print("PR_AUC:", xgb_AP)

# Gain measures the average improvement from tree splits using each feature.
gain_scores = booster.get_score(
    importance_type="gain"
)
gain_importance = pd.DataFrame(
    gain_scores.items(),
    columns=["feature", "gain"]
)
gain_importance = gain_importance.sort_values(
    "gain",
    ascending=False
)
print(gain_importance)

ConfusionMatrixDisplay.from_predictions(test_y, xgb_precision_predict, display_labels=["Human", "AI"])
plt.title("Confusion Matrix for XGBoost Classifier - Precision")
plt.savefig(fig_dir / "xgb_confusion_matrix.png")
plt.close()

# Precision-recall curves compare classifiers across probability cutoffs.
fig, ax = plt.subplots()
PrecisionRecallDisplay.from_predictions(test_y, xgb_tuned_probabilities, name="XGBoost Classifier", ax=ax)
PrecisionRecallDisplay.from_predictions(test_y, logistic_probabilities, name="Logistic Regression", ax=ax)
ax.set_title("Precision-Recall Curves")
fig.savefig(fig_dir / "precision_recall_curves.png")
plt.close(fig)
# Compare logistic regression's F1 cutoff with XGBoost's precision-focused cutoff.
results_df = pd.DataFrame({
    'Model': ['Logistic Regression', 'XGBoost Classifier'],
    'Accuracy': [logistic_accuracy, xgb_precision_accuracy],
    'Precision': [logistic_precision, xgb_precision_precision],
    'Recall': [logistic_recall, xgb_precision_recall],
    'F1 Score': [logistic_f1, xgb_precision_f1],
    'ROC-AUC:': [logistic_ROC, xgb_ROC],
    'PR-AUC': [logistic_AP, xgb_AP]
})
results_df.set_index('Model').plot(kind='bar')
plt.ylabel('Score')
plt.ylim(0, 1)
plt.title('Model Performance Comparison')
plt.tight_layout()
plt.savefig(fig_dir / "model_performance_comparison.png")
plt.close()

joblib.dump(best_xgb_model, model_dir / "XGBModel.pkl")

# Save feature order and selected cutoffs: model.predict() alone uses default cutoffs.
# Logistic regression also needs scaler.pkl; XGBoost takes unscaled features.
joblib.dump(
    {
        "features":features,
        "logistic_threshold": best_threshold,
        "xgb_threshold": best_precision_thres,
    },
    model_dir / "metadata.pkl"
)
