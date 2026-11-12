import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import manifest from './manifest.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: false,
  build: {
    manifest: true,
    outDir: `dist/${manifest.version}/extension`,
    emptyOutDir: false,
    rolldownOptions: { input: resolve(import.meta.dirname, 'popup.html') },
  },
});
