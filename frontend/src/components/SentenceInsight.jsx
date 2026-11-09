import { useEffect, useId, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Button, Stack, Typography } from '@mui/material';
import { ChevronDown, ArrowRight } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { bandFor, pct } from '../lib/scoring.js';
import { passageLink } from '../lib/dashboard.js';

/** Shared full-sentence panel for progression and ranking selections. */
export default function SentenceInsight({ sentence, entryId }) {
  const id = useId();
  const [expanded, setExpanded] = useState(true);
  useEffect(() => setExpanded(true), [sentence?.index]);
  if (!sentence) return null;
  return (
    <Accordion expanded={expanded} onChange={(_, value) => setExpanded(value)} disableGutters
      variant="outlined" className="no-print" sx={{ mt: 2, '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ChevronDown size={18} aria-hidden />} id={`${id}-heading`} aria-controls={`${id}-detail`}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          Sentence {sentence.index + 1} · {pct(sentence.score)} · {bandFor(sentence.score).label}
        </Typography>
      </AccordionSummary>
      <AccordionDetails id={`${id}-detail`}>
        <Typography sx={{ overflowWrap: 'anywhere', mb: 1.5 }}>{sentence.text}</Typography>
        <Stack direction="row">
          <Button component={RouterLink} to={passageLink(entryId, sentence.index)} endIcon={<ArrowRight size={16} aria-hidden />}>
            Inspect in Passage
          </Button>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
