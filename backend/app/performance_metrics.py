"""Offline metrics. AI is the positive class; undefined metrics are null."""
import numpy as np
from sklearn.metrics import average_precision_score, roc_auc_score


def metrics(labels, scores):
    labels, scores = np.asarray(labels, dtype=int), np.asarray(scores, dtype=float)
    predicted = scores >= 0.5
    tp = int(((labels == 1) & predicted).sum())
    tn = int(((labels == 0) & ~predicted).sum())
    fp = int(((labels == 0) & predicted).sum())
    fn = int(((labels == 1) & ~predicted).sum())
    total = len(labels)
    divide = lambda n, d: n / d if d else None
    return {
        'total': total, 'correct': tp + tn, 'incorrect': fp + fn,
        'accuracy': divide(tp + tn, total), 'precision': divide(tp, tp + fp),
        'recall': divide(tp, tp + fn), 'f1': divide(2 * tp, 2 * tp + fp + fn),
        'roc_auc': float(roc_auc_score(labels, scores)) if len(set(labels)) == 2 else None,
        'average_precision': float(average_precision_score(labels, scores)) if tp + fn else None,
        'confusion': {'tp': tp, 'tn': tn, 'fp': fp, 'fn': fn},
        'histogram': {str(label): np.histogram(scores[labels == label], bins=np.linspace(0, 1, 11))[0].tolist() for label in (0, 1)},
    }
