# AI Content Detector: Front End

React front end for the FastAPI back end in `../backend`. Built with the stack from the Week 8–9 lectures:
**React 19 + Vite**, **Material UI** (layout, Grid, breakpoints, AppBar), **React Router** (pages) and **D3** (chart scales).
The look follows the group's prototype design deck (dark chrome, green / amber / red likelihood scale, Cambria headings, Calibri body).

## Run it

You need **Node.js 20.19+ or 22.12+** (`node -v`) and the back end running.

```bash
# Terminal 1: back end (see ../backend/README-backend.md for first-time setup)
cd backend
source .venv/bin/activate            # Windows: .venv\Scripts\activate
uvicorn app.main:app --port 8000 --no-server-header

# Terminal 2: front end
cd frontend
npm install                          # first time only
npm start                            # opens http://localhost:5173
```

Open the app at **http://localhost:5173** exactly. The back end's CORS setting only allows that origin, so
`http://127.0.0.1:5173` or another port will show "Can't reach the detection server". Vite is set to `strictPort`,
so it stops with an error instead of quietly moving to port 5174.

If the back end is somewhere else, copy `.env.example` to `.env.local` and change `VITE_API_BASE_URL`
(and add the front end's origin to `AIDETECT_CORS_ORIGINS` in the back end).

| Script | What it does |
| --- | --- |
| `npm start` / `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build on port 5173, with a strict Content-Security-Policy |

## Screens

| Route | Design screen | Requirement |
| --- | --- | --- |
| `/` | 1 Paste & Analyse | User input interface: paste or upload (.txt / .docx), live word and character count, model choice, Analyse disabled until the text is valid, status strip, Cancel, Undo after Clear |
| `/results/passage` | 2 Colour-Coded Passage | Results display: each sentence shaded by its score; click one to see its 12 writing-style signals |
| `/results/summary` | 3 Overall Score & Confidence | Interactive dashboard: overall %, confidence range, clickable distribution chart, Export Report (PDF) via the print dialog |
| `/history` | 4a Analysis History | Interactive dashboard: filter by score / date / file type, open, delete (with confirm), export CSV |
| `/results/feedback` | 4b Rate This Result | Feedback: thumbs up/down per sentence, 1–5 stars, optional comment |
| `/settings` | – | Default model, history on/off, clear saved data, server status and limits |
| any other address | – | 404 page |
| `/crash-test` (dev only) | – | Throws on purpose to show the error-fallback page |

## How one request flows (for the video)

1. `src/pages/AnalysePage.jsx` – the form. `handleAnalyse()` calls `api.analyze(text, model)`.
2. `src/api/client.js` – `fetch` POST to `/api/analyze` with a 30 s timeout. Any non-2xx answer becomes an `ApiError`
   built from the back end's `{ error: { code, message, details }, request_id }` shape.
3. Back end: `routes.py` → `schemas.py` (validation, 422) → `model_service.py` → JSON response.
4. `src/context/AppContext.jsx` stores the result (and History, if on), then the router goes to `/results/passage`.
5. `src/lib/scoring.js` re-centres each sentence's probability around the model's own threshold, using the same
   formula as `_recentre()` in `model_service.py`, so sentence colours and the overall score agree.
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
- **History and feedback live in `localStorage`.** The back end has no database. Nothing is sent anywhere, and
  Settings can turn History off or clear it.

## Security notes (Assignment 3, section 2.3 minimums)

- **No HTML rendering of input.** All text is rendered through React, which escapes it. `dangerouslySetInnerHTML` is never used.
- **Front-end checks are for usability only.** The back end repeats every check (length, sentence rule, body size, rate limit).
- **CORS.** The back end allows only `http://localhost:5173`; the fixed port keeps the two in step.
- **No secrets in the front end.** `VITE_` variables are visible to anyone who loads the page, so only the API address goes there.
- **CSV export is safe to open in Excel.** Cells starting with `= + - @` are prefixed with `'`, so a crafted file name can't run as a formula.
- **Security headers.** `vite.config.js` sends `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and
  `Permissions-Policy`, and `npm run preview` adds a strict Content-Security-Policy. Use the preview build for the OWASP ZAP scan.
- **Dependencies.** Versions are pinned exactly. `npm audit` reports 0 vulnerabilities (Vite is 8.3.5, which fixes the 8.3.0–8.3.2 advisories).
- The look-alike-character warning from the back end (`warnings`) is shown on every results screen, so the evasion
  defence is visible in the demo.

## Limitations

- History and feedback are per browser: they don't sync between devices, and the feedback isn't used to retrain the model yet.
- "Export Report (PDF)" uses the browser's print dialog (choose "Save as PDF") rather than generating a PDF file.
- Only `.txt` and `.docx` uploads; other formats need copy and paste.
