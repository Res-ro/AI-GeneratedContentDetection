import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, drilldown, readFilters, percent } from './performance.js';

test('evaluation defaults are held-out Test documents and XGBoost', () => {
  assert.deepEqual(readFilters(new URLSearchParams()), DEFAULTS);
});
test('matrix drilldown preserves split, level, model and clears conflicting filters', () => {
  const result = drilldown({ ...DEFAULTS, split: 'Validation', level: 'sentence', model: 'logistic', actual: '0', q: 'old', page: '5' }, { outcome: 'fn' });
  assert.equal(result.tab, 'explorer');
  assert.equal(result.level, 'sentence');
  assert.equal(result.split, 'Validation');
  assert.equal(result.model, 'logistic');
  assert.equal(result.outcome, 'fn');
  assert.equal(result.actual, 'all');
  assert.equal(result.q, '');
  assert.equal(result.page, '1');
});
test('comparison drilldown can select the matrix model or agreement category', () => {
  assert.equal(drilldown(DEFAULTS, { model: 'logistic', outcome: 'fp' }).model, 'logistic');
  const result = drilldown(DEFAULTS, { agreement: 'xgboost_only' });
  assert.equal(result.agreement, 'xgboost_only');
  assert.equal(result.outcome, 'all');
});
test('URL filter state survives navigation and rejects invalid values', () => {
  const state = { ...DEFAULTS, tab: 'explorer', q: 'zebra & other', page: '3', score_min: '.2', score_max: '.8', outcome: 'incorrect' };
  assert.deepEqual(readFilters(new URLSearchParams(state)), state);
  const invalid = readFilters(new URLSearchParams('level=invalid&model=bad&page=-2&score_min=.9&score_max=.1'));
  assert.equal(invalid.level, 'document');
  assert.equal(invalid.model, 'xgboost');
  assert.equal(invalid.page, '1');
  assert.equal(invalid.score_min, '0');
  assert.equal(invalid.score_max, '1');
  assert.equal(percent(null), 'Not defined');
  assert.equal(percent(0), '0.0%');
});
