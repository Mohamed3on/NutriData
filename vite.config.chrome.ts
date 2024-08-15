import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './chrome/manifest.json';

export default defineConfig({
  build: { outDir: 'dist/chrome' },
  plugins: [crx({ manifest })],
});
