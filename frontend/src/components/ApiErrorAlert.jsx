/**
 * Shows an ApiError from api/client.js in plain language.
 * Everything is rendered as text (React escapes it), never as HTML.
 */
import { Alert, AlertTitle, Box, Button, Typography } from '@mui/material';
import { errorTitle } from '../api/client.js';

export default function ApiErrorAlert({ error, onRetry, onClose }) {
  if (!error) return null;
  const severity = error.code === 'rate_limited' || error.code === 'service_busy' ? 'warning' : 'error';
  return (
    <Alert
      severity={severity}
      onClose={onClose}
      action={
        onRetry && error.code !== 'validation_error' && error.code !== 'invalid_text' ? (
          <Button color="inherit" size="small" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
      sx={{ alignItems: 'flex-start' }}
    >
      <AlertTitle>{errorTitle(error)}</AlertTitle>
      {error.message}
      {error.details?.length > 0 && (
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
          {error.details.map((d, i) => (
            <li key={i}>{d.message}</li>
          ))}
        </Box>
      )}
      {error.requestId && (
        <Typography variant="caption" component="p" sx={{ mt: 0.75, opacity: 0.8 }}>
          Reference: {error.requestId}
        </Typography>
      )}
    </Alert>
  );
}
