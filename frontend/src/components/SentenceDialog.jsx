/**
 * SentenceDialog – "the writing-style signals behind its score".
 * Opens when a sentence is clicked on the Passage screen.
 */
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { FEATURE_INFO, bandFor, formatFeature, pct } from '../lib/scoring.js';
import { likelihood } from '../theme.js';
import { ScoreBadge } from './Likelihood.jsx';

export default function SentenceDialog({ sentence, result, onClose }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  if (!sentence) return null;

  const band = bandFor(sentence.score);
  const c = likelihood[band.key];

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth aria-labelledby="sentence-dialog-title">
      <DialogTitle id="sentence-dialog-title" sx={{ fontFamily: theme.typography.h3.fontFamily }}>
        Sentence {sentence.index + 1}: why this score?
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ bgcolor: c.bg, borderLeft: `4px solid ${c.main}`, p: 1.5, borderRadius: 1, mb: 2 }}>
          <Typography sx={{ overflowWrap: 'anywhere' }}>{sentence.text}</Typography>
        </Box>

        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
          <ScoreBadge score={sentence.score} variant="filled" />
          <Typography sx={{ fontWeight: 700, color: c.text }}>{band.label}</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The model gave this sentence a raw probability of {pct(sentence.ai_probability)}. Its decision threshold is{' '}
          {pct(result.threshold)}, so the score is re-scaled to make {pct(result.threshold)} sit at 50%.
          {sentence.style_cluster != null && ` It matches AI writing-style group ${sentence.style_cluster + 1}.`}
        </Typography>

        <Typography variant="h4" component="h3" sx={{ mb: 1 }}>
          Writing-style signals
        </Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label="Writing-style features for this sentence">
            <TableHead>
              <TableRow>
                <TableCell>Signal</TableCell>
                <TableCell align="right">This sentence</TableCell>
                <TableCell align="right">Text average</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(sentence.features).map(([name, value]) => (
                <TableRow key={name}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {FEATURE_INFO[name]?.label || name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {FEATURE_INFO[name]?.help}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {formatFeature(name, value)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'text.secondary' }}
                  >
                    {result.feature_means?.[name] != null ? formatFeature(name, result.feature_means[name]) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained" autoFocus>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
