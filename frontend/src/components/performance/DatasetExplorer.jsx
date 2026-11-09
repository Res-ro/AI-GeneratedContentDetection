import { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, LinearProgress, MenuItem, Pagination, Paper, Slider, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TextField, Typography } from '@mui/material';
import { api } from '../../api/client.js';
import { AGREEMENT, count, DEFAULTS, labelName } from '../../lib/performance.js';
import { ScoreBadge } from '../Likelihood.jsx';
import DocumentDetail from './DocumentDetail.jsx';

export function Select({ label, value, options, onChange }) {
  return <TextField select size="small" label={label} value={value} onChange={e => onChange(e.target.value)} sx={{ minWidth: 150, flex: 1 }}>{Object.entries(options).map(([key, title]) => <MenuItem key={key} value={key}>{title}</MenuItem>)}</TextField>;
}

export default function DatasetExplorer({ filters, update }) {
  const [state, setState] = useState({ loading: true });
  const [search, setSearch] = useState(filters.q);
  const [range, setRange] = useState([+filters.score_min, +filters.score_max]);
  const [documentId, setDocumentId] = useState(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => { setSearch(filters.q); }, [filters.q]);
  useEffect(() => { setRange([+filters.score_min, +filters.score_max]); }, [filters.score_min, filters.score_max]);
  const { tab, ...query } = filters;
  const queryKey = JSON.stringify(query);
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    api.performanceRecords(JSON.parse(queryKey), { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setState({ data }); }).catch(error => { if (!controller.signal.aborted) setState({ error }); });
    return () => controller.abort();
  }, [queryKey, retry]);
  const data = state.data;
  const sort = key => update({ sort: key, direction: filters.sort === key && filters.direction === 'asc' ? 'desc' : 'asc', page: '1' });
  const ids = [...new Set((data?.items || []).map(row => row.document_id))];
  const index = ids.indexOf(documentId);
  return <Stack spacing={3}>
    <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} useFlexGap sx={{ flexWrap: 'wrap' }} spacing={2}>
        <Select label="Actual label" value={filters.actual} options={{ all: 'All labels', 0: 'Human-written', 1: 'AI-generated' }} onChange={actual => update({ actual, page: '1' })} />
        <Select label="Model prediction" value={filters.predicted} options={{ all: 'All predictions', 0: 'Human-written', 1: 'AI-generated' }} onChange={predicted => update({ predicted, page: '1' })} />
        <Select label="Prediction outcome" value={filters.outcome} options={{ all: 'All outcomes', correct: 'Correct', incorrect: 'Incorrect', tp: 'True positive', tn: 'True negative', fp: 'False positive', fn: 'False negative' }} onChange={outcome => update({ outcome, page: '1' })} />
        <Select label="Model agreement" value={filters.agreement} options={{ all: 'All agreement categories', ...AGREEMENT }} onChange={agreement => update({ agreement, page: '1' })} />
      </Stack>
      <Box component="form" onSubmit={e => { e.preventDefault(); update({ q: search.trim(), page: '1' }); }} sx={{ display: 'flex', gap: 1 }}><TextField fullWidth size="small" label="Search document ID or sentence words" value={search} onChange={e => setSearch(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} helperText="Text searches match word prefixes; multiple words must occur in the same retained sentence." /><Button type="submit" sx={{ alignSelf: 'flex-start' }}>Search</Button></Box>
      <Box sx={{ px: 1 }}><Typography id="score-range" variant="body2">Re-centred AI score: {Math.round(range[0] * 100)}–{Math.round(range[1] * 100)}%</Typography><Slider aria-labelledby="score-range" getAriaLabel={i => i ? 'Maximum AI score' : 'Minimum AI score'} value={range} min={0} max={1} step={.01} onChange={(_, v) => setRange(v)} onChangeCommitted={(_, v) => update({ score_min: String(v[0]), score_max: String(v[1]), page: '1' })} valueLabelDisplay="auto" valueLabelFormat={v => `${Math.round(v * 100)}%`} /></Box>
      <Button sx={{ alignSelf: 'flex-start' }} onClick={() => update({ ...DEFAULTS, tab: 'explorer' })}>Clear filters</Button>
    </Stack></Paper>
    {state.loading && <LinearProgress aria-label="Loading matching examples" />}
    {state.error && <Alert severity="error" action={<Button color="inherit" onClick={() => setRetry(v => v + 1)}>Retry</Button>}>{state.error.message}</Alert>}
    {data && <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" component="h2">{count(data.total)} matching {filters.level === 'document' ? 'documents' : 'sentences'}</Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>All active filters apply together. Overview and comparison metrics cover the selected split and level, not these additional filters. Document IDs sort alphabetically.</Typography>
      {filters.agreement !== 'all' && <Chip sx={{ mb: 2 }} label={AGREEMENT[filters.agreement]} onDelete={() => update({ agreement: 'all', page: '1' })} />}
      {!data.total ? <Alert severity="info">No examples match these filters. Widen the score range or clear filters.</Alert> : <TableContainer><Table size="small" aria-label="Dataset examples"><TableHead><TableRow>{[['document_id', 'Document ID'], [null, 'Split'], [null, 'Actual label'], [null, 'Prediction'], ['score', 'AI score'], ['correct', 'Outcome'], ['sentence_count', 'Sentences'], [null, 'Inspect']].map(([key, name]) => <TableCell key={name}>{key ? <TableSortLabel active={filters.sort === key} direction={filters.sort === key ? filters.direction : 'asc'} onClick={() => sort(key)}>{name}</TableSortLabel> : name}</TableCell>)}</TableRow></TableHead><TableBody>{data.items.map(row => <TableRow key={row.id} hover><TableCell>{row.document_id}{filters.level === 'sentence' && <Typography variant="caption" display="block">Sentence {row.position + 1}</Typography>}</TableCell><TableCell>{row.split}</TableCell><TableCell>{labelName(row.label)}</TableCell><TableCell>{labelName(row[`${filters.model}_prediction`])}</TableCell><TableCell><ScoreBadge score={row[`${filters.model}_score`]} /></TableCell><TableCell>{row[`${filters.model}_correct`] ? '✓ Correct' : '✕ Incorrect'}</TableCell><TableCell>{row.sentence_count}</TableCell><TableCell><Button size="small" onClick={() => setDocumentId(row.document_id)} aria-label={`Inspect document ${row.document_id}`}>Inspect</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}><Pagination count={data.pages} page={data.page} onChange={(_, page) => update({ page: String(page) })} size="small" siblingCount={0} aria-label="Dataset pages" /><Box sx={{ width: 150 }}><Select label="Rows per page" value={filters.page_size} options={{ 10: '10', 25: '25', 50: '50', 100: '100' }} onChange={page_size => update({ page_size, page: '1' })} /></Box></Stack>
    </Paper>}
    <DocumentDetail id={documentId} onClose={() => setDocumentId(null)} onPrevious={index > 0 ? () => setDocumentId(ids[index - 1]) : null} onNext={index >= 0 && index < ids.length - 1 ? () => setDocumentId(ids[index + 1]) : null} />
  </Stack>;
}
