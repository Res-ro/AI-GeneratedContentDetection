import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The back end only accepts requests from http://localhost:5173 (CORS, see
// backend/app/config.py), so the port is fixed. strictPort makes Vite stop with
// an error instead of quietly moving to 5174, where every API call would fail.
const PORT = 5173;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiOrigin = new URL(env.VITE_API_BASE_URL || 'http://localhost:8000').origin;

  // Basic security headers for the page itself (what OWASP ZAP checks).
  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };

  return {
    plugins: [react()],
    // MUI + D3 make one big bundle; fine for a class project, so hush the warning.
    build: { chunkSizeWarningLimit: 900 },
    server: {
      port: PORT,
      strictPort: true,
      headers: securityHeaders,
    },
    preview: {
      port: PORT,
      strictPort: true,
      headers: {
        ...securityHeaders,
        // The production build has no inline scripts, so a strict policy works.
        // MUI injects <style> tags at run time, hence 'unsafe-inline' for styles only.
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "font-src 'self'",
          `connect-src 'self' ${apiOrigin}`,
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ].join('; '),
      },
    },
  };
});
