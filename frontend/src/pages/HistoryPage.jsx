/**
 * Screen 4a – Analysis History (requirement: interactive dashboard).
 * Filter by score band, date and source; open, delete or export results.
 */
import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Download, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { bandFor } from '../lib/scoring.js';
import { downloadText, historyToCsv, loadHistory, removeFromHistory } from '../lib/storage.js';
import PageHeader from '../components/PageHeader.jsx';
import { ScoreBadge } from '../components/Likelihood.jsx';

const DAY = 24 * 60 * 60 * 1000;
const DATE_FILTERS = { all: Infinity, today: 1, week: 7, month: 30 };
const SOURCE_LABEL = { pasted: 'Pasted', txt: '.txt', docx: '.docx' };
const MODEL_LABEL = { xgboost: 'XGBoost', logistic: 'Logistic' };

function FilterSelect({ label, value, onChange, options }) {
  return (
    <TextField select size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ minWidth: 150 }}>
      {options.map(([v, text]) => (
        <MenuItem key={v} value={v}>
          {text}
        </MenuItem>
      ))}
    </TextField>
  );
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { setCurrent, current, settings } = useApp();
  const [entries, setEntries] = useState(loadHistory);
  const [scoreFilter, setScoreFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [toDelete, setToDelete] = useState(null);

  const filtered = useMemo(() => {
    const now = Date.now();
    return entries.filter((e) => {
      if (scoreFilter !== 'all' && bandFor(e.result.ai_score).key !== scoreFilter) return false;
      if (sourceFilter !== 'all' && e.source !== sourceFilter) return false;
      const days = DATE_FILTERS[dateFilter];
      if (days !== Infinity && now - new Date(e.createdAt).getTime() > days * DAY) return false;
      return true;
    });
  }, [entries, scoreFilter, dateFilter, sourceFilter]);

  function openEntry(entry) {
    setCurrent(entry);
    navigate('/results/passage');
  }

  function confirmDelete() {
    removeFromHistory(toDelete.id);
    if (current?.id === toDelete.id) setCurrent(null);
    setEntries(loadHistory());
    setToDelete(null);
  }

  function exportAll() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`ai-detection-history-${stamp}.csv`, historyToCsv(filtered));
  }

  const isFiltered = scoreFilter !== 'all' || dateFilter !== 'all' || sourceFilter !== 'all';

  return (
    <>
      <PageHeader
        overline="Screen 4 of 4 (a) · Interactive dashboard"
        title="Analysis History"
        subtitle="Saved in this browser only. Nothing here is sent to the server."
      />

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          useFlexGap
          sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap' }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            Filter:
          </Typography>
          <FilterSelect
            label="Score range"
            value={scoreFilter}
            onChange={setScoreFilter}
            options={[
              ['all', 'All scores'],
              ['human', 'Human-likely (0–35%)'],
              ['uncertain', 'Uncertain (35–65%)'],
              ['ai', 'AI-likely (65–100%)'],
            ]}
          />
          <FilterSelect
            label="Date"
            value={dateFilter}
            onChange={setDateFilter}
            options={[
              ['all', 'Any time'],
              ['today', 'Last 24 hours'],
              ['week', 'Last 7 days'],
              ['month', 'Last 30 days'],
            ]}
          />
          <FilterSelect
            label="File type"
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[
              ['all', 'All types'],
              ['pasted', 'Pasted text'],
              ['txt', '.txt'],
              ['docx', '.docx'],
            ]}
          />
          <Button
            variant="contained"
            startIcon={<Download size={16} aria-hidden />}
            onClick={exportAll}
            disabled={filtered.length === 0}
            sx={{ ml: { sm: 'auto !important' } }}
          >
            {isFiltered ? 'Export filtered' : 'Export All'}
          </Button>
        </Stack>

        {entries.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              {settings.saveHistory
                ? 'No analyses yet. Results appear here after you analyse some text.'
                : 'History is turned off in Settings, so new results are not saved.'}
            </Typography>
            <Button variant="outlined" component={RouterLink} to="/">
              Analyse text
            </Button>
          </Box>
        ) : filtered.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 5, textAlign: 'center' }}>
            No results match these filters.
          </Typography>
        ) : (
          <Box sx={{ overflowX: 'auto', mt: 2 }}>
            <Table size="small" aria-label="Past analyses">
              <TableHead>
                <TableRow>
                  <TableCell sx={headCell}>File</TableCell>
                  <TableCell sx={{ ...headCell, display: { xs: 'none', sm: 'table-cell' } }}>Analysed</TableCell>
                  <TableCell sx={{ ...headCell, display: { xs: 'none', sm: 'table-cell' } }}>Model</TableCell>
                  <TableCell sx={headCell}>AI score</TableCell>
                  <TableCell sx={headCell} align="right">
                    <Box
                      component="span"
                      sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
                    >
                      Actions
                    </Box>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id} hover selected={current?.id === e.id}>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <Button
                        variant="text"
                        onClick={() => openEntry(e)}
                        sx={{
                          p: 0,
                          minHeight: 0,
                          fontWeight: 600,
                          textAlign: 'left',
                          justifyContent: 'flex-start',
                          color: 'text.primary',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {e.name}
                      </Button>
                      <Typography variant="caption" color="text.secondary" component="div">
                        {SOURCE_LABEL[e.source] || e.source} · {e.result.sentence_count} sentences
                        <Box component="span" sx={{ display: { sm: 'none' } }}>
                          {' · '}
                          {new Date(e.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </Box>
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', display: { xs: 'none', sm: 'table-cell' } }}>
                      {new Date(e.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      {MODEL_LABEL[e.result.model] || e.result.model}
                    </TableCell>
                    <TableCell>
                      <ScoreBadge score={e.result.ai_score} variant="filled" />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Delete">
                        <IconButton aria-label={`Delete ${e.name}`} onClick={() => setToDelete(e)} size="small">
                          <Trash2 size={18} aria-hidden />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>

      <Dialog open={Boolean(toDelete)} onClose={() => setToDelete(null)} aria-labelledby="delete-title">
        <DialogTitle id="delete-title">Delete this result?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ overflowWrap: 'anywhere' }}>
            “{toDelete?.name}” will be removed from History. This can’t be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setToDelete(null)} autoFocus>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

const headCell = {
  fontWeight: 700,
  fontSize: '0.75rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'text.secondary',
};
