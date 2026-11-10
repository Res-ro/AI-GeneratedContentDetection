# Assignment 3 finalisation record

Verified on **10 November 2026 (Australia/Sydney)** using native Windows, Python 3.12.10 and Node.js 24.14.0. This is a record of executed checks, not a guarantee of security or generalisation.

## Changes

- Corrected uvloop's Windows marker, retained existing dependency versions, added the frontend API `.env.example`, and documented separate PowerShell/Linux Bash/Windows Git Bash setup, including Visual C++/OpenMP runtime prerequisites.
- Added explicit Pydantic contracts, nested descriptions, illustrative examples and parameter/error documentation for all Model Performance responses. Existing paths, response fields and calculations remain compatible.
- Added an envelope adapter around existing Host/CORS checks and put request context/security headers outside middleware rejections. Invalid/negative/duplicate Content-Length is rejected. Error status codes, CORS policies, body limits and inference controls are preserved.
- Added bounded, explicitly invoked local DoS and repeated Unicode experiments, text-free CSV/JSON evidence and a standalone SVG plot. No production flag or saved model was changed.
- Updated architecture, SQLite threat analysis, section 2.7/2.8 documentation, Harvard references and team-confirmation AI declaration placeholders. Removed the checklist explicitly marked for removal and the confirmed-unreferenced `DistributionChart.jsx` component.
- Added regression coverage for OpenAPI contracts, middleware-only rejection paths, security defaults, experiment definitions and CLI limits.

No additional application or experiment dependencies were introduced. Experiments use existing httpx/model dependencies and the Python standard library; SVG plotting needs no new package. Existing development dependencies were installed in the verification environment.

## Files changed

| Change | Files |
| --- | --- |
| Created | `FINALISATION.md`, `backend/app/performance_schemas.py`, `backend/tests/test_finalisation.py`, `frontend/.env.example` |
| Created | `backend/experiments/__init__.py`, `backend/experiments/common.py`, `backend/experiments/measure_dos.py`, `backend/experiments/evaluate_unicode_evasion.py` |
| Modified documentation/configuration | `README.md`, `backend/README-backend.md`, `frontend/README.md`, `backend/requirements.txt`, `backend/.gitignore`, `frontend/.gitignore` |
| Modified API/error implementation | `backend/app/errors.py`, `backend/app/middleware.py`, `backend/app/performance_routes.py`, `backend/app/performance_store.py`, `backend/app/routes.py`, `backend/app/schemas.py` |
| Modified tests/comment | `backend/tests/test_api.py`, `frontend/src/lib/storage.js` (outdated database comment only) |
| Removed | `frontend/src/components/DistributionChart.jsx`; repository search confirmed no imports/references |

Model files, checksums, thresholds, score maths, inference service, gate/deadline implementation and Unicode normaliser have no changes in this finalisation diff. Archived models/results were retained.

## Executed verification

| Check | Result |
| --- | --- |
| Fresh native Windows environment (`backend/.validation-venv`) with both requirements files | Installation succeeded; uvloop was skipped by its marker; `pip check` found no broken requirements |
| Documented NLTK resource command | Succeeded outside the sandbox; existing `punkt`/`punkt_tab` resources were already up to date. This did not test a new empty NLTK resource cache |
| Backend `python -m pytest -q --tb=short` in the fresh environment | **63 passed** |
| Clean frontend copy, committed package/lockfile, `npm ci` | Succeeded; original workspace node_modules were not replaced |
| Frontend `node --test src/lib/dashboard.test.js src/lib/performance.test.js` | **10 passed** |
| Frontend production `npm run build` | Passed in the clean install copy |
| Backend startup | Actual Uvicorn children started successfully for experiments and browser QA; models verified/loaded |
| Swagger/OpenAPI | `/docs` and `/openapi.json` return 200; tests verify every API operation's summary, description, explicit response contract, examples, input descriptions and documented errors |
| Fixed-input predictions before/after | Both models' complete response values matched, excluding only `processing_ms`; XGBoost AI score 0.8719, logistic AI score 0.9710 on the regression passage (not dataset accuracy) |
| Real evaluation snapshot | Status, document/sentence summaries, filtered records and document detail return valid schema-conforming responses; disabled status checked separately |
| Browser live analysis/navigation | Analysis → Passage, Summary, Feedback, History, Settings, Model Performance and homepage passed, with no captured runtime/console errors |
| Browser evaluation interactions | Matrix/agreement drill-down, detail/next/close and filter preservation, sentence/document totals passed; no horizontal overflow at 320/390 px; desktop checked at 1440 px |
| Dependency audit | `pip-audit -r requirements.txt`: no known vulnerabilities among auditable dependencies; **en-core-web-sm 3.8.0 skipped because not on PyPI**. Its download SHA-256 remains pinned. Windows skips uvloop, so this is not a Linux uvloop audit |
| Frontend audit | `npm audit --json`: zero reported vulnerabilities at the time of this run |
| Repository hygiene | `git diff --check` passed; SQLite, experiment outputs and validation environments are ignored and not tracked; selected CSV/JSON evidence has no original/manipulated passage-text fields |

