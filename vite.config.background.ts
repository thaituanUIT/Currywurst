import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import manifest from './manifest.json' with { type: 'json' };

export default defineConfig({
  publicDir: false,
  build: {
    outDir: `dist/${manifest.version}/extension`,
    emptyOutDir: false,
    lib: { entry: resolve(import.meta.dirname, 'src/background/index.ts'), name: 'CurrywurstWorker', formats: ['iife'], fileName: () => 'background.js' },
  },
});
