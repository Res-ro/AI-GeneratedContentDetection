/**
 * theme.js – colours and type from the prototype design deck (Theme & Colour System slide).
 *
 * App chrome: dark neutrals, so the only colour on screen is the meaning
 * (green / amber / red likelihood scale), used the same way on every screen.
 * Headings in Cambria, body and data in Calibri, with metric-compatible
 * fallbacks (Caladea / Carlito) for machines that don't have the Office fonts.
 */
import { createTheme } from '@mui/material/styles';

export const chrome = {
  deep: '#333333',
  primary: '#444444',
  mid: '#666666',
  surface: '#f2f2f2',
  page: '#f7f7f7',
  border: '#d9d9d9',
};

// Likelihood scale. `main` is for dots, bars and borders; `text` is darker so
// text on the pale `bg` passes WCAG AA contrast.
export const likelihood = {
  human: { main: '#2f8f5b', text: '#1e6b42', bg: '#dff2e5', border: '#9fd3b3' },
  uncertain: { main: '#b8860b', text: '#7a5900', bg: '#fbf1d3', border: '#e3c66f' },
  ai: { main: '#c0392b', text: '#9e2a1e', bg: '#f9dfdc', border: '#e5a29a' },
};

const headingFont = 'Cambria, Caladea, Georgia, "Times New Roman", serif';
const bodyFont = 'Calibri, Carlito, "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';

const theme = createTheme({
  palette: {
    primary: { main: chrome.deep, contrastText: '#ffffff' },
    secondary: { main: chrome.mid },
    success: { main: likelihood.human.main },
    warning: { main: likelihood.uncertain.main },
    error: { main: likelihood.ai.main },
    background: { default: chrome.page, paper: '#ffffff' },
    text: { primary: '#222222', secondary: '#5c5c5c' },
    divider: chrome.border,
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: bodyFont,
    fontSize: 15,
    h1: { fontFamily: headingFont, fontWeight: 700, fontSize: '2rem' },
    h2: { fontFamily: headingFont, fontWeight: 700, fontSize: '1.6rem' },
    h3: { fontFamily: headingFont, fontWeight: 700, fontSize: '1.3rem' },
    h4: { fontFamily: headingFont, fontWeight: 700, fontSize: '1.1rem' },
    overline: { fontWeight: 700, letterSpacing: '0.12em', fontSize: '0.72rem' },
    button: { textTransform: 'none', fontWeight: 700 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { paddingInline: 18, minHeight: 40 } },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiTooltip: { defaultProps: { arrow: true } },
  },
});

export default theme;
