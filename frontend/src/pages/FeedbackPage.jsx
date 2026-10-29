/**
 * Screen 4b – Rate This Result (requirement: feedback mechanism).
 *
 * Feedback is saved in this browser (see lib/storage.js) because the back end
 * has no feedback endpoint or database. The comment is limited in length and
 * shown back only as plain text.
 */
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Alert, Box, Button, Paper, Rating, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Check, ThumbsDown, ThumbsUp } from 'lucide-react';
import { bandFor, pct } from '../lib/scoring.js';
import { feedbackFor, saveFeedback } from '../lib/storage.js';
import { likelihood } from '../theme.js';

const MAX_COMMENT = 500;

/** The sentences most worth checking: the 3 most AI-like and the 2 most human-like. */
function pickSentences(scores) {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const picked = [...sorted.slice(0, 3), ...sorted.slice(-2).reverse()];
  return picked.filter((s, i) => picked.findIndex((p) => p.index === s.index) === i);
}

export default function FeedbackPage() {
  const { entry, scores } = useOutletContext();
  const existing = useMemo(() => feedbackFor(entry.id), [entry.id]);

  const [votes, setVotes] = useState(existing?.votes || {});
  const [stars, setStars] = useState(existing?.stars || 0);
  const [comment, setComment] = useState(existing?.comment || '');
  const [saved, setSaved] = useState(null); // null | 'ok' | 'failed'

  const sentences = useMemo(() => pickSentences(scores), [scores]);
  const hasInput = Object.keys(votes).length > 0 || stars > 0 || comment.trim().length > 0;

  function handleSubmit(e) {
    e.preventDefault();
    const ok = saveFeedback({
      analysisId: entry.id,
      createdAt: new Date().toISOString(),
      votes,
      stars,
      comment: comment.trim().slice(0, MAX_COMMENT),
      sentenceScores: Object.fromEntries(sentences.map((s) => [s.index, Number(s.score.toFixed(4))])),
    });
    setSaved(ok ? 'ok' : 'failed');
  }

  return (
    <Paper variant="outlined" component="form" onSubmit={handleSubmit} sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h3" component="h2">
        Was this assessment accurate?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Your feedback helps refine future sentence-level scoring. Rate the sentences you can judge; skip the rest.
      </Typography>

      <Stack spacing={1.25}>
        {sentences.map((s) => {
          const band = bandFor(s.score);
          return (
            <Stack
              key={s.index}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{ alignItems: { sm: 'center' }, bgcolor: '#f2f2f2', borderRadius: 1, px: 2, py: 1.5 }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    overflowWrap: 'anywhere',
                  }}
                  title={s.text}
                >
                  “{s.text}”
                </Typography>
                <Typography variant="caption" sx={{ color: likelihood[band.key].text, fontWeight: 700 }}>
                  {pct(s.score)} {band.label}
                </Typography>
              </Box>
              <Stack spacing={0.25} sx={{ alignItems: 'center' }}>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={votes[s.index] || null}
                  onChange={(_, v) => {
                    setSaved(null);
                    setVotes((prev) => {
                      const next = { ...prev };
                      if (v) next[s.index] = v;
                      else delete next[s.index];
                      return next;
                    });
                  }}
                  aria-label={`Do you agree with the score for sentence ${s.index + 1}?`}
                >
                  <ToggleButton
                    value="agree"
                    aria-label="Agree"
                    sx={{ '&.Mui-selected': { bgcolor: likelihood.human.bg, color: likelihood.human.text } }}
                  >
                    <ThumbsUp size={18} aria-hidden />
                  </ToggleButton>
                  <ToggleButton
                    value="disagree"
                    aria-label="Disagree"
                    sx={{ '&.Mui-selected': { bgcolor: likelihood.ai.bg, color: likelihood.ai.text } }}
                  >
                    <ThumbsDown size={18} aria-hidden />
                  </ToggleButton>
                </ToggleButtonGroup>
                <Typography variant="caption" color="text.secondary">
                  Agree?
                </Typography>
              </Stack>
            </Stack>
          );
        })}
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ mt: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Typography component="legend" sx={{ fontWeight: 700, mb: 0.5 }} id="stars-label">
            Overall, how confident are you in this result?
          </Typography>
          <Rating
            name="overall-confidence"
            value={stars}
            onChange={(_, v) => {
              setSaved(null);
              setStars(v || 0);
            }}
            size="large"
            aria-labelledby="stars-label"
            sx={{ color: likelihood.uncertain.main }}
          />
        </Box>
        <TextField
          label="Optional comment"
          multiline
          minRows={3}
          value={comment}
          onChange={(e) => {
            setSaved(null);
            setComment(e.target.value.slice(0, MAX_COMMENT));
          }}
          helperText={`${comment.length} / ${MAX_COMMENT}`}
          sx={{ flex: 1.3 }}
          slotProps={{ htmlInput: { maxLength: MAX_COMMENT } }}
        />
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, mt: 2.5 }}>
        <Button type="submit" variant="contained" size="large" disabled={!hasInput}>
          {existing ? 'Update Feedback' : 'Submit Feedback'}
        </Button>
        <Box role="status" aria-live="polite">
          {saved === 'ok' && (
            <Alert icon={<Check size={18} />} severity="success" sx={{ py: 0 }}>
              Thanks — feedback recorded on this device
            </Alert>
          )}
          {saved === 'failed' && (
            <Alert severity="error" sx={{ py: 0 }}>
              Your browser blocked saving. Feedback was not stored.
            </Alert>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}
