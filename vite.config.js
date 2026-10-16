import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Strict CSP for packaged builds only (the dev server needs inline scripts for HMR).
const CSP = "default-src 'self' cdnx:; img-src 'self' cdnx: data: blob: https:; media-src 'self' cdnx: blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self'; connect-src 'self' cdnx:; frame-src cdnx: blob:";
const cspPlugin = {
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

export default defineConfig({
  plugins: [react(), cspPlugin],
  base: './',
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 3000 },
});
