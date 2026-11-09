import { useState } from 'react';
import { Box, ButtonBase, Stack, Tooltip, Typography } from '@mui/material';
import { bandFor, pct } from '../lib/scoring.js';
import { highestSentences, preview } from '../lib/dashboard.js';
import { likelihood } from '../theme.js';
import SentenceInsight from './SentenceInsight.jsx';

export default function SentenceRanking({ scores, entryId }) {
  const [selected, setSelected] = useState(null);
  const ranked = highestSentences(scores);
  return <>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Up to five highest model-scoring sentences, even when all scores are low. These are not verified examples of AI authorship.</Typography>
    {!ranked.length && <Typography color="text.secondary">No valid sentence scores available.</Typography>}
    <Stack component="ol" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {ranked.map((s, rank) => <Box component="li" key={s.index}>
        <Tooltip title={`Rank ${rank + 1} · Sentence ${s.index + 1}: ${pct(s.score)} · ${bandFor(s.score).label}. ${preview(s.text)}`} describeChild>
          <ButtonBase aria-label={`Rank ${rank + 1}, sentence ${s.index + 1}, ${pct(s.score)} AI score. Show full sentence.`}
            aria-pressed={selected === s.index} onClick={() => setSelected(previous => previous === s.index ? null : s.index)}
            sx={{ width: '100%', display: 'block', textAlign: 'left', p: 1.5, borderRadius: 1, border: 1,
              borderColor: selected === s.index ? 'primary.main' : 'divider', '&:hover': { bgcolor: 'background.default' } }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>#{rank + 1} · Sentence {s.index + 1}</Typography>
              <Typography variant="body2" sx={{ color: likelihood[bandFor(s.score).key].text, fontWeight: 700 }}>{pct(s.score)}</Typography>
            </Stack>
            <Box aria-hidden sx={{ height: 8, bgcolor: 'background.default', borderRadius: 1, mb: 1 }}>
              <Box sx={{ width: `${s.score * 100}%`, height: '100%', bgcolor: likelihood[bandFor(s.score).key].main, borderRadius: 1 }} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{preview(s.text)}</Typography>
          </ButtonBase>
        </Tooltip>
        {selected === s.index && <SentenceInsight sentence={s} entryId={entryId} />}
      </Box>)}
    </Stack>
    {!!ranked.length && <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 1 }}>Bar scale: 0–100% re-centred AI score. # indicates rank; sentence number indicates position.</Typography>}
  </>;
}
