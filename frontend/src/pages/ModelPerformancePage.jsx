import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, LinearProgress, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import { api } from '../api/client.js';
import { AGREEMENT, count, drilldown, MODELS, percent, readFilters } from '../lib/performance.js';
import { Legend } from '../components/Likelihood.jsx';
import DatasetExplorer, { Select } from '../components/performance/DatasetExplorer.jsx';
import { Card, ComparisonBars, ConfusionMatrix, Histogram, MetricCards } from '../components/performance/PerformanceCharts.jsx';
import { chrome } from '../theme.js';

const splitNotes = { Test: 'Held-out Test results. Performance on this dataset may differ from performance on new, unseen writing.', Training: 'Training results are in-sample: these examples were used to fit the models and do not estimate independent generalisation.', Validation: 'Validation was used for model or threshold selection. These results are not a fully independent performance estimate.', All: 'Combined Training, Validation and Test results include training examples. This is not an independent generalisation estimate.' };

export default function ModelPerformancePage() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const [status, setStatus] = useState({ loading: true });
  const [summary, setSummary] = useState({ loading: true });
  const [retry, setRetry] = useState(0);
  const update = changes => setParams(new URLSearchParams({ ...filters, ...changes }));
  const explore = selection => setParams(new URLSearchParams(drilldown(filters, selection)));
  useEffect(() => {
    const controller = new AbortController();
    setStatus({ loading: true });
    api.performanceStatus({ signal: controller.signal }).then(data => { if (!controller.signal.aborted) setStatus({ data }); }).catch(error => { if (!controller.signal.aborted) setStatus({ error }); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!status.data?.available) return;
    const controller = new AbortController();
    setSummary({ loading: true });
    api.performanceSummary({ split: filters.split, level: filters.level }, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setSummary({ data }); }).catch(error => { if (!controller.signal.aborted) setSummary({ error }); });
    return () => controller.abort();
  }, [filters.split, filters.level, status.data, retry]);
  const data = summary.data;
  const selected = data?.[filters.model];
  const info = status.data?.dataset;
  return <Stack spacing={3}>
    <Box><Typography variant="overline" color="primary">Dataset transparency</Typography><Typography variant="h4" component="h1">Model Performance</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Explore correct predictions, investigate mistakes, and compare the two classifiers on supplied labels.</Typography></Box>
    {status.loading && <LinearProgress aria-label="Checking evaluation dataset" />}
    {status.error && <Alert severity="error" action={<Button color="inherit" onClick={() => setRetry(v => v + 1)}>Retry</Button>}>{status.error.message}</Alert>}
    {status.data && !status.data.available && <Card title="Evaluation dataset is not available"><Typography>{status.data.reason}</Typography><Typography sx={{ mt: 2 }}>This page uses a locally imported prediction export. Follow “Model Performance and Dataset Explorer” in README to import the CSV and enable access, then restart the backend.</Typography><Button sx={{ mt: 2 }} onClick={() => setRetry(v => v + 1)}>Check again</Button></Card>}
    {status.data?.available && <>
      <Paper variant="outlined" sx={{ p: 2 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Select label="Dataset split" value={filters.split} options={{ Test: 'Test', Validation: 'Validation', Training: 'Training', All: 'All splits' }} onChange={split => update({ split, page: '1' })} />
        <Select label="Model" value={filters.model} options={MODELS} onChange={model => update({ model, page: '1' })} />
        <Select label="Evaluation level" value={filters.level} options={{ document: 'Document', sentence: 'Sentence' }} onChange={level => update({ level, page: '1' })} />
      </Stack></Paper>
      <Alert severity={filters.split === 'Test' ? 'info' : 'warning'}>{splitNotes[filters.split]}</Alert>
      <Tabs value={filters.tab} onChange={(_, tab) => update({ tab })} variant="scrollable" scrollButtons="auto" aria-label="Model performance sections">{[['overview', 'Overview'], ['explorer', 'Dataset Explorer'], ['comparison', 'Model Comparison']].map(([key, label]) => <Tab id={`tab-${key}`} aria-controls={`panel-${key}`} key={key} value={key} label={label} />)}</Tabs>
      <Box role="tabpanel" id={`panel-${filters.tab}`} aria-labelledby={`tab-${filters.tab}`}>
        {filters.tab === 'explorer' ? <DatasetExplorer filters={filters} update={update} /> : <Stack spacing={3}>
          {summary.loading && <LinearProgress aria-label="Loading performance metrics" />}
          {summary.error && <Alert severity="error" action={<Button color="inherit" onClick={() => setRetry(v => v + 1)}>Retry</Button>}>{summary.error.message}</Alert>}
          {data && (filters.tab === 'overview' ? <>
            <Typography variant="h6" component="h2">{MODELS[filters.model]} · {count(selected.total)} {filters.level}s evaluated</Typography>
            <Stack direction="row" spacing={3}><Typography>✓ {count(selected.correct)} correct</Typography><Typography>✕ {count(selected.incorrect)} incorrect</Typography></Stack>
            <MetricCards data={selected} />
            <Typography variant="caption" color="text.secondary">AI is the positive class. Precision: correct AI predictions / all AI predictions. Recall: detected AI / actual AI. F1 balances both. ROC-AUC and average precision assess ranking using continuous scores. “Not defined” means the required classes or denominator are absent.</Typography>
            <ConfusionMatrix data={selected} onSelect={outcome => explore({ outcome })} />
            <Histogram data={selected} />
          </> : <>
            <Typography variant="h6" component="h2">Comparing {count(data.xgboost.total)} {filters.level}s from {filters.split}</Typography>
            <ComparisonBars data={data} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>{Object.entries(MODELS).map(([model, name]) => <ConfusionMatrix key={model} title={name} data={data[model]} onSelect={outcome => explore({ outcome, model })} />)}</Box>
            <Card title="When the models agree"><Typography sx={{ mb: 2 }}>Prediction agreement: <strong>{percent(data.agreement_rate)}</strong>. Both correct and both incorrect count as agreement in this binary task. Select a group to investigate.</Typography><Stack spacing={1}>{Object.entries(AGREEMENT).map(([key, name]) => <Button key={key} variant="outlined" onClick={() => explore({ agreement: key })} sx={{ display: 'block', textAlign: 'left', p: 2, textTransform: 'none' }}><Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}><span>{name}</span><strong>{count(data.agreement[key])} ({percent(data.xgboost.total ? data.agreement[key] / data.xgboost.total : null)})</strong></Box><Box sx={{ mt: 1, height: 6, width: `${data.xgboost.total ? data.agreement[key] / data.xgboost.total * 100 : 0}%`, bgcolor: chrome.primary, borderRadius: 1 }} /></Button>)}</Stack></Card>
          </>)}
        </Stack>}
      </Box>
      <Card title="How to read these results"><Stack spacing={2}>
        <Typography variant="body2">Actual labels are supplied by the dataset, not independently verified authorship. Document scores average the re-centred scores of retained sentences; scores ≥50% predict AI. Sentence predictions respect the saved raw thresholds: XGBoost {info.thresholds.xgboost}, Logistic regression {info.thresholds.logistic}. Re-centred scores are not calibrated authorship probabilities.</Typography>
        <Legend showRanges />
        <Typography variant="body2">The green, amber and red score bands show prediction likelihood; “Correct” and “Incorrect” compare the binary prediction with the supplied label. Amber is a display band, not a third classifier outcome.</Typography>
        <Typography variant="body2">Imported {count(info.sentences)} sentences in {count(info.documents)} documents. Preserved {count(info.repeated_rows)} identical repeated rows; they remain part of the exported dataset and contribute to aggregation. Retained sentences may omit parts of the original text.</Typography>
        <Box component="details"><Typography component="summary" variant="body2" sx={{ cursor: 'pointer' }}>Dataset provenance</Typography><Typography variant="caption" component="p" sx={{ overflowWrap: 'anywhere' }}>Imported: {info.imported_at}<br />CSV SHA-256: {info.source_sha256}<br />Metadata SHA-256: {info.metadata_sha256}</Typography></Box>
      </Stack></Card>
    </>}
  </Stack>;
}
