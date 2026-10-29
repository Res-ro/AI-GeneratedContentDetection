/**
 * Screen 2 – Colour-Coded Passage (requirement: results display).
 * Every analysed sentence is shaded by its own AI score; click one to see why.
 */
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, ButtonBase, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { bandFor } from '../lib/scoring.js';
import { likelihood } from '../theme.js';
import { Legend, ScoreBadge } from '../components/Likelihood.jsx';
import SentenceDialog from '../components/SentenceDialog.jsx';

export default function PassagePage() {
  const { result, scores } = useOutletContext();
  const [order, setOrder] = useState('text');
  const [selected, setSelected] = useState(null);

  const rows = useMemo(() => (order === 'score' ? [...scores].sort((a, b) => b.score - a.score) : scores), [scores, order]);

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 1.5, mb: 2 }}
      >
        <Typography variant="h3" component="h2">
          Every sentence is shaded by its individual AI-likelihood score
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={order}
          onChange={(_, v) => v && setOrder(v)}
          aria-label="Sentence order"
          className="no-print"
          sx={{ flexShrink: 0 }}
        >
          <ToggleButton value="text">Text order</ToggleButton>
          <ToggleButton value="score">Highest first</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Stack component="ol" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {rows.map((s) => {
          const band = bandFor(s.score);
          const c = likelihood[band.key];
          return (
            <li key={s.index}>
              <ButtonBase
                onClick={() => setSelected(s)}
                aria-label={`Sentence ${s.index + 1}, ${Math.round(s.score * 100)}% AI score, ${band.label}. Show details.`}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'stretch',
                  gap: 1,
                  textAlign: 'left',
                  borderRadius: 1,
                  '&:hover .sentence-text': { filter: 'brightness(0.97)', borderColor: c.main },
                }}
              >
                <Box
                  className="sentence-text"
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    bgcolor: c.bg,
                    border: '1px solid transparent',
                    borderRadius: 1,
                    px: 1.75,
                    py: 1.1,
                    transition: 'border-color 120ms',
                  }}
                >
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    {s.text}
                  </Typography>
                </Box>
                <ScoreBadge score={s.score} sx={{ alignSelf: 'stretch', minWidth: { xs: 52, sm: 64 } }} />
              </ButtonBase>
            </li>
          );
        })}
      </Stack>

      {result.skipped_sentences > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          {result.skipped_sentences} short sentence{result.skipped_sentences === 1 ? ' was' : 's were'} skipped (under 10 words is
          too short to judge reliably).
        </Typography>
      )}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{
          alignItems: { sm: 'center' },
          justifyContent: 'space-between',
          gap: 1,
          mt: 2.5,
          pt: 2,
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <Legend />
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          Tap any sentence to see the writing-style signals behind its score.
        </Typography>
      </Stack>

      <SentenceDialog sentence={selected} result={result} onClose={() => setSelected(null)} />
    </Paper>
  );
}
