import { useLayoutEffect, useRef, useState } from 'react';
import { line, scaleLinear } from 'd3';
import { Box, Tooltip, Typography } from '@mui/material';
import { bandFor, pct } from '../lib/scoring.js';
import { preview } from '../lib/dashboard.js';
import { chrome, likelihood } from '../theme.js';
import SentenceInsight from './SentenceInsight.jsx';

export default function SentenceProgression({ scores, entryId }) {
  const [selected, setSelected] = useState(null);
  const [focused, setFocused] = useState(0);
  const container = useRef(null);
  const [availableWidth, setAvailableWidth] = useState(560);
  useLayoutEffect(() => {
    if (!container.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [scores.length]);
  if (!scores.length) return <Typography color="text.secondary" sx={{ py: 3 }}>No valid sentence scores available.</Typography>;
  const width = Math.max(320, availableWidth, scores.length * 14);
  const height = 270;
  const left = 52, right = width - 25, top = 20, bottom = 225;
  const first = scores[0].index + 1, last = scores.at(-1).index + 1;
  const x = scaleLinear().domain(first === last ? [first - 0.5, first + 0.5] : [first, last]).range([left, right]);
  const y = scaleLinear().domain([0, 1]).range([bottom, top]);
  const step = Math.max(1, Math.ceil(scores.length / Math.floor(width / 90)));
  const ticks = scores.filter((_, i) => i % step === 0 || i === scores.length - 1);
  const choose = index => setSelected(previous => previous === index ? null : index);

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Follow the re-centred score through the text. Select a point for its sentence. Changes are not proof of different authors.</Typography>
      <Typography variant="caption" component="p" color="text.secondary" className="no-print">Scroll horizontally for longer passages. Use Left/Right arrows to move between points, then Enter or Space to select.</Typography>
      <Box ref={container} className="progression-scroll" sx={{ overflowX: 'auto', p: 0.5 }}>
        <Box component="svg" viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Sentence progression: re-centred AI scores"
          sx={{ display: 'block', width: '100%', minWidth: width, height: 270 }}>
          {[['human', 0, 0.35], ['uncertain', 0.35, 0.65], ['ai', 0.65, 1]].map(([key, lo, hi]) => (
            <rect key={key} x={left} y={y(hi)} width={right - left} height={y(lo) - y(hi)} fill={likelihood[key].bg} opacity={0.6} />
          ))}
          {[0, 0.35, 0.65, 1].map(value => <g key={value}>
            <line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke={chrome.border} strokeDasharray="3 4" />
            <text x={left - 9} y={y(value) + 4} textAnchor="end" fontSize={12} fill={chrome.mid}>{pct(value)}</text>
          </g>)}
          {ticks.map(s => <text key={s.index} x={x(s.index + 1)} y={bottom + 19} textAnchor="middle" fontSize={12} fill={chrome.mid}>{s.index + 1}</text>)}
          <text x={(left + right) / 2} y={height - 4} textAnchor="middle" fontSize={12} fill={chrome.mid}>Analysed sentence position</text>
          <path d={line().x(s => x(s.index + 1)).y(s => y(s.score))(scores)} fill="none" stroke={chrome.deep} strokeWidth={2} />
          {scores.map((s, i) => {
            const description = `Sentence ${s.index + 1}: ${pct(s.score)} AI score, ${bandFor(s.score).label}. ${preview(s.text)}`;
            return <Tooltip key={s.index} title={description} describeChild>
              <g role="button" className="progression-point" aria-label={description} aria-pressed={selected === s.index}
                tabIndex={i === focused ? 0 : -1} onFocus={event => {
                  setFocused(i); event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                }} onClick={() => { setFocused(i); choose(s.index); }}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(s.index); }
                  const next = { ArrowRight: Math.min(scores.length - 1, i + 1), ArrowLeft: Math.max(0, i - 1), Home: 0, End: scores.length - 1 }[event.key];
                  if (next !== undefined) { event.preventDefault(); event.currentTarget.parentElement.querySelectorAll('.progression-point')[next].focus(); }
                }} style={{ cursor: 'pointer' }}>
                <circle cx={x(s.index + 1)} cy={y(s.score)} r={10} fill="transparent" />
                <circle className="point-dot" cx={x(s.index + 1)} cy={y(s.score)} r={selected === s.index ? 6 : scores.length > 60 ? 3 : 4.5}
                  fill={likelihood[bandFor(s.score).key].main} stroke={selected === s.index ? chrome.deep : chrome.paper} strokeWidth={2} />
              </g>
            </Tooltip>;
          })}
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary">Green: below 35% · Amber: 35%–below 65% · Red: 65% and above. Sentence numbers exclude skipped short sentences.</Typography>
      <SentenceInsight sentence={scores.find(s => s.index === selected)} entryId={entryId} />
    </>
  );
}
