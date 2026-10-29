/**
 * client.js – every call to the FastAPI back end goes through here.
 *
 * The back end returns one error shape for every failure:
 *   { "error": { "code", "message", "details": [{ field, message }] }, "request_id" }
 * request() turns that (and network failures / timeouts) into an ApiError,
 * so the pages only ever deal with one kind of error.
 */

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

const DEFAULT_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  constructor({ status, code, message, details = [], requestId = null, retryAfter = null }) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // 0 = never reached the server
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    this.retryAfter = retryAfter; // seconds, from the Retry-After header (429 / 503)
  }
}

/** Plain-English titles for each back-end error code. */
const TITLES = {
  network: 'Can’t reach the detection server',
  timeout: 'The server took too long to answer',
  validation_error: 'Please check your text',
  invalid_text: 'Please check your text',
  payload_too_large: 'That text is too long',
  rate_limited: 'Too many checks in a short time',
  service_busy: 'The server is busy',
  analysis_timeout: 'The analysis took too long',
  model_unavailable: 'The model isn’t available',
  internal_error: 'Something went wrong on the server',
};

export function errorTitle(error) {
  return TITLES[error?.code] || 'The request could not be completed';
}

/** Turn Pydantic field messages into sentences a user understands. */
function friendlyDetail(detail) {
  const msg = detail?.message || '';
  if (/at least \d+ character/i.test(msg)) return msg.replace(/^String should have/, 'The text needs');
  if (/at most \d+ character/i.test(msg)) return msg.replace(/^String should have/, 'The text can have');
  if (/Input should be 'xgboost' or 'logistic'/.test(msg)) return 'Choose one of the listed models.';
  return msg;
}

async function request(path, { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  // One AbortController handles both the caller's Cancel button and our timeout.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener('abort', onCallerAbort);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: 'omit', // no cookies: the API has no accounts
    });
  } catch (err) {
    if (signal?.aborted) throw err; // the user pressed Cancel: let the caller ignore it
    if (timedOut) {
      throw new ApiError({ status: 0, code: 'timeout', message: 'No answer after 30 seconds. Please try again.' });
    }
    throw new ApiError({
      status: 0,
      code: 'network',
      message: 'Check that the back end is running (uvicorn on port 8000) and that this page is open at http://localhost:5173.',
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Not JSON (for example a proxy error page). Handled below.
  }

  if (!response.ok) {
    const err = data?.error;
    const retryAfter = Number(response.headers.get('Retry-After')) || null;
    let message = err?.message || `The server answered with status ${response.status}.`;
    if (retryAfter && (response.status === 429 || response.status === 503)) {
      message += ` Try again in ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`;
    }
    throw new ApiError({
      status: response.status,
      code: err?.code || 'http_error',
      message,
      details: (err?.details || []).map((d) => ({ field: d.field, message: friendlyDetail(d) })),
      requestId: data?.request_id || null,
      retryAfter,
    });
  }
  if (data === null) {
    throw new ApiError({ status: response.status, code: 'bad_response', message: 'The server sent an unreadable answer.' });
  }
  return data;
}

export const api = {
  health: (opts) => request('/api/health', { timeoutMs: 5000, ...opts }),
  modelInfo: (opts) => request('/api/model-info', { timeoutMs: 8000, ...opts }),
  analyze: (text, model, opts) => request('/api/analyze', { method: 'POST', body: { text, model }, ...opts }),
};
