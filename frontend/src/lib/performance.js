export const MODELS = { xgboost: 'XGBoost', logistic: 'Logistic regression' };
export const METRICS = { accuracy: 'Accuracy', precision: 'Precision', recall: 'Recall', f1: 'F1 score', roc_auc: 'ROC-AUC', average_precision: 'Average precision' };
export const AGREEMENT = { both_correct: 'Both correct', both_wrong: 'Both incorrect', xgboost_only: 'Only XGBoost correct', logistic_only: 'Only Logistic correct' };
export const DEFAULTS = { tab: 'overview', split: 'Test', level: 'document', model: 'xgboost', actual: 'all', predicted: 'all', outcome: 'all', agreement: 'all', score_min: '0', score_max: '1', q: '', sort: 'document_id', direction: 'asc', page: '1', page_size: '25' };
const choices = { tab: ['overview', 'explorer', 'comparison'], split: ['Test', 'Validation', 'Training', 'All'], level: ['document', 'sentence'], model: Object.keys(MODELS), actual: ['all', '0', '1'], predicted: ['all', '0', '1'], outcome: ['all', 'correct', 'incorrect', 'tp', 'tn', 'fp', 'fn'], agreement: ['all', ...Object.keys(AGREEMENT)], sort: ['score', 'correct', 'document_id', 'sentence_count'], direction: ['asc', 'desc'], page_size: ['10', '25', '50', '100'] };

export function readFilters(params) {
  const result = { ...DEFAULTS };
  for (const key of Object.keys(result)) {
    const value = params.get(key);
    if (value !== null && (!choices[key] || choices[key].includes(value))) result[key] = value;
  }
  for (const key of ['score_min', 'score_max']) {
    if (!Number.isFinite(Number(result[key])) || Number(result[key]) < 0 || Number(result[key]) > 1) result[key] = DEFAULTS[key];
  }
  if (+result.score_min > +result.score_max) { result.score_min = '0'; result.score_max = '1'; }
  if (!/^\d+$/.test(result.page) || +result.page < 1 || +result.page > 1000000) result.page = '1';
  result.q = result.q.slice(0, 200);
  return result;
}

// Matrix/category navigation deliberately clears old explorer-only filters so
// its count corresponds exactly to the cell/category that was selected.
export function drilldown(filters, selection) {
  return { ...DEFAULTS, split: filters.split, level: filters.level, model: filters.model, tab: 'explorer', ...selection };
}

export const percent = (value) => value == null ? 'Not defined' : `${(value * 100).toFixed(1)}%`;
export const labelName = (value) => Number(value) === 1 ? 'AI-generated' : 'Human-written';
export const count = (value) => Number(value || 0).toLocaleString();
