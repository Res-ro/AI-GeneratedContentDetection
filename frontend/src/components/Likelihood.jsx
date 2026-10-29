/**
 * The green / amber / red likelihood scale, reused on every screen
 * (design: "Consistency & standards" and "Recognition over recall").
 * Colour is never the only signal: every badge also has a % and a text label.
 */
import { Box, Stack, Typography } from '@mui/material';
import { likelihood } from '../theme.js';
import { BANDS, bandFor, pct } from '../lib/scoring.js';

export function Dot({ band, size = 12 }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: likelihood[band].main,
        flexShrink: 0,
      }}
    />
  );
}

/** The always-visible legend under results. */
export function Legend({ showRanges = false }) {
  return (
    <Stack
      direction="row"
      useFlexGap
      spacing={2.5}
      component="ul"
      aria-label="Colour legend"
      sx={{ flexWrap: 'wrap', listStyle: 'none', p: 0, m: 0 }}
    >
      {Object.values(BANDS).map((b) => (
        <Stack key={b.key} component="li" direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Dot band={b.key} />
          <Typography variant="body2">
            {b.label}
            {showRanges && (
              <Typography component="span" variant="body2" color="text.secondary">
                {' '}
                ({b.range})
              </Typography>
            )}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

/** Coloured % badge, e.g. the score box on each sentence and in History. */
export function ScoreBadge({ score, variant = 'outlined', sx }) {
  const band = bandFor(score);
  const c = likelihood[band.key];
  return (
    <Box
      component="span"
      title={`${pct(score)} AI score: ${band.label}`}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 56,
        px: 1,
        py: 0.4,
        borderRadius: 1,
        fontWeight: 700,
        fontSize: '0.85rem',
        color: c.text,
        bgcolor: variant === 'filled' ? c.bg : '#fff',
        border: `1.5px solid ${variant === 'filled' ? c.bg : c.main}`,
        fontVariantNumeric: 'tabular-nums',
        ...sx,
      }}
    >
      {pct(score)}
      <Box component="span" sx={visuallyHidden}>
        {` AI score, ${band.label}`}
      </Box>
    </Box>
  );
}

export const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};
