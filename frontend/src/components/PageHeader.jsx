import { useEffect } from 'react';
import { Box, Typography } from '@mui/material';

/** Overline + heading at the top of each screen; also sets the browser tab title. */
export default function PageHeader({ overline, title, subtitle, action }) {
  useEffect(() => {
    document.title = `${title} · AI Generated Content Detection`;
  }, [title]);

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap', mb: { xs: 2, sm: 3 } }}>
      <Box sx={{ flex: '1 1 320px', minWidth: 0 }}>
        {overline && (
          <Typography variant="overline" color="text.secondary" component="p">
            {overline}
          </Typography>
        )}
        <Typography variant="h1" sx={{ fontSize: { xs: '1.6rem', sm: '2rem' } }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action}
    </Box>
  );
}
