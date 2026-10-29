/**
 * ErrorBoundary – the fallback page when a screen crashes while rendering.
 * Error boundaries still have to be class components in React 19.
 * The technical message is logged to the console only, never shown to users.
 */
import { Component } from 'react';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { TriangleAlert } from 'lucide-react';

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Screen crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 }, textAlign: 'center' }} role="alert">
        <Box sx={{ color: 'error.main', mb: 1 }}>
          <TriangleAlert size={40} aria-hidden />
        </Box>
        <Typography variant="h2" gutterBottom>
          Something went wrong on this screen
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 520, mx: 'auto' }}>
          The rest of the app still works. Your text and past results are safe. Try reloading, or go back to the Analyse screen.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'center' }}>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Reload page
          </Button>
          <Button variant="outlined" href="/">
            Go to Analyse
          </Button>
        </Stack>
      </Paper>
    );
  }
}
