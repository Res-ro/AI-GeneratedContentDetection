import { useState } from 'react';
import { arc, pie } from 'd3';
import { Box, Button, ButtonBase, Stack, Tooltip, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { classificationGroups, passageLink, preview } from '../lib/dashboard.js';
import { pct } from '../lib/scoring.js';
import { chrome, likelihood } from '../theme.js';
import { ScoreBadge } from './Likelihood.jsx';

export default function ClassificationDonut({ scores, entryId }) {
  const [selected, setSelected] = useState(null);
  const groups = classificationGroups(scores);
  const slices = pie().sort(null).value(d => d.count)(groups);
  const path = arc().innerRadius(70).outerRadius(100).padAngle(0.025).cornerRadius(3);
  const choose = key => setSelected(previous => previous === key ? null : key);
  const group = groups.find(g => g.key === selected);
  if (!scores.length) return <Typography color="text.secondary" sx={{ py: 4 }}>No valid sentence scores available.</Typography>;

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 2, my: 2 }}>
        <Box component="svg" viewBox="0 0 230 230" role="group" aria-label="Sentence classifications"
          sx={{ width: 230, maxWidth: '100%', flexShrink: 0, overflow: 'visible' }}>
          <g transform="translate(115 115)">
            {slices.filter(s => s.data.count).map(slice => {
              const { key, label, count, share } = slice.data;
              const description = `${label}: ${count} sentences (${pct(share)} of analysed sentences)`;
              return (
                <Tooltip key={key} title={description} describeChild>
                  <path d={path(slice)} fill={likelihood[key].main} className="dashboard-segment" role="button" tabIndex={0}
                    aria-label={description} aria-pressed={selected === key}
                    stroke={selected === key ? chrome.deep : chrome.paper} strokeWidth={selected === key ? 3 : 1}
                    opacity={selected && selected !== key ? 0.45 : 1}
                    onClick={() => choose(key)} onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(key); }
                    }} style={{ cursor: 'pointer' }} />
                </Tooltip>
              );
            })}
            <text textAnchor="middle" y={0} fill={chrome.deep} fontSize={30} fontWeight={700}>{scores.length}</text>
            <text textAnchor="middle" y={23} fill={chrome.mid} fontSize={12}>sentences analysed</text>
          </g>
        </Box>
        <Stack spacing={0.75} sx={{ flex: '1 1 180px' }}>
          {groups.map(g => (
            <ButtonBase key={g.key} onClick={() => choose(g.key)} aria-pressed={selected === g.key}
              aria-label={`${g.label}: ${g.count} sentences, ${pct(g.share)}. Show sentences.`}
              sx={{ justifyContent: 'flex-start', gap: 1, p: 1, borderRadius: 1, textAlign: 'left', bgcolor: selected === g.key ? likelihood[g.key].bg : 'transparent' }}>
              <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: likelihood[g.key].main, flexShrink: 0 }} />
              <Box><Typography variant="body2" sx={{ fontWeight: 700 }}>{g.label}</Typography>
                <Typography variant="caption" color="text.secondary">{g.count} sentences · {pct(g.share)}</Typography></Box>
            </ButtonBase>
          ))}
        </Stack>
      </Box>
      <Typography variant="caption" color="text.secondary" component="p">Share of analysed sentences in each score category, not the verified share of text written by AI. Rounded percentages may not total 100%.</Typography>
      {group && (
        <Box className="no-print" sx={{ mt: 2, borderTop: 1, borderColor: 'divider', pt: 2 }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography component="h3" variant="h4" aria-live="polite">{group.label} sentences ({group.count})</Typography>
            <Button size="small" onClick={() => setSelected(null)}>Clear</Button>
          </Stack>
          {!group.count && <Typography color="text.secondary">No sentences in this category.</Typography>}
          <Stack key={group.key} component="ul" spacing={1.5} tabIndex={0}
            aria-label={`${group.label} sentences`}
            sx={{ listStyle: 'none', m: 0, mt: 1, p: 0.5, minHeight: 0,
              maxHeight: 'min(320px, 45vh)', overflowY: 'auto', overflowX: 'hidden',
              overscrollBehaviorY: 'contain', scrollbarGutter: 'stable' }}>
            {group.sentences.map(s => <Box component="li" key={s.index} sx={{ flexShrink: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
                <ScoreBadge score={s.score} variant="filled" />
                <Button size="small" component={RouterLink} to={passageLink(entryId, s.index)}>Sentence {s.index + 1}</Button>
              </Stack>
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{preview(s.text)}</Typography>
            </Box>)}
          </Stack>
        </Box>
      )}
    </>
  );
}
