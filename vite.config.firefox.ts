import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import fs from 'fs';
import path from 'path';

const manifestPath = path.resolve(__dirname, 'firefox/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Remove unwanted properties
delete manifest.use_dynamic_url;

export default defineConfig({
  build: {
    outDir: 'dist/firefox',
  },
  plugins: [
    crx({ manifest })
  ],
});
