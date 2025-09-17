
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import manifest from './manifest.json';

import path from 'path';

export default defineConfig({
  build: {
    outDir: 'dist/firefox',
    rollupOptions: {
      input: {
        options: 'options.html',
      },
    },
  },
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