Windows sandbox restrictions initially blocked pytest temporary folders and Vite child processes; rerunning with the required native permissions passed. NLTK initially rejected the sandbox proxy; the ordinary downloader succeeded outside the sandbox without disabling its protections. These were environment restrictions, not suppressed test failures.

Linux installation/runtime and OWASP ZAP were **not executed**. Browser checks did not repeat every TXT/DOCX/PDF interaction; their implementation was unchanged. No authentication or public hosting review was performed. The clean frontend copy and regression/browser records are local ignored files under `data_visualisations/`.

## Reproduce security experiments

From `backend` with its environment activated (Linux/Git Bash), or replace `python` with `.\.venv\Scripts\python.exe` in PowerShell:

```bash
python experiments/measure_dos.py --run-local --trials 2
python experiments/evaluate_unicode_evasion.py --run-local --database data/model_performance.sqlite3 --split Test --model logistic --samples 8 --trials 2
```

See [backend README](backend/README-backend.md#defences-submitted-for-marking) for input format, limits, success definitions and interpretation. Each new run gets its own timestamped directory; run timing experiments separately from other heavy work.

### DoS evidence

Completed run: `backend/experiments/results/dos-20261110T111639144296Z/`.

Files: `summary.json`, `requests.csv`, per-trial server logs. Workload: XGBoost, 12 requests/trial, concurrency 8, 20 sentences/request, rate limit 20/minute in both conditions, two counterbalanced repeats. There were no analysis 429s, timeouts or other errors in this run.

| Trial | Guard | HTTP 200 | HTTP 503 | Median health latency |
| --- | --- | ---: | ---: | ---: |
| 1 | Off | 12 | 0 | 135.21 ms |
| 1 | On | 6 | 6 | 18.91 ms |
| 2 | On | 6 | 6 | 17.63 ms |
| 2 | Off | 12 | 0 | 126.94 ms |

The gate maintained faster health responses here by rejecting excess analyses. This trades availability for admitted work against rejecting legitimate bursts; it is not a claim that all clients received faster successful analysis. Full per-request distributions and denominators are in the evidence files. Earlier smoke/validation runs are retained locally but are not the selected evidence; this run uses the final scripts with limits protected from inherited environment overrides.

### Unicode evidence

Completed run: `backend/experiments/results/unicode-20261110T111540143259Z/`.

Files: `summary.json`, `results.csv`, `score_changes.svg`. Configuration: logistic regression, eight seeded class-balanced Test documents/retained prefixes, three deterministic manipulation variants, two repeats. **48 comparisons completed, zero condition errors.** Of 24 eligible AI attempts (four AI samples × three variants × two repeats), two changed a correctly detected AI verdict to human. With normalisation, zero of these 24 were successful; both observed flips were restored. The two successes repeat the same confusable condition, so they are not two independent documents. The confusable-only rate was 2/8; invisible-only and combined rates were each 0/8.

These are small repeated-sample results, not independent generalisation estimates or proof against arbitrary Unicode attacks. Scores alone were not counted as evasion. The early incomplete run (`unicode-20261110T105502781310Z`) inserted invisibles into every word, causing `InvalidTextError` in 32 conditions. It exited with failure and is **not selected as successful evidence**. The final deterministic variant inserts into every third word, leaving alphabetic tokens for the unnormalised model; no production validation was relaxed.

### Other local evidence

- `backend/experiments/results/pip-audit.json` and `npm-audit.json`: dated audit output, including skipped-package information.
- `data_visualisations/finalisation/regression.json`: fixed-response equality and real API checks.
- `data_visualisations/finalisation/browser-navigation.json`: final navigation results.
- `data_visualisations/performance-*.png`: ignored local QA screenshots. Dataset-detail screenshots may contain evaluation text; **do not publish them without permission**.

The selected experiment CSV/JSON/SVG files omit passage text, but retain sample identifiers and environment/provenance information. Review identifiers, logs and distribution permissions before sharing. Outputs remain ignored; choose approved evidence deliberately rather than force-adding the entire directory.

## Manual actions before submission

1. Complete the [generative AI declaration](backend/README-backend.md#generative-ai-declaration--team-confirmation-required) using actual team records and named human review.
2. Run and document Linux setup/runtime if cross-platform execution must be demonstrated; run OWASP ZAP and triage its findings. Review the spaCy-model audit coverage gap separately.
3. Review dataset/evidence distribution rights, then include the exact approved run files/configurations in the report/video. Do not claim that repeated trials are independent samples or that all manipulations succeeded.
4. Perform the final submission walkthrough, including TXT/DOCX input and print-to-PDF on the target machine. Keep production protections enabled and evaluation data private unless authorised access controls are deployed.
5. Review the diff and commit the finalisation changes when ready. Generated datasets, validation environments and private evidence should stay out of the source commit.
