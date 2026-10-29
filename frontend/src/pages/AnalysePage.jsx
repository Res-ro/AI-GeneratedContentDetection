/**
 * Screen 1 – Paste & Analyse (requirement: user input interface).
 *
 * Usability (design deck): Analyse stays disabled until the text is valid
 * (error prevention over error messages), the word / character count is live,
 * and the status strip always says what the app is doing.
 *
 * Security: these checks are for the user's convenience only. The back end
 * checks length, content and size again, because an attacker can skip this
 * page entirely (Week 10 lecture).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, LinearProgress, MenuItem, Paper, Snackbar, Stack, TextField, Typography } from '@mui/material';
import { ArrowRight, Upload, X } from 'lucide-react';
import { api } from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { countWords, longestSentenceWords } from '../lib/scoring.js';
import { ACCEPTED, FileReadError, readTextFromFile } from '../lib/readFile.js';
import ApiErrorAlert from '../components/ApiErrorAlert.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { chrome, likelihood } from '../theme.js';

const DRAFT_KEY = 'aidetect.draft.v1';

const EXAMPLE_TEXT =
  'The committee met on Tuesday to review the quarterly budget and the hiring plan for next year. ' +
  'It is important to note that several factors must be considered before any final decision is made. ' +
  'Furthermore, the data clearly demonstrates a consistent upward trend across all measured categories. ' +
  'Sarah disagreed and asked for the raw numbers instead, because she didn’t trust the summary slides. ' +
  'In conclusion, this comprehensive analysis underscores the significance of continued strategic investment.';

function loadDraft() {
  try {
    return JSON.parse(window.sessionStorage.getItem(DRAFT_KEY)) || { text: '', fileName: null, source: 'pasted' };
  } catch {
    return { text: '', fileName: null, source: 'pasted' };
  }
}

function newId() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nameFor(text, fileName) {
  if (fileName) return fileName;
  const words = text.trim().split(/\s+/).slice(0, 6).join(' ');
  return `Pasted text: “${words}…”`;
}

export default function AnalysePage() {
  const navigate = useNavigate();
  const { limits, modelInfo, serverStatus, checkServer, settings, setCurrent } = useApp();

  const [draft, setDraft] = useState(loadDraft);
  const [model, setModel] = useState(settings.defaultModel);
  const [status, setStatus] = useState('idle'); // idle | reading | analysing
  const [error, setError] = useState(null); // ApiError from the server
  const [fileError, setFileError] = useState(null);
  const [undo, setUndo] = useState(null); // text removed by Clear, for the Undo button
  const abortRef = useRef(null);
  const fileInputRef = useRef(null);

  const { text } = draft;

  // Keep the draft if the user goes to Results and comes back ("Re-analyse").
  useEffect(() => {
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Not critical.
    }
  }, [draft]);

  // Cancel an in-flight request if the user leaves the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  // ---- live validation (usability only) ---------------------------------------
  const chars = text.trim().length;
  const words = countWords(text);
  const tooLong = chars > limits.max_text_chars;
  const tooShort = chars > 0 && chars < limits.min_text_chars;
  const noLongSentence = chars >= limits.min_text_chars && longestSentenceWords(text) < limits.min_sentence_words;
  const canAnalyse = chars > 0 && !tooLong && !tooShort && !noLongSentence && status === 'idle';

  let hint = `At least one sentence of ${limits.min_sentence_words}+ words. Shorter sentences are skipped.`;
  if (tooLong)
    hint = `That’s ${(chars - limits.max_text_chars).toLocaleString()} characters over the limit. Please shorten the text.`;
  else if (tooShort) hint = `Please enter at least ${limits.min_text_chars} characters.`;
  else if (noLongSentence) hint = `The model needs at least one sentence with ${limits.min_sentence_words} or more words.`;

  // ---- actions ------------------------------------------------------------------
  const setText = (value, extra = {}) => {
    setDraft((d) => ({ ...d, text: value, ...extra }));
    setError(null);
  };

  // Keep the file name while the user edits the uploaded text, but forget it
  // once they clear the box or paste over the start with something else.
  function handleTyping(value) {
    const head = draft.text.trim().slice(0, 20);
    const replaced = !value.trim() || (draft.fileName && head && !value.trimStart().startsWith(head));
    setText(value, replaced ? { fileName: null, source: 'pasted' } : {});
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow choosing the same file again
    if (!file) return;
    setFileError(null);
    setStatus('reading');
    try {
      const { text: fileText, source } = await readTextFromFile(file);
      setText(fileText.trim(), { fileName: file.name, source });
    } catch (err) {
      setFileError(err instanceof FileReadError ? err.message : 'That file couldn’t be read.');
    } finally {
      setStatus('idle');
    }
  }

  function handleClear() {
    setUndo(draft);
    setDraft({ text: '', fileName: null, source: 'pasted' });
    setError(null);
    setFileError(null);
  }

  async function handleAnalyse() {
    if (!canAnalyse) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('analysing');
    setError(null);
    try {
      const result = await api.analyze(text, model, { signal: controller.signal });
      const entry = {
        id: newId(),
        name: nameFor(text, draft.fileName),
        source: draft.fileName ? draft.source : 'pasted',
        createdAt: new Date().toISOString(),
        result,
      };
      setCurrent(entry, { save: true });
      navigate('/results/passage');
    } catch (err) {
      if (controller.signal.aborted) return; // user pressed Cancel
      setError(err);
      if (err.code === 'network') checkServer();
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStatus('idle');
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    setStatus('idle');
  }

  // ---- status strip -----------------------------------------------------------------
  let statusDot = likelihood.human.main;
  let statusText = 'Idle — accepts .txt, .docx, or pasted text. Analysis usually takes a few seconds.';
  if (status === 'reading') statusText = 'Reading file…';
  if (status === 'analysing') statusText = 'Analysing — splitting into sentences and scoring each one…';
  if (serverStatus === 'checking' && status === 'idle') {
    statusDot = chrome.mid;
    statusText = 'Connecting to the detection server…';
  }
  if (serverStatus === 'offline' && status === 'idle') {
    statusDot = likelihood.ai.main;
    statusText = 'The detection server isn’t responding. You can still type; Analyse will work once it’s back.';
  }

  const selectedModel = modelInfo?.models.find((m) => m.name === model);

  return (
    <>
      <PageHeader overline="Screen 1 of 4 · Analyse" title="Paste & Analyse" />

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h3" component="h2">
          Paste or upload the text you want to check
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Works with essays, articles, or any passage of English text.
        </Typography>

        <TextField
          id="text-input"
          label="Text to analyse"
          placeholder="Paste your text here — for example, an essay, report, or article draft…"
          multiline
          minRows={10}
          maxRows={22}
          fullWidth
          value={text}
          onChange={(e) => handleTyping(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAnalyse();
          }}
          disabled={status === 'analysing'}
          error={tooLong || tooShort || noLongSentence}
          helperText={hint}
          slotProps={{ htmlInput: { 'aria-describedby': 'text-count', spellCheck: false } }}
        />

        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mt: 0.5, minHeight: 24 }}
        >
          <Box>
            {draft.fileName && (
              <Typography variant="body2" color="text.secondary">
                From file: <strong>{draft.fileName}</strong>
              </Typography>
            )}
            {!text && (
              <Button size="small" onClick={() => setText(EXAMPLE_TEXT, { fileName: null, source: 'pasted' })} sx={{ px: 0.5 }}>
                Use an example text
              </Button>
            )}
          </Box>
          <Typography
            id="text-count"
            variant="body2"
            aria-live="polite"
            sx={{ color: tooLong ? 'error.main' : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
          >
            {words.toLocaleString()} words · {chars.toLocaleString()} / {limits.max_text_chars.toLocaleString()} characters
          </Typography>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, mt: 2.5 }}>
          <input ref={fileInputRef} type="file" accept={ACCEPTED} hidden onChange={handleFile} />
          <Button
            variant="outlined"
            startIcon={<Upload size={16} aria-hidden />}
            onClick={() => fileInputRef.current?.click()}
            disabled={status !== 'idle'}
          >
            Upload File
          </Button>
          <Button variant="text" color="secondary" onClick={handleClear} disabled={!text || status === 'analysing'}>
            Clear
          </Button>

          <TextField
            select
            size="small"
            label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={status === 'analysing'}
            sx={{ minWidth: 200, ml: { sm: 'auto !important' } }}
          >
            {(
              modelInfo?.models || [
                { name: 'xgboost', label: 'XGBoost' },
                { name: 'logistic', label: 'Logistic regression' },
              ]
            ).map((m) => (
              <MenuItem key={m.name} value={m.name}>
                {m.label}
              </MenuItem>
            ))}
          </TextField>

          {status === 'analysing' ? (
            <Button variant="outlined" color="inherit" startIcon={<X size={16} aria-hidden />} onClick={handleCancel}>
              Cancel
            </Button>
          ) : (
            <Button
              variant="contained"
              size="large"
              endIcon={<ArrowRight size={18} aria-hidden />}
              disabled={!canAnalyse}
              onClick={handleAnalyse}
            >
              Analyse Text
            </Button>
          )}
        </Stack>

        {selectedModel && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1, textAlign: { sm: 'right' } }}>
            {selectedModel.description}
          </Typography>
        )}

        <Stack spacing={1.5} sx={{ mt: 2 }}>
          {fileError && (
            <Alert severity="error" onClose={() => setFileError(null)}>
              {fileError}
            </Alert>
          )}
          <ApiErrorAlert error={error} onRetry={handleAnalyse} onClose={() => setError(null)} />
        </Stack>

        <Box sx={{ mt: 2.5, bgcolor: chrome.surface, borderRadius: 1, overflow: 'hidden' }}>
          {status === 'analysing' && <LinearProgress aria-label="Analysing" />}
          <Box sx={{ px: 2, py: 1.25 }} role="status" aria-live="polite">
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Box
                component="span"
                aria-hidden
                sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: statusDot, flexShrink: 0 }}
              />
              <Typography variant="body2">{statusText}</Typography>
              {serverStatus === 'offline' && status === 'idle' && (
                <Button size="small" onClick={checkServer} sx={{ ml: 'auto' }}>
                  Retry
                </Button>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ fontStyle: 'italic', mt: 0.25 }}>
              Analyse stays disabled until the text is ready. Tip: Ctrl + Enter also analyses.
            </Typography>
          </Box>
        </Box>
      </Paper>

      <Snackbar
        open={Boolean(undo)}
        autoHideDuration={6000}
        onClose={() => setUndo(null)}
        message="Text cleared"
        action={
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              setDraft(undo);
              setUndo(null);
            }}
          >
            Undo
          </Button>
        }
        sx={{ bottom: { xs: 72, md: 24 } }}
      />
    </>
  );
}
