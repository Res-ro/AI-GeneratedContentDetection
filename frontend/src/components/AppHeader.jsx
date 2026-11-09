import { AppBar, Toolbar } from '@mui/material';
import Brand from './Brand.jsx';
import { chrome } from '../theme.js';

/** Shared header for the homepage and analysis workspace. */
export default function AppHeader({ children }) {
  return (
    <AppBar component="header" position="sticky" elevation={0}
      sx={{ bgcolor: chrome.deep }} className="no-print on-dark">
      <Toolbar sx={{ gap: 2, py: 1, minHeight: { xs: 64, sm: 72 },
        justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Brand inverse />
        {children}
      </Toolbar>
    </AppBar>
  );
}
