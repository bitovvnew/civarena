import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The dashboard lives in web/ and builds to dist/web, which the CLI server serves.
// `npm run dev` proxies /api to a running `civarena` (default port 4321).
export default defineConfig({
  root: 'web',
  base: './',
  plugins: [react()],
  publicDir: 'public',
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
  },
  server: {
    proxy: { '/api': 'http://localhost:4321' },
  },
});
