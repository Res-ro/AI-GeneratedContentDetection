/** Brand tokens are separate from the unchanged semantic likelihood scale. */
import { alpha, createTheme } from '@mui/material/styles';

export const chrome = {
  deep: '#1B2845',
  primary: '#4F46E5',
  primaryHover: '#3730A3',
  mid: '#526079',
  surface: '#EEF2FF',
  page: '#F6F8FC',
  paper: '#FFFFFF',
  border: '#DCE2EF',
  onDark: '#CDD5EF',
  accent: '#A5B4FC',
  ink: '#202C43',
};

// Likelihood scale. `main` is for dots, bars and borders; `text` is darker so
// text on the pale `bg` passes WCAG AA contrast.
export const likelihood = {
  human: { main: '#2f8f5b', text: '#1e6b42', bg: '#dff2e5', border: '#9fd3b3' },
  uncertain: { main: '#b8860b', text: '#7a5900', bg: '#fbf1d3', border: '#e3c66f' },
  ai: { main: '#c0392b', text: '#9e2a1e', bg: '#f9dfdc', border: '#e5a29a' },
};

const bodyFont = '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif';
const headingFont = bodyFont;

const theme = createTheme({
  palette: {
    primary: { main: chrome.primary, dark: chrome.primaryHover, contrastText: chrome.paper },
    secondary: { main: chrome.mid },
    success: { main: likelihood.human.main },
    warning: { main: likelihood.uncertain.main },
    error: { main: likelihood.ai.main },
    background: { default: chrome.page, paper: chrome.paper },
    text: { primary: chrome.ink, secondary: chrome.mid },
    divider: chrome.border,
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: bodyFont,
    fontSize: 15,
    h1: { fontFamily: headingFont, color: chrome.deep, fontWeight: 750, fontSize: '2rem', letterSpacing: '-0.04em' },
    h2: { fontFamily: headingFont, color: chrome.deep, fontWeight: 700, fontSize: '1.6rem', letterSpacing: '-0.03em' },
    h3: { fontFamily: headingFont, color: chrome.deep, fontWeight: 700, fontSize: '1.3rem', letterSpacing: '-0.02em' },
    h4: { fontFamily: headingFont, color: chrome.deep, fontWeight: 700, fontSize: '1.1rem' },
    body1: { lineHeight: 1.65 },
    body2: { lineHeight: 1.6 },
    overline: { fontWeight: 700, letterSpacing: '0.12em', fontSize: '0.72rem' },
    button: { textTransform: 'none', fontWeight: 700 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': { '--brand-focus': chrome.primary, '--brand-paper': chrome.paper, '--brand-ink': chrome.deep },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { paddingInline: 18, minHeight: 44, borderRadius: 9 } },
    },
    MuiButtonBase: {
      styleOverrides: { root: { '&.Mui-focusVisible': { outline: `3px solid ${chrome.primary}`, outlineOffset: 2 } } },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { boxShadow: `0 4px 20px ${alpha(chrome.deep, 0.035)}`, '@media print': { boxShadow: 'none' } },
      },
    },
    MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: chrome.paper } } },
    MuiTab: {
      styleOverrides: { root: { textTransform: 'none', fontWeight: 650, '&.Mui-selected': { backgroundColor: chrome.surface } } },
    },
    MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: 3 } } },
    MuiTableCell: { styleOverrides: { head: { backgroundColor: chrome.page } } },
    MuiBottomNavigationAction: {
      styleOverrides: { root: { minWidth: 0, '&.Mui-selected': { backgroundColor: chrome.surface } } },
    },
    MuiTooltip: { defaultProps: { arrow: true } },
  },
});

export default theme;
