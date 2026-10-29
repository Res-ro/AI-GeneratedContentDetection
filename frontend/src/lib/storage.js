/**
 * storage.js – History, feedback and settings, kept in this browser only.
 *
 * The back end has no database (see its threat model), so nothing here is
 * sent anywhere. localStorage can be full, disabled or cleared, so every read
 * and write is wrapped and the app still works without it.
 */

const KEYS = {
  history: 'aidetect.history.v1',
  feedback: 'aidetect.feedback.v1',
  settings: 'aidetect.settings.v1',
};

const MAX_HISTORY = 50;

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // quota full or storage blocked: carry on without saving
  }
}

// ---- Settings ----------------------------------------------------------------
export const DEFAULT_SETTINGS = { defaultModel: 'xgboost', saveHistory: true };

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
}

export function saveSettings(settings) {
  return write(KEYS.settings, settings);
}

// ---- History -----------------------------------------------------------------
export function loadHistory() {
  const list = read(KEYS.history, []);
  return Array.isArray(list) ? list : [];
}

export function addToHistory(entry) {
  const list = [entry, ...loadHistory().filter((e) => e.id !== entry.id)].slice(0, MAX_HISTORY);
  // If storage is full, drop the oldest entries until it fits.
  for (let keep = list.length; keep > 0; keep -= 5) {
    if (write(KEYS.history, list.slice(0, keep))) return true;
  }
  return false;
}

export function removeFromHistory(id) {
  write(
    KEYS.history,
    loadHistory().filter((e) => e.id !== id),
  );
}

export function clearHistory() {
  write(KEYS.history, []);
}

// ---- Feedback ----------------------------------------------------------------
export function loadFeedback() {
  const list = read(KEYS.feedback, []);
  return Array.isArray(list) ? list : [];
}

export function saveFeedback(item) {
  const list = [item, ...loadFeedback().filter((f) => f.analysisId !== item.analysisId)].slice(0, 200);
  return write(KEYS.feedback, list);
}

export function feedbackFor(analysisId) {
  return loadFeedback().find((f) => f.analysisId === analysisId) || null;
}

export function clearFeedback() {
  write(KEYS.feedback, []);
}

// ---- CSV export ----------------------------------------------------------------
/**
 * Spreadsheet apps run cells that start with = + - @ as formulas, so a file
 * name like "=HYPERLINK(...)" could do something nasty when the CSV is opened.
 * Prefixing those cells with an apostrophe makes them plain text.
 */
function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function historyToCsv(entries) {
  const header = ['name', 'source', 'analysed_at', 'model', 'ai_score_percent', 'verdict', 'sentences', 'words'];
  const rows = entries.map((e) => [
    e.name,
    e.source,
    new Date(e.createdAt).toISOString(),
    e.result.model,
    Math.round(e.result.ai_score * 100),
    e.result.verdict,
    e.result.sentence_count,
    e.result.word_count,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function downloadText(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
