/**
 * ResultsLayout – shared frame for Screens 2, 3 and 4b (nested routes).
 * Shows which text was analysed, any back-end warnings, and tabs to switch
 * between Passage, Summary and Feedback. The child screen gets the data from
 * useOutletContext(), so nothing is fetched twice.
 */
import { useMemo } from 'react';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import { RotateCcw, ScanText } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { sentenceScores } from '../lib/scoring.js';
import PageHeader from '../components/PageHeader.jsx';

const TABS = [
  { to: '/results/passage', label: 'Passage', overline: 'Screen 2 of 4 · Results display', title: 'Colour-Coded Passage' },
  {
    to: '/results/summary',
    label: 'Summary',
    overline: 'Screen 3 of 4 · Interactive dashboard',
    title: 'Overall Score & Confidence',
  },
  { to: '/results/feedback', label: 'Feedback', overline: 'Screen 4 of 4 (b) · Feedback', title: 'Rate This Result' },
];

const MODEL_LABEL = { xgboost: 'XGBoost', logistic: 'Logistic regression' };

export default function ResultsLayout() {
  const { current } = useApp();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tabIndex = Math.max(
    0,
    TABS.findIndex((t) => t.to === pathname),
  );
  const tab = TABS[tabIndex];

  const scores = useMemo(() => (current ? sentenceScores(current.result) : []), [current]);

  if (!current) {
    return (
      <>
        <PageHeader overline="Results" title="No results yet" />
        <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 }, textAlign: 'center' }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Analyse some text first, or open an earlier result from History.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'center' }}>
            <Button variant="contained" component={RouterLink} to="/" startIcon={<ScanText size={16} aria-hidden />}>
              Analyse text
            </Button>
            <Button variant="outlined" component={RouterLink} to="/history">
              Open History
            </Button>
          </Stack>
        </Paper>
      </>
    );
  }

  const { result } = current;

  return (
    <>
      <PageHeader
        overline={tab.overline}
        title={tab.title}
        action={
          <Button
            variant="outlined"
            className="no-print"
            startIcon={<RotateCcw size={16} aria-hidden />}
            onClick={() => navigate('/')}
          >
            Edit &amp; re-analyse
          </Button>
        }
      />

      <Paper variant="outlined" sx={{ mb: 2, overflow: 'hidden' }}>
        <Box sx={{ px: { xs: 2, sm: 3 }, pt: 1.5, pb: 0.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            <strong style={{ color: '#222' }}>{current.name}</strong> · {MODEL_LABEL[result.model] || result.model} ·{' '}
            {new Date(current.createdAt).toLocaleString()}
          </Typography>
        </Box>
        <Tabs
          value={tabIndex}
          variant="fullWidth"
          aria-label="Result views"
          className="no-print"
          sx={{ borderTop: 1, borderColor: 'divider', mt: 1 }}
        >
          {TABS.map((t) => (
            <Tab key={t.to} label={t.label} component={RouterLink} to={t.to} />
          ))}
        </Tabs>
      </Paper>

      {result.warnings?.length > 0 && (
        <Stack spacing={1} sx={{ mb: 2 }}>
          {result.warnings.map((w, i) => (
            <Alert key={i} severity="warning">
              {w}
            </Alert>
          ))}
        </Stack>
      )}

      <Outlet context={{ entry: current, result, scores }} />
    </>
  );
}
