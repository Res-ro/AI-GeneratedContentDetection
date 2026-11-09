import { BANDS, FEATURE_INFO, bandFor } from './scoring.js';

export function validSentences(scores = []) {
  const seen = new Set();
  return scores.filter(s => {
    const valid = Number.isInteger(s.index) && s.index >= 0 && !seen.has(s.index)
      && typeof s.text === 'string' && Number.isFinite(s.ai_probability)
      && s.ai_probability >= 0 && s.ai_probability <= 1
      && Number.isFinite(s.score) && s.score >= 0 && s.score <= 1;
    if (valid) seen.add(s.index);
    return valid;
  }).sort((a, b) => a.index - b.index);
}

export function classificationGroups(scores) {
  return Object.values(BANDS).map(band => {
    const sentences = scores.filter(s => bandFor(s.score).key === band.key);
    return { ...band, sentences, count: sentences.length, share: scores.length ? sentences.length / scores.length : 0 };
  });
}

export function highestSentences(scores) {
  return [...scores].sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 5);
}

export const preview = text => text.length > 150 ? `${text.slice(0, 147)}…` : text;
export const passageLink = (entryId, index) => `/results/passage?${new URLSearchParams({ analysis: entryId, sentence: String(index) })}`;

export const STYLE_GROUPS = [
  { label: 'Vocabulary & structure', features: ['word_count', 'avg_word_length', 'lexical_diversity'] },
  { label: 'Writing patterns', features: ['stopword_ratio', 'contraction_ratio', 'transition_word_ratio', 'punctuation_ratio'] },
  { label: 'Grammar', features: ['noun_ratio', 'verb_ratio', 'adjective_ratio', 'adverb_ratio', 'pronoun_ratio'] },
];

export function featureMeasure(name, means = {}, sentences = []) {
  const value = means[name];
  const ratio = FEATURE_INFO[name].kind === 'ratio';
  if (!Number.isFinite(value) || value < 0 || (ratio && value > 1)) return null;
  if (ratio) return { value: value * 100, max: 100, unit: '%', label: `${(value * 100).toFixed(1)}%`, scale: '0–100%' };
  const samples = sentences.map(s => s.features?.[name]).filter(v => Number.isFinite(v) && v >= 0);
  const max = Math.max(1, value, ...samples);
  const unit = name === 'word_count' ? 'words / sentence' : 'letters / word';
  return { value, max, unit, label: `${value.toFixed(1)} ${unit}`,
    scale: `0–${max.toFixed(1)} ${unit}; upper bound is the largest observed sentence value${samples.length ? '' : ' available (the mean)'}` };
}
