import { Box, Button, Paper, Stack, Switch, FormControlLabel, Typography, Table, TableHead, TableBody, TableRow, TableCell, TableContainer } from '@mui/material';
import { useState } from 'react';
import { scaleLinear, line } from 'd3';
import { count, METRICS, MODELS, percent } from '../../lib/performance.js';
import { chrome } from '../../theme.js';

export const truthColors = ['#147D92', '#7C3AED'];
export function Card({ title, children, ...props }) {
  return <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }} {...props}><Typography variant="h6" component="h2" sx={{ mb: 2 }}>{title}</Typography>{children}</Paper>;
}

export function MetricCards({ data }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>{Object.entries(METRICS).map(([key, name]) => <Paper variant="outlined" key={key} sx={{ p: 2 }}><Typography color="text.secondary" variant="body2">{name}</Typography><Typography variant="h5" component="p" sx={{ mt: 1 }}>{percent(data[key])}</Typography></Paper>)}</Box>;
}

export function ConfusionMatrix({ data, onSelect, title = 'Where predictions match the labels' }) {
  const [percentage, setPercentage] = useState(false);
  const cells = [{ key: 'tn', name: 'True negative', description: 'Human correctly identified' }, { key: 'fp', name: 'False positive', description: 'Human labelled AI' }, { key: 'fn', name: 'False negative', description: 'AI labelled human' }, { key: 'tp', name: 'True positive', description: 'AI correctly identified' }];
  return <Card title={title}>
    <FormControlLabel control={<Switch checked={percentage} onChange={(_, v) => setPercentage(v)} />} label="Show percentages" />
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Actual labels are rows and predictions are columns. {percentage ? `Percent of all ${count(data.total)} evaluated examples.` : 'Select a cell to inspect its examples.'}</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(60px, .7fr) repeat(2, minmax(0, 1fr))', gap: 1, alignItems: 'stretch' }}>
      <Box /><Typography sx={{ textAlign: 'center' }} variant="body2">Predicted human</Typography><Typography sx={{ textAlign: 'center' }} variant="body2">Predicted AI</Typography>
      {[0, 1].map((actual) => <Box key={actual} sx={{ display: 'contents' }}><Typography variant="body2" sx={{ alignSelf: 'center' }}>Actual {actual ? 'AI' : 'human'}</Typography>{cells.slice(actual * 2, actual * 2 + 2).map(cell => <Button key={cell.key} variant="outlined" onClick={() => onSelect(cell.key)} aria-label={`${cell.name}: ${count(data.confusion[cell.key])}. Explore examples`} sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: .5, bgcolor: chrome.surface, textTransform: 'none' }}><Typography component="span" variant="h5">{percentage ? percent(data.total ? data.confusion[cell.key] / data.total : null) : count(data.confusion[cell.key])}</Typography><span>{cell.name}</span><Typography component="span" variant="caption">{cell.description}</Typography></Button>)}</Box>)}
    </Box>
  </Card>;
}

export function Histogram({ data }) {
  const max = Math.max(1, ...Object.values(data.histogram).flat());
  const scale = scaleLinear().domain([0, max]).range([0, 100]);
  return <Card title="Re-centred AI score distribution">
    <Typography variant="body2" color="text.secondary">Teal = human-written, purple = AI-generated. These colours describe actual labels from the dataset. Scores of 0.5 or higher predict AI generated sentences.</Typography>
    <TableContainer><Table size="small" aria-label="Score distribution by supplied ground truth"><TableHead><TableRow><TableCell>Score range</TableCell><TableCell>Actual human</TableCell><TableCell>Actual AI</TableCell></TableRow></TableHead><TableBody>{Array.from({ length: 10 }, (_, i) => <TableRow key={i}><TableCell sx={{ whiteSpace: 'nowrap' }}>{i * 10}–{(i + 1) * 10}%{i === 9 ? ' inclusive' : ' (upper excluded)'}</TableCell>{[0, 1].map(label => <TableCell key={label} sx={{ width: '35%' }}><Box sx={{ height: 8, width: `${scale(data.histogram[label][i])}%`, bgcolor: truthColors[label], borderRadius: 1 }} /><Typography variant="caption">{count(data.histogram[label][i])}</Typography></TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>
  </Card>;
}

export function ComparisonBars({ data }) {
  return <Card title="Same examples, two models"><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Threshold metrics use the saved decision rules. ROC-AUC and average precision use continuous re-centred scores.</Typography>
    <Stack spacing={2}>{Object.entries(METRICS).map(([key, name]) => <Box key={key}><Typography variant="subtitle2">{name}</Typography>{Object.entries(MODELS).map(([model, label], i) => <Box key={model} sx={{ display: 'grid', gridTemplateColumns: { xs: '100px 1fr 65px', sm: '150px 1fr 100px' }, alignItems: 'center', gap: 1, my: .5 }}><Typography variant="caption">{label}</Typography><Box sx={{ bgcolor: chrome.surface, borderRadius: 1 }}><Box sx={{ width: `${(data[model][key] ?? 0) * 100}%`, height: 14, bgcolor: i === 0 ? chrome.primary : chrome.deep, borderRadius: 1 }} /></Box><Typography variant="caption">{percent(data[model][key])}</Typography></Box>)}</Box>)}</Stack>
  </Card>;
}

export function Progression({ rows }) {
  const x = scaleLinear().domain([0, Math.max(1, rows.length - 1)]).range([40, 660]);
  const y = scaleLinear().domain([0, 1]).range([140, 15]);
  return <Box><Typography variant="subtitle2">Sentence score progression</Typography><Typography variant="caption">Indigo: XGBoost · Navy: Logistic regression · Dashed line: decision boundary. Sentence values appear below.</Typography><svg viewBox="0 0 680 170" role="img" aria-label="Re-centred AI scores across retained sentences" style={{ width: '100%', maxHeight: 210 }}><text x="0" y="20" fontSize="11">100%</text><text x="10" y="142" fontSize="11">0%</text><line x1="40" x2="660" y1={y(.5)} y2={y(.5)} stroke="#73809a" strokeDasharray="4 4" />{Object.keys(MODELS).map((model, i) => <g key={model}><path d={line().x((_, n) => x(n)).y(d => y(d[`${model}_score`]))(rows) || ''} fill="none" stroke={i ? chrome.deep : chrome.primary} strokeWidth="2" />{rows.length === 1 && <circle cx={x(0)} cy={y(rows[0][`${model}_score`])} r="4" fill={i ? chrome.deep : chrome.primary} />}</g>)}<text x="40" y="165" fontSize="11">Sentence 1</text><text x="600" y="165" fontSize="11">{rows.length}</text></svg></Box>;
}
