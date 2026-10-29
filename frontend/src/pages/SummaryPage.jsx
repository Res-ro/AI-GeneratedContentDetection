/**
 * Screen 3 – Overall Score & Confidence (requirement: interactive dashboard).
 */
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, Button, Grid, Paper, Stack, Typography } from '@mui/material';
import { FileDown } from 'lucide-react';
import { HIGH_CONFIDENCE, bandFor, binIndex, confidenceRange, distribution, overallLabel, pct } from '../lib/scoring.js';
import { likelihood } from '../theme.js';
import DistributionChart from '../components/DistributionChart.jsx';
import { Legend, ScoreBadge } from '../components/Likelihood.jsx';

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
  const { entry, result, scores } = useOutletContext();
  const [selectedBin, setSelectedBin] = useState(null);

  const { range, bins, highFlags } = useMemo(() => {
    const values = scores.map((s) => s.score);
    return {
      range: confidenceRange(values),
      bins: distribution(values),
      highFlags: values.filter((v) => v >= HIGH_CONFIDENCE).length,
    };
  }, [scores]);

  const band = bandFor(result.ai_score);
  const c = likelihood[band.key];
  const bin = bins.find((b) => b.label === selectedBin);
  const binSentences = bin ? scores.filter((s) => binIndex(s.score) === bin.index) : [];

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
                  Only one sentence was long enough to analyse, so there is no confidence range. Add more text for a firmer
                  result.
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
              sx={{ mt: 2.5, bgcolor: c.text, '&:hover': { bgcolor: '#222' } }}
            >
              Export Report (PDF)
            </Button>
          </Paper>
        </Grid>

        {/* Distribution + stats */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, height: '100%' }}>
            <Typography variant="h4" component="h2">
              Sentence Score Distribution
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} className="no-print">
              Select a bar to list the sentences in that range.
            </Typography>
            <DistributionChart bins={bins} selected={selectedBin} onSelect={setSelectedBin} />

            <Stack direction="row" useFlexGap spacing={{ xs: 3, sm: 5 }} sx={{ flexWrap: 'wrap', mt: 2 }}>
              <Stat value={result.sentence_count} label="Sentences analysed" />
              <Stat value={highFlags} label="High-confidence flags" />
              <Stat value={result.word_count.toLocaleString()} label="Words analysed" />
              <Stat value={`${pct(result.ai_sentence_ratio)}`} label="Sentences flagged AI" />
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {bin && (
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mt: 2 }} className="no-print">
          <Typography variant="h4" component="h2" sx={{ mb: 1.5 }}>
            Sentences scoring {bin.label} ({binSentences.length})
          </Typography>
          {binSentences.length === 0 ? (
            <Typography color="text.secondary">No sentences in this range.</Typography>
          ) : (
            <Stack spacing={1}>
              {binSentences.map((s) => (
                <Stack key={s.index} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <ScoreBadge score={s.score} variant="filled" />
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    {s.text}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Paper>
      )}

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
