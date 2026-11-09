import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, LinearProgress, Pagination, Paper, Stack, Typography } from '@mui/material';
import { api } from '../../api/client.js';
import { count, labelName, MODELS, percent } from '../../lib/performance.js';
import { ScoreBadge } from '../Likelihood.jsx';
import { Progression } from './PerformanceCharts.jsx';

export default function DocumentDetail({ id, onClose, onPrevious, onNext }) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true });
  useEffect(() => { setPage(1); }, [id]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setState({ loading: true });
    api.performanceDocument(id, page, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setState({ data }); }).catch(error => { if (!controller.signal.aborted) setState({ error }); });
    return () => controller.abort();
  }, [id, page]);
  const data = state.data;
  return <Dialog open={Boolean(id)} onClose={onClose} fullWidth maxWidth="md" scroll="paper" aria-labelledby="document-title">
    <DialogTitle id="document-title">Document {id}</DialogTitle><DialogContent dividers sx={{ overflowWrap: 'anywhere' }}>
      {state.loading && <LinearProgress aria-label="Loading document" />}
      {state.error && <Alert severity="error">{state.error.message}</Alert>}
      {data && <Stack spacing={3}>
        <Typography>{data.document.split} · Actual label: <strong>{labelName(data.document.label)}</strong> · {count(data.document.sentence_count)} analysed sentences</Typography>
        <Alert severity="info">These are the retained analysed sentences, in export order. Short sentences were removed during preprocessing, so this may not be the complete original document. The actual label is supplied by the dataset.</Alert>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>{Object.entries(MODELS).map(([model, name]) => <Paper variant="outlined" key={model} sx={{ p: 2 }}><Typography variant="h6">{name}</Typography><Typography sx={{ my: 1 }}>Prediction: {labelName(data.document[`${model}_prediction`])}</Typography><ScoreBadge score={data.document[`${model}_score`]} /><Typography variant="body2" sx={{ mt: 1 }}>{data.document[`${model}_correct`] ? '✓ Correct' : '✕ Incorrect'} against supplied label</Typography><Typography variant="body2">Sentences flagged AI: {percent(data.document[`${model}_flagged_ratio`])}</Typography></Paper>)}</Box>
        <Progression rows={data.progression} />
        <Typography variant="body2" color="text.secondary">Raw probability is the saved model output. Re-centred score maps that model’s decision threshold to 50%; it is not a calibrated probability of authorship.</Typography>
        {data.sentences.map(sentence => <Paper variant="outlined" key={sentence.id} sx={{ p: 2 }}><Typography variant="subtitle2">Sentence {sentence.position + 1}</Typography><Typography sx={{ my: 1, whiteSpace: 'pre-wrap' }}>{sentence.text}</Typography><Stack spacing={1}>{Object.entries(MODELS).map(([model, name]) => <Box key={model}><Typography variant="body2"><strong>{name}</strong>: {labelName(sentence[`${model}_prediction`])} · {sentence[`${model}_correct`] ? 'Correct' : 'Incorrect'} · Raw probability: {sentence[`${model}_raw`].toFixed(4)}</Typography><Typography variant="body2" component="div">Re-centred score: <ScoreBadge score={sentence[`${model}_score`]} /></Typography></Box>)}</Stack><Box component="details" sx={{ mt: 2 }}><Typography component="summary" variant="body2" sx={{ cursor: 'pointer' }}>Writing-style features</Typography><Box component="dl" sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 1 }}>{Object.entries(sentence.features).map(([key, value]) => <Box key={key} sx={{ display: 'contents' }}><Typography component="dt" variant="caption">{key.replaceAll('_', ' ')}</Typography><Typography component="dd" variant="caption" sx={{ m: 0 }}>{value.toFixed(4)}</Typography></Box>)}</Box></Box></Paper>)}
        <Pagination count={data.pages} page={data.page} onChange={(_, value) => setPage(value)} size="small" aria-label="Sentence pages" />
      </Stack>}
    </DialogContent><DialogActions sx={{ flexWrap: 'wrap' }}><Button disabled={!onPrevious} onClick={onPrevious}>Previous document</Button><Button disabled={!onNext} onClick={onNext}>Next document</Button><Button onClick={onClose}>Close</Button></DialogActions>
  </Dialog>;
}
