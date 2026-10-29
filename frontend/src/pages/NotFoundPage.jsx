import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Button, Paper, Stack, Typography } from '@mui/material';
import PageHeader from '../components/PageHeader.jsx';

/** 404 – any address that isn't one of the routes in App.jsx. */
export default function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <>
      <PageHeader overline="Error 404" title="Page not found" />
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 }, textAlign: 'center' }}>
        <Typography sx={{ mb: 1, overflowWrap: 'anywhere' }}>
          There’s no page at <code>{pathname}</code>.
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Check the address, or use one of the links below.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'center' }}>
          <Button variant="contained" component={RouterLink} to="/">
            Analyse text
          </Button>
          <Button variant="outlined" component={RouterLink} to="/history">
            View History
          </Button>
        </Stack>
      </Paper>
    </>
  );
}
