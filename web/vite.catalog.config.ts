import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The component catalogue, for development and for web/tests/catalog.mjs.
//
//   npx vite --config vite.catalog.config.ts     # then open /catalog.html
//
// A config of its own so the tests can start it without the app's proxy to a
// backend, and so the production build (vite.config.ts, index.html only) never
// picks the catalogue up (spec 001, research P6).
export default defineConfig({
  define: { __SALT_VERSION__: JSON.stringify('catalog'), __SALT_DEMO__: false },
  plugins: [react()],
  server: { open: process.env.CI ? false : '/catalog.html' },
});
