# AI-GeneratedContentDetection
A group project developed for COS30049 – Computing Technology Innovation Project at Swinburne University of Technology

## Setup and required libraries

Run all commands from the project root (the folder containing both Python scripts). Ensure Python is installed

Install the required third-party libraries and the spaCy English language model:

```powershell
python -m pip install pandas scikit-learn nltk spacy matplotlib xgboost joblib numpy
python -m spacy download en_core_web_sm
```

| Library | Purpose |
| --- | --- |
| pandas | Read, clean, and save datasets |
| scikit-learn | Dataset splits, scaling, logistic regression, clustering, PCA, and evaluation |
| nltk | Split documents into sentences |
| spacy | Tokenisation, part-of-speech tagging, and stopword detection |
| matplotlib | Save charts and evaluation plots |
| xgboost | Train the boosted-tree classifier |
| joblib | Save models, scalers, and prediction metadata |
| numpy | Calculate cumulative PCA explained variance |

The scripts also use `re`, `string`, and `pathlib`, which are included with Python. Data processing downloads NLTK's `punkt` and `punkt_tab` resources automatically, so internet access is needed for the first download.

## Run data processing

Place the source dataset at `data/rawdata.csv`. It must contain these columns:

| Column | Expected contents |
| --- | --- |
| `text` | English document text |
| `label` | Numeric class label: `0` for human, `1` for AI-generated |
| `prompt_name`, `source`, `RDizzl3_seven` | Metadata columns required by the current script; their values are discarded |

Use a dataset with both classes and enough documents per class for stratified splitting. Run:

```powershell
python DataProcessing.py
```

The script removes missing, blank, and duplicate documents, then splits documents into 70% training, 15% test, and 15% validation sets. Splitting before sentence extraction keeps sentences from the same document in one set. It retains sentences with at least 10 whitespace-separated words and extracts 12 numerical writing-style features using spaCy.

Outputs:

- `data/train_sentences.csv`, `data/test_sentences.csv`, and `data/val_sentences.csv`: sentences, labels, document IDs, and extracted features.
- `Class_Distribution.png`: class counts after document cleaning.
- Terminal output: split sizes, label proportions, sentence counts, and processing progress.

## Run model evaluation

Run data processing first, or use existing sentence CSVs with the same columns and all 12 features listed in `ModelEvaluation.py`. The training set must support five document-grouped cross-validation folds and K-Means clustering with up to six AI clusters. Validation and test sets must contain both labels for ROC-AUC evaluation.

```powershell
python ModelEvaluation.py
```

The script trains and tunes logistic regression, explores AI sentence clusters with K-Means and PCA, and tunes an XGBoost classifier. It uses validation data to select prediction thresholds and reports held-out test metrics, including accuracy, precision, recall, F1, ROC-AUC, and average precision (labelled PR-AUC in the output).

Outputs:

- `Models/`: `scaler.pkl`, `LogisticModel.pkl`, `KmeansModel.pkl`, `KmeansScaler.pkl`, `XGBModel.pkl`, and `metadata.pkl`.
- `model_evaluation/`: confusion matrices, cluster and PCA plots, precision-recall curves, and a model comparison chart.
- Terminal output: evaluation metrics, selected parameters and thresholds, cluster summaries, and XGBoost feature importance.

The saved metadata contains the feature order, the logistic regression F1-selected threshold, and the XGBoost precision-selected threshold. The final comparison chart uses these thresholds. For later predictions, apply the saved thresholds to class-1 probabilities; logistic regression also requires the saved scaler, while XGBoost uses unscaled features.

Both scripts save plots directly to files without opening chart windows. Rerunning them overwrites their corresponding outputs. Evaluation can take substantial time and memory: XGBoost searches 75 parameter combinations across five folds using all available CPU workers, and K-Means silhouette scoring uses the full AI training subset.
