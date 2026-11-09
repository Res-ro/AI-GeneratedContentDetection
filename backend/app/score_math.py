"""Shared score transformation for inference and offline evaluation."""
import numpy as np


def recentre(probabilities, threshold: float):
    """Map the saved raw decision threshold to 0.5 (not a calibration)."""
    t = min(max(threshold, 1e-6), 1 - 1e-6)
    probabilities = np.asarray(probabilities)
    return np.where(probabilities < t, probabilities / (2 * t),
                    0.5 + (probabilities - t) / (2 * (1 - t)))
