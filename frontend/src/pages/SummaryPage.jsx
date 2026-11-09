/**
 * Screen 3 – Overall Score & Confidence (requirement: interactive dashboard).
 */
import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, Button, Grid, Paper, Stack, Typography } from '@mui/material';
import { FileDown } from 'lucide-react';
import { HIGH_CONFIDENCE, bandFor, confidenceRange, overallLabel, pct } from '../lib/scoring.js';
import { likelihood } from '../theme.js';
import ClassificationDonut from '../components/ClassificationDonut.jsx';
import SentenceProgression from '../components/SentenceProgression.jsx';
import SentenceRanking from '../components/SentenceRanking.jsx';
import WritingStyleChart from '../components/WritingStyleChart.jsx';
import { validSentences } from '../lib/dashboard.js';
import { Legend } from '../components/Likelihood.jsx';

function Stat({ value, label }) {
  return (
    <Box>
      <Typography sx={{ fontSize: '1.9rem', fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

export default function SummaryPage() {
  const { entry, result, scores: rawScores } = useOutletContext();
  const scores = useMemo(() => validSentences(rawScores), [rawScores]);

  const { range, highFlags } = useMemo(() => {
    const values = scores.map((s) => s.score);
    return {
      range: confidenceRange(values),
      highFlags: values.filter((v) => v >= HIGH_CONFIDENCE).length,
    };
  }, [scores]);

  const band = bandFor(result.ai_score);
  const c = likelihood[band.key];

  return (
    <>
      <Grid container spacing={2}>
        {/* Overall estimate card */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper
            variant="outlined"
            sx={{ p: { xs: 2.5, sm: 3 }, bgcolor: c.bg, borderColor: c.border, height: '100%', textAlign: 'center' }}
          >
            <Typography variant="overline" sx={{ color: c.text }} component="h2">
              Overall estimate
            </Typography>
            <Typography sx={{ fontSize: { xs: '3.4rem', sm: '4rem' }, fontWeight: 700, color: c.main, lineHeight: 1.1, my: 0.5 }}>
              {pct(result.ai_score)}
            </Typography>
            <Typography sx={{ color: c.text, fontSize: '1.1rem', mb: 2.5 }}>{overallLabel(result)}</Typography>

            <Box sx={{ textAlign: 'left' }}>
              {range ? (
                <>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Confidence range: {pct(range.low)} – {pct(range.high)}
                  </Typography>
                  <Box
                    role="img"
                    aria-label={`Score ${pct(result.ai_score)}, likely between ${pct(range.low)} and ${pct(range.high)}`}
                    sx={{
                      position: 'relative',
                      height: 14,
                      bgcolor: '#fff',
                      borderRadius: 7,
                      border: '1px solid',
                      borderColor: c.border,
                      my: 1,
                    }}
                  >
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 2,
                        bottom: 2,
                        left: `${range.low * 100}%`,
                        width: `${Math.max(1, (range.high - range.low) * 100)}%`,
                        bgcolor: c.main,
                        opacity: 0.35,
                        borderRadius: 5,
                      }}
                    />
                    <Box
                      sx={{
                        position: 'absolute',
                        top: -3,
                        left: `calc(${result.ai_score * 100}% - 9px)`,
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        bgcolor: c.main,
                        border: '3px solid #fff',
                        boxShadow: '0 0 0 1px rgba(0,0,0,.15)',
                      }}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" component="p">
                    95% range for the average sentence score. Fewer sentences, or sentences that disagree, give a wider range.
                  </Typography>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  At least two valid sentence scores are needed to show a confidence range.
                </Typography>
              )}

              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                Based on {result.sentence_count} sentence{result.sentence_count === 1 ? '' : 's'} · {highFlags} flagged
                high-confidence
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Model certainty in this verdict: {pct(result.confidence)}
              </Typography>
            </Box>

            <Button
              fullWidth
              variant="contained"
              startIcon={<FileDown size={18} aria-hidden />}
              onClick={() => window.print()}
              className="no-print"
              sx={{ mt: 2.5 }}
            >
              Export Report (PDF)
            </Button>
          </Paper>
        </Grid>

        {/* Distribution + stats */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, height: '100%' }}>
            <Typography variant="h4" component="h2">
              Sentence Classifications
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} className="no-print">
              Select a category to inspect its sentences.
            </Typography>
            <ClassificationDonut key={entry.id} scores={scores} entryId={entry.id} />

            <Stack direction="row" useFlexGap spacing={{ xs: 3, sm: 5 }} sx={{ flexWrap: 'wrap', mt: 2 }}>
              <Stat value={result.sentence_count} label="Sentences analysed" />
              <Stat value={highFlags} label="High-confidence flags" />
              <Stat value={result.word_count.toLocaleString()} label="Words analysed" />
              <Stat value={`${pct(result.ai_sentence_ratio)}`} label="Sentences flagged AI" />
            </Stack>
            <Typography variant="caption" component="p" color="text.secondary" sx={{ mt: 1.5 }}>
              “Flagged AI” uses the model's decision threshold (50% on the re-centred scale). The donut's AI-likely category starts at 65%.
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mt: 2, breakInside: 'avoid' }}>
        <Typography variant="h3" component="h2" sx={{ mb: 1 }}>Sentence Progression</Typography>
        <SentenceProgression key={entry.id} scores={scores} entryId={entry.id} />
      </Paper>
      <Grid container spacing={2} sx={{ mt: 2 }}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, height: '100%' }}>
            <Typography variant="h3" component="h2" sx={{ mb: 1 }}>Top Five AI-Likely Sentences</Typography>
            <SentenceRanking key={entry.id} scores={scores} entryId={entry.id} />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, height: '100%' }}>
            <Typography variant="h3" component="h2" sx={{ mb: 1 }}>Writing Style Analysis</Typography>
            <WritingStyleChart key={entry.id} result={result} />
          </Paper>
        </Grid>
      </Grid>

      {/* Printed report only: the full passage under the summary */}
      <Box className="print-only" sx={{ mt: 3 }}>
        <Typography variant="h3" component="h2" sx={{ mb: 1 }}>
          Sentence-level results
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {entry.name} · model: {result.model} · analysed {new Date(entry.createdAt).toLocaleString()}
        </Typography>
        <Legend showRanges />
        <Box component="ol" sx={{ pl: 3 }}>
          {scores.map((s) => (
            <li key={s.index} style={{ marginBottom: 6 }}>
              <span style={{ background: likelihood[bandFor(s.score).key].bg, padding: '1px 3px' }}>{s.text}</span>{' '}
              <strong>({pct(s.score)})</strong>
            </li>
          ))}
        </Box>
        <Typography variant="caption">
          AI scores are estimates from writing-style features and can be wrong. Do not use them as the only evidence about who
          wrote a text.
        </Typography>
      </Box>
    </>
  );
}
