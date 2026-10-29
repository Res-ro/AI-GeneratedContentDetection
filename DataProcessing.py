# Prepare document splits, extract sentence features, and save evaluation inputs.
import pandas as pd
from sklearn.model_selection import train_test_split
import nltk
from nltk.tokenize import sent_tokenize
import spacy
import re
import string
import matplotlib
matplotlib.use("Agg")  # Save plots without creating Tkinter GUI objects.
import matplotlib.pyplot as plt


# Download sentence-tokenizer resources if they are not already cached locally.
nltk.download('punkt')
nltk.download('punkt_tab')

# All file paths are relative to the project directory used to run this script.
df = pd.read_csv('data/rawdata.csv')

# Remove missing/blank examples and metadata that is not used for modelling.
df.columns = df.columns.str.strip()
df =df.dropna(subset=['text', 'label'])
df['text'] = df['text'].str.strip()
df = df[df['text'] != '']
df = df.drop(columns=['prompt_name', 'source', 'RDizzl3_seven'])
df = df.reset_index(drop=True)


# Keep one copy of each document, then retain its ID through sentence expansion.
df = df.drop_duplicates(subset=['text'])
df["doc_ID"] = df.index
# Visualise class balance after cleaning: 0 = human, 1 = AI-generated.
label_counts = df['label'].value_counts()
plt.figure()
label_counts.plot(kind="bar", color="skyblue", edgecolor="black")
plt.title("Distribution of AI and Human Labels")
plt.xlabel('Class Labels')
plt.ylabel('Count')
plt.xticks(rotation=0)
plt.savefig("Class_Distribution.png")
plt.close()

# Split documents before sentences so the same document cannot cross splits.
# Stratification preserves label proportions in the 70%/15%/15% splits.
train_df, tmp_df = train_test_split(df, test_size=0.3, random_state=42, stratify=df['label'])
test_df, val_df = train_test_split(tmp_df, test_size=0.5, random_state=42, stratify=tmp_df['label'])

print("Training set size:", len(train_df))
print("Test set size:", len(test_df))
print("Validation set size:", len(val_df))
print("Training set label distribution:\n", train_df['label'].value_counts(normalize=True))
print("Test set label distribution:\n", test_df['label'].value_counts(normalize=True))
print("Validation set label distribution:\n", val_df['label'].value_counts(normalize=True))

def split_sentences(df):
    # Expand each document into rows that inherit its label and doc_ID.
    data = df.copy()
    data['sentence'] = data['text'].apply(sent_tokenize)
    data = data.explode('sentence')
    data = data.dropna(subset=['sentence'])
    data['sentence'] = data['sentence'].str.strip()
    data= data[data['sentence'] != '']
    # Discard short sentences that provide little evidence for feature extraction.
    min_length = 10
    data = data[data['sentence'].str.split().str.len() >= min_length]
    return data

train_sentences = split_sentences(train_df)
test_sentences = split_sentences(test_df)
val_sentences = split_sentences(val_df)
train_sentences = train_sentences.drop(columns=['text'])
test_sentences = test_sentences.drop(columns=['text'])
val_sentences = val_sentences.drop(columns=['text'])

print("Training sentences size:", len(train_sentences))
print("Test sentences size:", len(test_sentences))
print("Validation sentences size:", len(val_sentences))

# Fixed lexical cues used alongside spaCy's grammatical annotations.
contraction_pattern = r"\b\w+(?:n't|'re|'ve|'ll|'d|'s|'m)\b"

transition_words = [
    'however', 'therefore', 'moreover', 'consequently', 'nevertheless',
    'furthermore', 'thus', 'hence', 'nonetheless', 'accordingly', 'finally'
]
def extract_features(sentence, doc):
    # Count alphabetic tokens only; normalise casing for vocabulary statistics.
    words = [token for token in doc if token.is_alpha]
    word_strings = [token.text.lower() for token in words]
    word_count = len(words)
    avg_word_length = sum(len(token) for token in word_strings) / word_count if word_count > 0 else 0

    # Punctuation is measured per character; lexical/POS ratios are per word.
    # Guard denominators so sentences without alphabetic tokens remain valid.
    punctuation_count = sum(1 for char in sentence if char in string.punctuation)
    punctuation_ratio = punctuation_count / len(sentence) if len(sentence) > 0 else 0
    contractions = re.findall(contraction_pattern, sentence.lower())
    contraction_ratio = len(contractions) / word_count if word_count > 0 else 0
    transition_word_count = sum(1 for word in word_strings if word in transition_words)
    transition_word_ratio = transition_word_count / word_count if word_count > 0 else 0
    # Include proper nouns with nouns and auxiliary verbs with verbs.
    noun_ratio = sum(token.pos_ in {"NOUN", "PROPN"} for token in words) / word_count if word_count > 0 else 0
    verb_ratio = sum(token.pos_ in {"VERB", "AUX"} for token in words) / word_count if word_count > 0 else 0
    adjective_ratio = sum(token.pos_ == "ADJ" for token in words) / word_count if word_count > 0 else 0
    # Lexical diversity is the fraction of words with distinct lowercase forms.
    lexical_diversity = (
        len(set(word_strings)) / word_count if word_count > 0 else 0
    )
    stopword_ratio = (
        sum(token.is_stop for token in words) / word_count if word_count > 0 else 0
    )
    adverb_ratio = (
        sum(token.pos_ == "ADV" for token in words) / word_count if word_count > 0 else 0
    )
    pronoun_ratio = (
        sum(token.pos_ == "PRON" for token in words) / word_count if word_count > 0 else 0
    )

    return {
        'word_count': word_count,
        'avg_word_length': avg_word_length,
        'lexical_diversity': lexical_diversity,
        'stopword_ratio': stopword_ratio,
        'punctuation_ratio': punctuation_ratio,
        'contraction_ratio': contraction_ratio,
        'transition_word_ratio': transition_word_ratio,
        'noun_ratio': noun_ratio,
        'verb_ratio': verb_ratio,
        'adjective_ratio': adjective_ratio,
        'adverb_ratio': adverb_ratio,
        'pronoun_ratio': pronoun_ratio
    }


# Keep POS tagging but skip unused components to reduce processing time.
nlp = spacy.load("en_core_web_sm", disable=["ner", "parser", "lemmatizer"])
def process_sentences(df):
    # Batch NLP processing while preserving the input sentence order.
    features_list = []
    for sentence, doc in zip(
        df['sentence'],
        nlp.pipe(df['sentence'], batch_size=256)
    ):
        features = extract_features(sentence, doc)
        features_list.append(features)
        if len(features_list) % 1000 == 0:
            print(f"Processed {len(features_list):,} / {len(df):,} sentences")
    return features_list

train_features = process_sentences(train_sentences)
test_features = process_sentences(test_sentences)
val_features = process_sentences(val_sentences)

train_features_df = pd.DataFrame(train_features)
test_features_df = pd.DataFrame(test_features)
val_features_df = pd.DataFrame(val_features)

# Align row indexes before joining each sentence to its extracted features.
train_sentences = pd.concat([train_sentences.reset_index(drop=True), train_features_df], axis=1)
test_sentences = pd.concat([test_sentences.reset_index(drop=True), test_features_df], axis=1)
val_sentences = pd.concat([val_sentences.reset_index(drop=True), val_features_df], axis=1)

# These three files are the inputs to ModelEvaluation.py; reruns overwrite them.
train_sentences.to_csv('data/train_sentences.csv', index=False)
test_sentences.to_csv('data/test_sentences.csv', index=False)
val_sentences.to_csv('data/val_sentences.csv', index=False)
