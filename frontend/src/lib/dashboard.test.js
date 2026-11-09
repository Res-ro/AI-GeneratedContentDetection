import test from 'node:test';
import assert from 'node:assert/strict';
import { classificationGroups, featureMeasure, highestSentences, passageLink, validSentences } from './dashboard.js';
import { sentenceScores } from './scoring.js';

const sentence = (index, score) => ({ index, score, ai_probability: score, text: `Sentence ${index + 1}`, features: {} });

test('classification uses exact 35% and 65% boundaries without rounding', () => {
  const groups = classificationGroups([0, 0.34999, 0.35, 0.64999, 0.65, 1].map((score, i) => sentence(i, score)));
  assert.deepEqual(groups.map(g => g.count), [2, 2, 2]);
  assert.equal(groups.reduce((sum, g) => sum + g.share, 0), 1);
  assert.deepEqual(classificationGroups([]).map(g => g.share), [0, 0, 0]);
});

test('dashboard uses existing model-specific re-centering', () => {
  for (const threshold of [0.4, 0.9]) {
    const result = { threshold, sentences: [0, threshold, 1].map((value, i) => ({ ...sentence(i, 0), ai_probability: value })) };
    const scores = validSentences(sentenceScores(result));
    assert.deepEqual(scores.map(s => s.score), [0, 0.5, 1]);
    assert.deepEqual(classificationGroups(scores).map(g => g.count), [1, 1, 1]);
  }
});

test('invalid and duplicate data are excluded; valid rows retain document order', () => {
  const data = [sentence(7, 0.2), sentence(1, 0.4), sentence(2, NaN), sentence(3, Infinity), sentence(4, -0.2), sentence(5, 1.1), sentence(7, 0.8), { ...sentence(6, 0.2), ai_probability: null }];
  assert.deepEqual(validSentences(data).map(s => s.index), [1, 7]);
  assert.deepEqual(validSentences(), []);
});

test('ranking is descending, stable on ties, and preserves source rows', () => {
  const data = [sentence(6, 0.2), sentence(4, 1), sentence(2, 1), sentence(8, 0.9), sentence(1, 0.5), sentence(0, 0.6)];
  assert.deepEqual(highestSentences(data).map(s => s.index), [2, 4, 8, 0, 1]);
  assert.equal(data[0].index, 6);
  assert.equal(highestSentences([sentence(3, 0)]).length, 1);
  assert.deepEqual(highestSentences([]), []);
});

test('feature axes retain units and measured maxima; missing values are not zero', () => {
  const samples = [{ features: { word_count: 12 } }, { features: { word_count: 30 } }];
  const words = featureMeasure('word_count', { word_count: 21 }, samples);
  assert.equal(words.max, 30);
  assert.equal(words.value, 21);
  assert.equal(words.unit, 'words / sentence');
  const diversity = featureMeasure('lexical_diversity', { lexical_diversity: 0.72 });
  assert.equal(diversity.value, 72);
  assert.equal(diversity.max, 100);
  assert.equal(featureMeasure('avg_word_length', {}), null);
  assert.equal(featureMeasure('noun_ratio', { noun_ratio: null }), null);
  assert.equal(featureMeasure('noun_ratio', { noun_ratio: 0 }).value, 0);
});

test('sentence links retain zero-based index and scope selection to analysis', () => {
  const link = new URL(passageLink('entry & 1', 0), 'http://localhost');
  assert.equal(link.pathname, '/results/passage');
  assert.equal(link.searchParams.get('analysis'), 'entry & 1');
  assert.equal(link.searchParams.get('sentence'), '0');
});
