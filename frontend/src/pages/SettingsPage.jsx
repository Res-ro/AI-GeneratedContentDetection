/**
 * Settings – default model, history on/off, clear saved data, server status.
 */
import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { API_BASE_URL } from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import { clearFeedback, clearHistory } from '../lib/storage.js';
import PageHeader from '../components/PageHeader.jsx';

export default function SettingsPage() {
  const { settings, setSettings, modelInfo, serverStatus, checkServer, setCurrent } = useApp();
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);

  function handleClear() {
    clearHistory();
    clearFeedback();
    setCurrent(null);
    setConfirmClear(false);
    setCleared(true);
  }

  const statusChip = {
    online: <Chip size="small" color="success" label="Online" />,
    offline: <Chip size="small" color="error" label="Offline" />,
    checking: <Chip size="small" label="Checking…" />,
  }[serverStatus];

  return (
    <>
      <PageHeader overline="Settings" title="Settings" />
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={3} divider={<Divider />}>
          <Box>
            <Typography variant="h4" component="h2" gutterBottom>
              Default model
            </Typography>
            <TextField
              select
              size="small"
              value={settings.defaultModel}
              onChange={(e) => setSettings({ defaultModel: e.target.value })}
              sx={{ minWidth: 240 }}
              label="Model"
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
            {modelInfo?.models.map((m) => (
              <Typography key={m.name} variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                <strong>{m.label}</strong> (threshold {m.threshold}): {m.description}
              </Typography>
            ))}
          </Box>

          <Box>
            <Typography variant="h4" component="h2" gutterBottom>
              History &amp; privacy
            </Typography>
            <FormControlLabel
              control={<Switch checked={settings.saveHistory} onChange={(e) => setSettings({ saveHistory: e.target.checked })} />}
              label="Save results to History on this device"
            />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              History and feedback stay in this browser. The server does not keep your text.
            </Typography>
            <Button variant="outlined" color="error" onClick={() => setConfirmClear(true)}>
              Clear history and feedback
            </Button>
            {cleared && (
              <Typography variant="body2" sx={{ mt: 1 }} role="status">
                Cleared.
              </Typography>
            )}
          </Box>

          <Box>
            <Typography variant="h4" component="h2" gutterBottom>
              Detection server
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
              {statusChip}
              <Typography variant="body2" sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                {API_BASE_URL}
              </Typography>
              <Button size="small" onClick={checkServer}>
                Check again
              </Button>
            </Stack>
            {modelInfo && (
              <Typography variant="body2" color="text.secondary">
                Limits: {modelInfo.limits.min_text_chars}–{modelInfo.limits.max_text_chars.toLocaleString()} characters, up to{' '}
                {modelInfo.limits.max_sentences} sentences; sentences under {modelInfo.limits.min_sentence_words} words are
                skipped. Look-alike character protection: {modelInfo.normalisation_enabled ? 'on' : 'off'}.
              </Typography>
            )}
          </Box>
        </Stack>
      </Paper>

      <Dialog open={confirmClear} onClose={() => setConfirmClear(false)} aria-labelledby="clear-title">
        <DialogTitle id="clear-title">Clear all saved results?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Every saved analysis and all feedback in this browser will be deleted. This can’t be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClear(false)} autoFocus>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={handleClear}>
            Clear everything
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
