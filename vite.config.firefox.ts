import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  build: {
    outDir: 'dist/firefox',
  },
  plugins: [crx({ manifest })],
});
