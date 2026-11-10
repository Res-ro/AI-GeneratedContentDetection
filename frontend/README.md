# AI Content Detector: Front End

React front end for the FastAPI back end in `../backend`. Built with the stack from the Week 8–9 lectures:
**React 19 + Vite**, **Material UI** (layout, Grid, breakpoints, AppBar), **React Router** (pages) and **D3** (chart scales).
The interface uses navy headings, indigo controls, lavender accents, and system sans-serif typography. The green / amber / red likelihood scale remains separate from the brand colours.

## Run it

Use **Node.js 20.19.x or >=22.12.0** (`node -v`), npm, and the Python 3.12 backend. Node 24.14.0 was used in the clean Windows verification. Start the backend using its separate [PowerShell, Linux Bash or Git Bash instructions](../backend/README-backend.md#installation-and-startup).

From the repository root, in a second terminal, **PowerShell**:

```powershell
cd frontend
npm ci
npm run dev
```

Or **Bash** (Linux or Windows Git Bash):

```bash
cd frontend
npm ci                              # installs the committed lockfile
npm run dev                         # open http://localhost:5173
```

Open the app at **http://localhost:5173** exactly. The back end's CORS setting only allows that origin, so
`http://127.0.0.1:5173` or another port will show "Can't reach the detection server". Vite is set to `strictPort`,
so it stops with an error instead of quietly moving to port 5174.

If the back end is somewhere else, copy `.env.example` to `.env.local` and change `VITE_API_BASE_URL`
(and add the front end's origin to `AIDETECT_CORS_ORIGINS` in the back end).

PowerShell: `Copy-Item .env.example .env.local`. Bash: `cp .env.example .env.local`. The example points to `http://localhost:8000`; restart Vite after changes. These values are public browser configuration, never secrets. `.env.local` is ignored. No environment file is needed for default local startup.

| Script | What it does |
| --- | --- |
| `npm start` / `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build on port 5173, with a strict Content-Security-Policy |

## Screens

| Route | Design screen | Requirement |
| --- | --- | --- |
| `/` | Homepage | Introduction, feature overview, how it works, and probabilistic-results disclaimer; no workspace sidebar |
| `/analyse` | Paste & Analyse | User input interface: paste or upload (.txt / .docx), live word and character count, model choice, Analyse disabled until the text is valid, status strip, Cancel, Undo after Clear |
| `/results/passage` | 2 Colour-Coded Passage | Results display: each sentence shaded by its score; click one to see its 12 writing-style signals |
| `/results/summary` | Overall Score & Confidence | Overall score, confidence range, classification donut, sentence progression, top-five ranking, grouped writing-style charts, and PDF export |
| `/history` | 4a Analysis History | Interactive dashboard: filter by score / date / file type, open, delete (with confirm), export CSV |
| `/results/feedback` | 4b Rate This Result | Feedback: thumbs up/down per sentence, 1–5 stars, optional comment |
| `/settings` | – | Default model, history on/off, clear saved data, server status and limits |
| `/model-performance` | Model Performance | Overview, Dataset Explorer and Model Comparison; opt-in backend data access, pagination and document inspection |
| any other address | – | 404 page |
| `/crash-test` (dev only) | – | Throws on purpose to show the error-fallback page |

## How one request flows

1. `src/pages/AnalysePage.jsx` – the form. `handleAnalyse()` calls `api.analyze(text, model)`.
2. `src/api/client.js` – `fetch` POST to `/api/analyze` with a 30 s timeout. Any non-2xx answer becomes an `ApiError`
   built from the back end's `{ error: { code, message, details }, request_id }` shape.
3. Back end: `routes.py` → `schemas.py` (validation, 422) → `model_service.py` → JSON response.
4. `src/context/AppContext.jsx` stores the result (and History, if on), then the router goes to `/results/passage`.
5. `src/lib/scoring.js` re-centres each sentence's probability around the model's own threshold, using the same
   formula as `recentre()` in `backend/app/score_math.py`, shared by inference and offline evaluation.
6. Errors are shown by `src/components/ApiErrorAlert.jsx` (plain-English title, server message, request reference).
   A render crash is caught by `src/components/ErrorBoundary.jsx`.

## Design decisions

- **Limits come from the server.** The form reads `GET /api/model-info` on start-up, so the 20–10,000 character limit and
  the 10-word sentence rule always match the back end. (The design deck says "5,000 words"; the back end's real limit is
  10,000 characters, so the counter shows both words and characters.)
- **Scores are re-centred.** XGBoost's threshold is 0.9 and logistic regression's is 0.4, so a raw 0.8 means opposite things.
  Every % on screen is an "AI score" where 50% = the model's threshold, matching the back end's `ai_score`.
- **Confidence range** = a 95% interval for the mean sentence score (mean ± 1.96 × standard error). The back end
  doesn't return a range, so the front end works it out from the sentence scores. With one sentence there is no range.
- **Uploads are read in the browser.** `.txt` and `.docx` (via `mammoth`) are turned into plain text and sent as JSON like
  pasted text. The server never receives a file, so the back end's "no file uploads" threat model still holds.
- **History and feedback live in `localStorage`.** They are not sent back to the server; Settings can turn History off or clear it. The backend separately uses a read-only SQLite snapshot for Model Performance. Text submitted for analysis is sent to the configured backend.

## Security notes (Assignment 3, section 2.3 minimums)

- **No HTML rendering of input.** All text is rendered through React, which escapes it. `dangerouslySetInnerHTML` is never used.
- **Front-end checks are for usability only.** The back end repeats every check (length, sentence rule, body size, rate limit).
- **CORS.** The back end allows only `http://localhost:5173`; the fixed port keeps the two in step.
- **No secrets in the front end.** `VITE_` variables are visible to anyone who loads the page, so only the API address goes there.
- **CSV export is safe to open in Excel.** Cells starting with `= + - @` are prefixed with `'`, so a crafted file name can't run as a formula.
- **Security headers.** `vite.config.js` sends `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and
  `Permissions-Policy`, and `npm run preview` adds a strict Content-Security-Policy. Use the preview build for the OWASP ZAP scan.
- **Dependencies.** Direct versions and the lockfile are pinned. Use `npm ci`, record dated `npm audit` output, and triage findings before submission. A previous audit result is not a guarantee about future advisories.
- The look-alike-character warning from the back end (`warnings`) is shown on every results screen, so the evasion
  defence is visible in the demo.

## Limitations

- History and feedback are per browser: they don't sync between devices, and the feedback isn't used to retrain the model yet.
- "Export Report (PDF)" uses the browser's print dialog (choose "Save as PDF") rather than generating a PDF file.
- Only `.txt` and `.docx` uploads; other formats need copy and paste.
- Sentence-based confidence intervals are descriptive and rely on assumptions about sentence independence; they are not validated authorship confidence intervals.
- Evaluation text is accessible only after backend opt-in. A public deployment requires distribution permission and server-side authentication/authorisation; hiding a navigation link or configuring CORS is insufficient.

## Results dashboard

The summary uses the existing re-centred sentence scores; it does not run inference again.

- The donut groups valid scores below 35%, from 35% to below 65%, and at least 65%. Select a segment or legend entry to list sentences; select it again to clear. Percentages describe sentence categories, not verified authorship.
- The progression chart keeps every valid sentence in document order. Dense charts scroll horizontally. Tab to a point, use arrow keys (or Home/End) to move, and Enter/Space to expand its sentence.
- The ranking lists up to five highest scores, with original analysed-sentence numbers distinct from ranks. Ties use sentence order.
- Both charts link to Passage using analysis ID and zero-based sentence index in the query string. The matching sentence is focused, scrolled into view, and highlighted; stale links for another analysis are ignored. Numbering excludes skipped sentences because the API does not provide their original positions.
- Writing-style groups use `feature_means`. Ratios use 0–100% axes; word counts and word lengths have separately labelled axes whose upper bounds come from observed sentence values. Missing values display “Not available”. These are descriptive measurements, not per-prediction attributions or reference-population comparisons.
- PDF output includes all writing-style groups and the full sentence list. The dense progression chart scales to the printed page.

Run `node --test src/lib/dashboard.test.js src/lib/performance.test.js`, then `npm run build`. Use `npm run preview` to inspect the production build. See the dated [finalisation record](../FINALISATION.md) for checks actually executed and remaining manual steps. Model Performance setup and its statistical caveats are in the [root README](../README.md#model-performance-and-dataset-explorer); API/security documentation, experiment commands, Harvard references and the team-confirmed AI declaration are in the [backend README](../backend/README-backend.md).
