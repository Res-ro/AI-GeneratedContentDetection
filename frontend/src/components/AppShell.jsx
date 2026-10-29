/**
 * AppShell – the frame around every screen (design: dark title bar with
 * breadcrumbs on the right, side navigation on the left).
 *
 * Responsive (MUI breakpoints, Week 9): from `md` (900px) up there is a side
 * bar; on phones it becomes a bottom navigation bar so every section is one
 * tap away.
 */
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Breadcrumbs,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Toolbar,
  Typography,
} from '@mui/material';
import { ChartColumn, History, ScanText, Settings } from 'lucide-react';
import { chrome } from '../theme.js';
import ErrorBoundary from './ErrorBoundary.jsx';

const NAV = [
  { to: '/', label: 'Analyse', icon: ScanText, match: (p) => p === '/' },
  { to: '/results/passage', label: 'Results', icon: ChartColumn, match: (p) => p.startsWith('/results') },
  { to: '/history', label: 'History', icon: History, match: (p) => p.startsWith('/history') },
  { to: '/settings', label: 'Settings', icon: Settings, match: (p) => p.startsWith('/settings') },
];

const CRUMBS = {
  '/': ['Analyse Text'],
  '/results/passage': ['Results', 'Passage View'],
  '/results/summary': ['Results', 'Summary'],
  '/results/feedback': ['Results', 'Feedback'],
  '/history': ['History'],
  '/settings': ['Settings'],
};

const SIDEBAR_WIDTH = 190;

export default function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const crumbs = CRUMBS[pathname] || ['Page not found'];
  const activeIndex = NAV.findIndex((n) => n.match(pathname));

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <a href="#main" className="no-print" style={skipLinkStyle} onFocus={showSkip} onBlur={hideSkip}>
        Skip to content
      </a>

      <AppBar position="sticky" elevation={0} sx={{ bgcolor: chrome.deep }} className="no-print">
        <Toolbar sx={{ gap: 2, minHeight: { xs: 52, sm: 56 } }}>
          <Typography
            component={RouterLink}
            to="/"
            sx={{ color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: { xs: '1rem', sm: '1.1rem' }, flexGrow: 1 }}
          >
            AI Generated Content Detection
          </Typography>
          <Breadcrumbs
            aria-label="breadcrumb"
            separator="/"
            sx={{
              display: { xs: 'none', sm: 'flex' },
              color: '#d0d0d0',
              fontSize: '0.85rem',
              '& .MuiBreadcrumbs-separator': { color: '#9a9a9a' },
            }}
          >
            <Link component={RouterLink} to="/" underline="hover" color="inherit">
              Home
            </Link>
            {crumbs.map((c, i) => (
              <Typography key={c} sx={{ fontSize: 'inherit', color: i === crumbs.length - 1 ? '#fff' : 'inherit' }}>
                {c}
              </Typography>
            ))}
          </Breadcrumbs>
        </Toolbar>
      </AppBar>

      <Box sx={{ display: 'flex', flex: 1 }}>
        {/* Side bar: tablets and desktops */}
        <Box
          component="nav"
          aria-label="Main"
          className="no-print"
          sx={{
            display: { xs: 'none', md: 'block' },
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            bgcolor: chrome.surface,
            borderRight: `1px solid ${chrome.border}`,
          }}
        >
          <List sx={{ pt: 3, position: 'sticky', top: 56 }}>
            {NAV.map(({ to, label, icon: Icon }, i) => (
              <ListItemButton
                key={to}
                component={RouterLink}
                to={to}
                selected={i === activeIndex}
                aria-current={i === activeIndex ? 'page' : undefined}
                sx={{
                  py: 1.2,
                  '&.Mui-selected': { bgcolor: '#e0e0e0', fontWeight: 700 },
                  '&.Mui-selected:hover': { bgcolor: '#d6d6d6' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 34, color: chrome.primary }}>
                  <Icon size={18} aria-hidden />
                </ListItemIcon>
                <ListItemText primary={label} slotProps={{ primary: { fontWeight: i === activeIndex ? 700 : 400 } }} />
              </ListItemButton>
            ))}
          </List>
        </Box>

        <Box
          component="main"
          id="main"
          tabIndex={-1}
          sx={{
            flex: 1,
            minWidth: 0,
            px: { xs: 1.5, sm: 3, md: 4 },
            py: { xs: 2, sm: 3 },
            pb: { xs: 10, md: 4 },
            outline: 'none',
          }}
        >
          <Box sx={{ maxWidth: 1080, mx: 'auto' }}>
            <ErrorBoundary key={pathname}>
              <Outlet />
            </ErrorBoundary>
          </Box>
        </Box>
      </Box>

      {/* Bottom navigation: phones */}
      <Paper
        className="no-print"
        elevation={8}
        sx={{ display: { xs: 'block', md: 'none' }, position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10 }}
      >
        <BottomNavigation
          component="nav"
          aria-label="Main"
          showLabels
          value={activeIndex === -1 ? false : activeIndex}
          onChange={(_, i) => navigate(NAV[i].to)}
        >
          {NAV.map(({ to, label, icon: Icon }) => (
            <BottomNavigationAction key={to} label={label} icon={<Icon size={20} aria-hidden />} />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}

const skipLinkStyle = {
  position: 'absolute',
  left: -9999,
  top: 8,
  zIndex: 2000,
  background: '#fff',
  padding: '8px 12px',
  borderRadius: 4,
};
function showSkip(e) {
  e.currentTarget.style.left = '8px';
}
function hideSkip(e) {
  e.currentTarget.style.left = '-9999px';
}
