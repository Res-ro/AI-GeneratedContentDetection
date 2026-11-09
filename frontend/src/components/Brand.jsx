import { Box, Typography } from '@mui/material';
import { ScanText } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { chrome } from '../theme.js';

export default function Brand({ inverse = false }) {
  return (
    <Box component={RouterLink} to="/" aria-label="AI Generated Content Detection home"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.25, textDecoration: 'none', color: inverse ? chrome.paper : chrome.deep }}>
      <Box sx={{ display: 'grid', placeItems: 'center', width: 38, height: 38, flexShrink: 0,
        bgcolor: inverse ? chrome.primary : chrome.surface, color: inverse ? chrome.paper : chrome.primary, borderRadius: '10px' }}>
        <ScanText size={23} aria-hidden />
      </Box>
      <Typography component="span" sx={{ fontSize: { xs: '0.85rem', sm: '0.95rem' }, fontWeight: 750, lineHeight: 1.25 }}>
        AI Generated<br />Content Detection
      </Typography>
    </Box>
  );
}
