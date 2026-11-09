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

Note: Data processing downloads NLTK's `punkt` and `punkt_tab` resources automatically, so internet access is needed for the first download.

## Run data processing

Place the source dataset at `data/rawdata.csv`. It must contain these columns:

| Column | Expected contents |
| --- | --- |
| `text` | English document text |
| `label` | Numeric class label: `0` for human, `1` for AI-generated |
| `prompt_name`, `source`, `RDizzl3_seven` | Metadata columns required by the current script; their values are discarded |

Run:

```powershell
python DataProcessing.py
```


Outputs:

- `data/train_sentences.csv`, `data/test_sentences.csv`, and `data/val_sentences.csv`: sentences, labels, document IDs, and extracted features.
- `Class_Distribution.png`: class counts after document cleaning.
- Terminal output: split sizes, label proportions, sentence counts, and processing progress.

## Run model evaluation

Run data processing first, or use existing sentence CSVs with the same columns and all 12 features listed in `ModelEvaluation.py`. Run using:

```powershell
python ModelEvaluation.py
```


Outputs:

- `Models/`: `scaler.pkl`, `LogisticModel.pkl`, `KmeansModel.pkl`, `KmeansScaler.pkl`, `XGBModel.pkl`, and `metadata.pkl`.
- `model_evaluation/`: confusion matrices, cluster and PCA plots, precision-recall curves, and a model comparison chart.
- Terminal output: evaluation metrics, selected parameters and thresholds, cluster summaries, and XGBoost feature importance.

## Export saved-model predictions

Run this separate script using the existing processed datasets and saved models:

```powershell
python ExportModelPredictions.py
```

It saves `data_visualisations/model_predictions.csv`, combining training, validation, and test sentences. All original columns (features, `doc_ID`, `label`, sentence text, and any other metadata) are preserved, with three added columns:

- `split`: `Training`, `Validation`, or `Test`.
- `logistic_ai_probability`: logistic regression's estimated probability of AI-generated text.
- `xgboost_ai_probability`: XGBoost's estimated probability of AI-generated text.

Both probabilities range from 0 to 1 without thresholds or explicit rounding. The script reuses the saved scaler for logistic regression and unscaled features for XGBoost, in the saved feature order. It does not retrain models. Training estimates are in-sample; keep splits separate when assessing performance.

Use `--data-dir`, `--model-dir`, or `--output` to override the defaults. Reruns overwrite the output CSV. `DataVisualisation.py` remains a separate script for exploratory charts and summaries.
