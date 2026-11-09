import { useId, useState } from 'react';
import { Box, Stack, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import { FEATURE_INFO } from '../lib/scoring.js';
import { STYLE_GROUPS, featureMeasure } from '../lib/dashboard.js';

function FeatureRows({ group, result }) {
  return <Stack spacing={2.5} sx={{ mt: 2 }}>
    {group.features.map(name => {
      const info = FEATURE_INFO[name];
      const measure = featureMeasure(name, result.feature_means, result.sentences);
      const label = name === 'word_count' ? 'Average sentence length' : info.label;
      const description = `${label}: ${measure?.label || 'Not available'}. ${info.help}`;
      return <Tooltip key={name} title={description} describeChild>
        <Box tabIndex={0} role="group" aria-label={description} sx={{ borderRadius: 1, p: 0.5 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 0.75 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{label}</Typography>
            <Typography variant="body2">{measure?.label || 'Not available'}</Typography>
          </Stack>
          {measure && <>
            <Box aria-hidden sx={{ height: 10, borderRadius: 1, bgcolor: 'background.default', mb: 0.75 }}>
              <Box sx={{ width: `${measure.value / measure.max * 100}%`, height: '100%', borderRadius: 1, bgcolor: 'primary.main' }} />
            </Box>
            <Typography variant="caption" color="text.secondary" component="p">Scale: {measure.scale}</Typography>
          </>}
          <Typography variant="caption" color="text.secondary" component="p">{info.help}</Typography>
        </Box>
      </Tooltip>;
    })}
  </Stack>;
}

export default function WritingStyleChart({ result }) {
  const [group, setGroup] = useState(0);
  const id = useId();
  return <>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Averages across analysed sentences describe this writing, not feature importance or evidence of AI authorship. Each bar has its own labelled scale; unlike units are not comparable.</Typography>
    <Box className="no-print">
      <Tabs value={group} onChange={(_, value) => setGroup(value)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Writing style groups">
        {STYLE_GROUPS.map((g, i) => <Tab key={g.label} label={g.label} id={`${id}-tab-${i}`} aria-controls={`${id}-panel-${i}`} />)}
      </Tabs>
      {STYLE_GROUPS.map((g, i) => <Box key={g.label} role="tabpanel" hidden={group !== i} id={`${id}-panel-${i}`} aria-labelledby={`${id}-tab-${i}`}>
        {group === i && <FeatureRows group={g} result={result} />}
      </Box>)}
    </Box>
    <Box className="print-only">
      {STYLE_GROUPS.map(g => <Box key={g.label} sx={{ mt: 2, breakInside: 'avoid' }}>
        <Typography variant="h4" component="h3">{g.label}</Typography><FeatureRows group={g} result={result} />
      </Box>)}
    </Box>
  </>;
}
