import { useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Container, Divider, Link, Paper, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ArrowRight, ChartColumn, FileText, Info, ScanLine, ScanText } from 'lucide-react';
import AppHeader from '../components/AppHeader.jsx';
import { chrome } from '../theme.js';

const FEATURES = [
  { icon: FileText, title: 'Start with your text', description: 'Paste a passage or upload a .txt or .docx file. Choose XGBoost or logistic regression to explore its writing patterns.' },
  { icon: ScanLine, title: 'Look sentence by sentence', description: 'Go beyond an overall score. Inspect individual sentences and the writing features behind their estimates.' },
  { icon: ChartColumn, title: 'See the bigger picture', description: 'Explore score distributions and confidence ranges, then export a PDF report to support your review.' },
];
const STEPS = [
  ['Add your writing', 'Use an English passage with at least one sentence of ten or more words.'],
  ['Explore the indicators', 'The model examines writing-style features and estimates AI likelihood for each eligible sentence.'],
  ['Review with context', 'Compare the patterns, inspect the sentences, and use your own judgement alongside the results.'],
];

/** A schematic of the workflow, deliberately without invented prediction scores. */
function AnalysisIllustration() {
  return (
    <Box sx={{ position: 'relative', p: { xs: 2, sm: 4 }, bgcolor: chrome.deep, borderRadius: 3, overflow: 'hidden', minWidth: 0 }}>
      <Box aria-hidden sx={{ position: 'absolute', width: 290, height: 290, border: `1px solid ${alpha(chrome.accent, 0.2)}`,
        borderRadius: '50%', right: -100, top: -100, boxShadow: `0 0 0 35px ${alpha(chrome.accent, 0.05)}, 0 0 0 70px ${alpha(chrome.accent, 0.04)}` }} />
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 3, position: 'relative', color: chrome.onDark }}>
        <Typography variant="overline">From text to insight</Typography>
        <ScanText size={21} aria-hidden />
      </Stack>
      <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, position: 'relative' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
          <FileText size={18} color={chrome.primary} aria-hidden />
          <Typography variant="body2" sx={{ fontWeight: 700 }}>Your writing, in focus</Typography>
        </Stack>
        <Box aria-hidden sx={{ display: 'grid', gap: 1.25 }}>
          {[95, 100, 75, 90, 60].map((width, index) => (
            <Box key={index} sx={{ width: `${width}%`, height: 10, borderRadius: 1, bgcolor: index === 2 ? chrome.accent : chrome.surface }} />
          ))}
        </Box>
        <Divider sx={{ my: 2.5 }} />
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 3, alignSelf: 'stretch', bgcolor: chrome.primary, borderRadius: 1 }} />
          <Typography variant="body2" color="text.secondary">Word choice. Sentence structure.<br />Patterns worth a closer look.</Typography>
        </Stack>
      </Paper>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, mt: 2.5, position: 'relative' }}>
        {['Text', 'Features', 'Estimates'].map((label, index) => (
          <Box key={label} sx={{ borderTop: `1px solid ${alpha(chrome.accent, 0.4)}`, pt: 1.5 }}>
            <Typography variant="caption" sx={{ color: chrome.accent }}>0{index + 1}</Typography>
            <Typography variant="body2" sx={{ color: chrome.paper, fontWeight: 600 }}>{label}</Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="caption" component="p" sx={{ color: chrome.onDark, mt: 2.5 }}>Illustration of the analysis process, not a sample result.</Typography>
    </Box>
  );
}

export default function HomePage() {
  useEffect(() => { document.title = 'AI Generated Content Detection · Understand your writing'; }, []);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <a href="#main" className="skip-link">Skip to content</a>
      <AppHeader>
          <Stack component="nav" aria-label="Main" direction="row" spacing={{ xs: 0.5, sm: 2 }} sx={{ alignItems: 'center', flexWrap: 'wrap',
            '& .MuiButton-root': { color: chrome.paper, '&:hover': { bgcolor: alpha(chrome.paper, 0.1) } },
            '& .MuiButton-outlined:hover': { bgcolor: chrome.primary, borderColor: chrome.primary } }}>
            <Button href="#how-it-works" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>How it works</Button>
            <Button component={RouterLink} to="/history">History</Button>
            <Button component={RouterLink} to="/analyse" variant="outlined" sx={{ borderColor: chrome.accent }}>Analyse text</Button>
          </Stack>
      </AppHeader>

      <Container component="main" id="main" tabIndex={-1} maxWidth="lg" sx={{ outline: 'none' }}>
        <Box component="section" aria-labelledby="hero-heading" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' }, alignItems: 'center', gap: { xs: 5, md: 7 }, py: { xs: 6, md: 9 } }}>
          <Box>
            <Typography variant="overline" color="primary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Box component="span" aria-hidden sx={{ width: 20, height: 2, bgcolor: 'primary.main' }} /> Writing, examined
            </Typography>
            <Typography id="hero-heading" variant="h1" sx={{ fontSize: { xs: '2.8rem', sm: '3.8rem', lg: '4.4rem' }, lineHeight: 1.06, maxWidth: 580 }}>
              Look beyond<br />the <Box component="span" sx={{ color: 'primary.main' }}>words.</Box>
            </Typography>
            <Typography sx={{ mt: 3, fontSize: { xs: '1.05rem', sm: '1.15rem' }, color: 'text.secondary', maxWidth: 480 }}>
              Explore indicators of AI-generated writing. Understand the patterns in your text with sentence-level estimates and clear visual insights.
            </Typography>
            <Button component={RouterLink} to="/analyse" variant="contained" size="large" endIcon={<ArrowRight size={19} aria-hidden />} sx={{ mt: 3.5, px: 3, minHeight: 52 }}>
              Start analysing
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>Paste text or upload a .txt or .docx file.</Typography>
          </Box>
          <AnalysisIllustration />
        </Box>

        <Box component="section" aria-labelledby="features-heading" sx={{ pb: { xs: 6, md: 8 } }}>
          <Typography variant="overline" color="primary">A clearer view</Typography>
          <Typography id="features-heading" variant="h2" sx={{ mb: 3, mt: 0.5 }}>One passage. More perspective.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}>
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <Paper key={title} component="article" variant="outlined" sx={{ p: 3, transition: 'border-color 160ms', '&:hover': { borderColor: chrome.accent } }}>
                <Box sx={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 2, bgcolor: chrome.surface, color: chrome.primary, mb: 2.5 }}><Icon size={23} aria-hidden /></Box>
                <Typography variant="h3" sx={{ fontSize: '1.1rem', mb: 1 }}>{title}</Typography>
                <Typography variant="body2" color="text.secondary">{description}</Typography>
              </Paper>
            ))}
          </Box>
        </Box>

        <Box component="section" id="how-it-works" aria-labelledby="steps-heading" sx={{ scrollMarginTop: 100, borderTop: 1, borderColor: 'divider', py: { xs: 5, md: 7 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' }, gap: 4 }}>
          <Box>
            <Typography variant="overline" color="primary">How it works</Typography>
            <Typography id="steps-heading" variant="h2" sx={{ mt: 0.5 }}>A thoughtful check,<br />in three steps.</Typography>
          </Box>
          <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 3 }}>
            {STEPS.map(([title, description], index) => (
              <Box component="li" key={title} sx={{ display: 'flex', gap: 2 }}>
                <Typography aria-hidden sx={{ fontWeight: 700, color: 'primary.main', fontVariantNumeric: 'tabular-nums', pt: 0.25 }}>0{index + 1}</Typography>
                <Box><Typography variant="h3" sx={{ fontSize: '1.05rem', mb: 0.5 }}>{title}</Typography><Typography variant="body2" color="text.secondary">{description}</Typography></Box>
              </Box>
            ))}
          </Box>
        </Box>

        <Box component="aside" aria-label="Understanding the results" sx={{ bgcolor: chrome.surface, borderRadius: 2, p: { xs: 2.5, sm: 3 }, mb: 6, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Info size={22} color={chrome.primary} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
          <Box>
            <Typography sx={{ fontWeight: 700, color: chrome.deep, mb: 0.5 }}>An indicator, not a verdict.</Typography>
            <Typography variant="body2" color="text.secondary">AI-detection results are probabilistic estimates and can be wrong. They are not definitive proof of authorship. Always consider the context and other evidence when interpreting a result.</Typography>
          </Box>
        </Box>
      </Container>
      <Box component="footer" sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Container maxWidth="lg" sx={{ py: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">AI Generated Content Detection</Typography>
          <Stack direction="row" spacing={3}>
            <Link component={RouterLink} to="/analyse" underline="hover" variant="body2">Analyse text</Link>
            <Link component={RouterLink} to="/settings" underline="hover" variant="body2">Settings</Link>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
