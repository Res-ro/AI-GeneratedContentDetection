/**
 * scoring.js – turns the back end's numbers into what the screens show.
 *
 * Why re-centre? Each model has its own saved threshold (XGBoost 0.9,
 * logistic regression ~0.4). A raw 0.8 means "human" to XGBoost but "AI" to
 * logistic regression. The back end already re-centres the overall ai_score so
 * that 0.5 = the model's threshold; recentre() applies the SAME formula
 * (backend/app/model_service.py, _recentre) to each sentence so the sentence
 * colours and the overall score always agree.
 */

export function recentre(probability, threshold) {
  const t = Math.min(Math.max(threshold, 1e-6), 1 - 1e-6);
  return probability < t ? probability / (2 * t) : 0.5 + (probability - t) / (2 * (1 - t));
}

/** The traffic-light scale from the design: 0–35 human, 35–65 uncertain, 65–100 AI. */
export const BANDS = {
  human: { key: 'human', label: 'Human-likely', range: '0–35% AI score' },
  uncertain: { key: 'uncertain', label: 'Uncertain', range: '35–65% AI score' },
  ai: { key: 'ai', label: 'AI-likely', range: '65–100% AI score' },
};

export function bandFor(score) {
  if (score < 0.35) return BANDS.human;
  if (score < 0.65) return BANDS.uncertain;
  return BANDS.ai;
}

export const pct = (x) => `${Math.round(x * 100)}%`;

/** Sentence-level scores (0–1, re-centred) for one analysis result. */
export function sentenceScores(result) {
  return result.sentences.map((s) => ({
    ...s,
    score: recentre(s.ai_probability, result.threshold),
  }));
}

/** Plain-language headline for the overall estimate. */
export function overallLabel(result) {
  const band = bandFor(result.ai_score);
  if (band.key === 'ai') return 'likely AI-generated';
  if (band.key === 'human') return 'likely human-written';
  return result.verdict === 'ai_generated' ? 'uncertain, leans AI-generated' : 'uncertain, leans human-written';
}

/**
 * Confidence range for the overall score: a 95% interval for the mean of the
 * sentence scores (mean ± 1.96 × standard error). With few sentences, or
 * sentences that disagree, the range is wide, which is the honest answer.
 */
export function confidenceRange(scores) {
  const n = scores.length;
  if (n < 2) return null;
  const mean = scores.reduce((a, b) => a + b, 0) / n;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const half = 1.96 * Math.sqrt(variance / n);
  return { low: Math.max(0, mean - half), high: Math.min(1, mean + half) };
}

/** Five 20%-wide bins for the distribution chart. */
export const binIndex = (score) => Math.min(4, Math.max(0, Math.floor(score * 5)));

export function distribution(scores) {
  const bins = [0, 1, 2, 3, 4].map((i) => ({
    index: i,
    lo: i / 5,
    hi: (i + 1) / 5,
    label: `${i * 20}–${i * 20 + 20}%`,
    count: 0,
  }));
  for (const s of scores) bins[binIndex(s)].count += 1;
  return bins;
}

export const HIGH_CONFIDENCE = 0.8;

/** Friendly names for the 12 writing-style features (backend/app/features.py). */
export const FEATURE_INFO = {
  word_count: { label: 'Words in sentence', kind: 'count', help: 'How long the sentence is.' },
  avg_word_length: { label: 'Average word length', kind: 'chars', help: 'Longer words often mean more formal writing.' },
  lexical_diversity: { label: 'Vocabulary variety', kind: 'ratio', help: 'Share of words that are different from each other.' },
  stopword_ratio: { label: 'Common words', kind: 'ratio', help: 'Share of words like “the”, “and”, “of”.' },
  punctuation_ratio: { label: 'Punctuation', kind: 'ratio', help: 'Punctuation marks per token.' },
  contraction_ratio: { label: 'Contractions', kind: 'ratio', help: 'Words like “don’t” and “I’m”. People use more of these.' },
  transition_word_ratio: {
    label: 'Transition words',
    kind: 'ratio',
    help: '“However”, “furthermore”, “moreover”… AI text uses more of these.',
  },
  noun_ratio: { label: 'Nouns', kind: 'ratio', help: 'Share of words that are nouns.' },
  verb_ratio: { label: 'Verbs', kind: 'ratio', help: 'Share of words that are verbs.' },
  adjective_ratio: { label: 'Adjectives', kind: 'ratio', help: 'Share of words that are adjectives.' },
  adverb_ratio: { label: 'Adverbs', kind: 'ratio', help: 'Share of words that are adverbs.' },
  pronoun_ratio: { label: 'Pronouns', kind: 'ratio', help: '“I”, “she”, “they”… Personal writing uses more of these.' },
};

export function formatFeature(name, value) {
  const kind = FEATURE_INFO[name]?.kind;
  if (kind === 'ratio') return `${(value * 100).toFixed(1)}%`;
  if (kind === 'chars') return `${value.toFixed(1)} letters`;
  return String(Math.round(value));
}

/** Client-side checks. For usability only: the back end checks everything again. */
export function countWords(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function longestSentenceWords(text) {
  return text.split(/[.!?]+(?:\s|$)|\n{2,}/).reduce((max, s) => Math.max(max, countWords(s)), 0);
}
