/**
 * AppShell – the workspace frame with a shared dark title bar and side navigation.
 *
 * Responsive (MUI breakpoints, Week 9): from `md` (900px) up there is a side
 * bar; on phones it becomes a bottom navigation bar so every section is one
 * tap away.
 */
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BottomNavigation,
  BottomNavigationAction,
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Typography,
} from '@mui/material';
import { ChartColumn, History, ScanText, Settings, ChartNoAxesCombined } from 'lucide-react';
import { chrome } from '../theme.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import AppHeader from './AppHeader.jsx';

const NAV = [
  { to: '/analyse', label: 'Analyse', icon: ScanText, match: (p) => p === '/analyse' },
  { to: '/results/passage', label: 'Results', icon: ChartColumn, match: (p) => p.startsWith('/results') },
  { to: '/model-performance', label: 'Model Performance', mobileLabel: 'Models', icon: ChartNoAxesCombined, match: (p) => p.startsWith('/model-performance') },
  { to: '/history', label: 'History', icon: History, match: (p) => p.startsWith('/history') },
  { to: '/settings', label: 'Settings', icon: Settings, match: (p) => p.startsWith('/settings') },
];

const SIDEBAR_WIDTH = 212;

export default function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeIndex = NAV.findIndex((n) => n.match(pathname));

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <a href="#main" className="no-print skip-link">
        Skip to content
      </a>

      <AppHeader />

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
            bgcolor: 'background.paper',
            borderRight: `1px solid ${chrome.border}`,
          }}
        >
          <List sx={{ px: 1.5, pt: 3, position: 'sticky', top: 88 }}>
            <Typography component="li" variant="overline" color="text.secondary" sx={{ px: 1.5, pb: 1.5, listStyle: 'none' }}>Workspace</Typography>
            {NAV.map(({ to, label, icon: Icon }, i) => (
              <ListItemButton
                key={to}
                component={RouterLink}
                to={to}
                selected={i === activeIndex}
                aria-current={i === activeIndex ? 'page' : undefined}
                sx={{
                  py: 1.2,
                  mb: 0.5,
                  borderRadius: 1,
                  color: i === activeIndex ? 'primary.main' : 'text.secondary',
                  '&.Mui-selected': { bgcolor: chrome.surface, fontWeight: 700 },
                  '&.Mui-selected:hover': { bgcolor: chrome.surface },
                }}
              >
                <ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}>
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
        sx={{ display: { xs: 'block', md: 'none' }, position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10, borderRadius: 0, pb: 'env(safe-area-inset-bottom)', borderTop: 1, borderColor: 'divider' }}
      >
        <BottomNavigation
          component="nav"
          aria-label="Main"
          showLabels
          value={activeIndex === -1 ? false : activeIndex}
          onChange={(_, i) => navigate(NAV[i].to)}
        >
          {NAV.map(({ to, label, mobileLabel, icon: Icon }, i) => (
            <BottomNavigationAction key={to} label={mobileLabel || label} aria-label={label} aria-current={i === activeIndex ? 'page' : undefined} icon={<Icon size={20} aria-hidden />} />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
