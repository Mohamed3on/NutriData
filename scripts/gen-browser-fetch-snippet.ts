#!/usr/bin/env bun
// Emits scripts/browser-fetch.js: a self-contained snippet the user pastes
// into the devtools console on https://tienda.mercadona.es/. It fetches every
// product ID still missing from data/mercadona-media.jsonl using the browser's
// own session, then downloads a JSONL file the companion merge step ingests.

import { readFile, writeFile, access } from 'node:fs/promises';

const SOURCE_HTML = '/Users/mohamed/personal/extensions/NutriData/mercadona-nutriscore.html';
const JSONL = '/Users/mohamed/personal/extensions/NutriData/data/mercadona-media.jsonl';
const OUT = '/Users/mohamed/personal/extensions/NutriData/scripts/browser-fetch.js';

const html = await readFile(SOURCE_HTML, 'utf8');
const allIds = [...new Set([...html.matchAll(/tienda\.mercadona\.es\/product\/(\d+)\//g)].map(m => m[1]))];

const done = new Set<string>();
if (await access(JSONL).then(() => true).catch(() => false)) {
  for (const line of (await readFile(JSONL, 'utf8')).split('\n')) {
    if (!line.trim()) continue;
    try { done.add(JSON.parse(line).product_id); } catch {}
  }
}
const pending = allIds.filter(id => !done.has(id));
console.log(`${allIds.length} total, ${done.size} done, ${pending.length} pending`);

const snippet = `(async () => {
  // Akamai tolerates ~1 req/s from the browser session. Hitting it faster
  // (or in parallel) trips a 403 cooldown after ~50 requests. So: serial
  // fetches, 1-2s jitter between each, and a 45s pause + 429 backoff when a
  // 403 comes in. Results stream to localStorage after every success so
  // closing the tab / reloading doesn't lose progress — re-paste the snippet
  // and it resumes.
  const IDS = ${JSON.stringify(pending)};
  const LS_KEY = 'mercadona_browser_fetch_v1';
  const cache = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  const results = Object.values(cache);
  const errors = { gone: 0, other: 0 };
  let okCount = Object.values(cache).filter(r => !r.gone).length;
  let goneCount = Object.values(cache).filter(r => r.gone).length;
  console.log('resumable: ' + results.length + ' already cached');

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const jitter = () => 1000 + Math.random() * 1000;
  let consecutive403 = 0;

  for (let i = 0; i < IDS.length; i++) {
    const id = IDS[i];
    if (cache[id]) continue;
    try {
      const r = await fetch(\`/api/products/\${id}/?lang=en&wh=vlc1\`, {
        credentials: 'include',
        headers: { 'accept': '*/*', 'content-type': 'application/json' },
      });
      if (r.status === 404) {
        const row = { product_id: id, gone: true };
        cache[id] = row; results.push(row); goneCount++; consecutive403 = 0;
        localStorage.setItem(LS_KEY, JSON.stringify(cache));
      } else if (r.status === 403 || r.status === 429) {
        consecutive403++;
        const wait = Math.min(45000 + consecutive403 * 15000, 180000);
        console.warn(\`[\${id}] \${r.status} — pausing \${wait/1000}s (\${consecutive403} in a row)\`);
        i--; // retry this id after backoff
        await sleep(wait);
        continue;
      } else if (!r.ok) {
        errors.other++;
        console.warn('[' + id + '] ' + r.status);
      } else {
        consecutive403 = 0;
        const d = await r.json();
        const photos = d.photos || [];
        const pickZoom = p => p?.zoom || p?.regular || null;
        const primary = [...photos].filter(p => p.perspective !== 9).sort((a,b) => (a.perspective??99)-(b.perspective??99))[0] || photos[0];
        const nutrition = photos.find(p => p.perspective === 9);
        const pi = d.price_instructions || {};
        const row = {
          product_id: id,
          name_en: d.display_name || null,
          ean: d.ean || null,
          image_primary: pickZoom(primary),
          image_nutrition: pickZoom(nutrition),
          price: pi.unit_price != null ? +pi.unit_price : null,
          price_per_kg: pi.reference_price != null ? +pi.reference_price : null,
          unit_size: pi.unit_size != null ? +pi.unit_size : null,
          reference_format: pi.reference_format || null,
          size_format: pi.size_format || null,
        };
        cache[id] = row; results.push(row); okCount++;
        localStorage.setItem(LS_KEY, JSON.stringify(cache));
        if (okCount % 25 === 0) console.log(\`  \${okCount}/\${IDS.length}  (gone=\${goneCount} other=\${errors.other})\`);
      }
    } catch (e) {
      errors.other++;
      console.warn('[' + id + '] ' + e.message);
    }
    await sleep(jitter());
  }

  console.log(\`DONE: ok=\${okCount} gone=\${goneCount} other=\${errors.other}\`);
  const jsonl = results.map(r => JSON.stringify(r)).join('\\n') + '\\n';
  const blob = new Blob([jsonl], { type: 'application/x-ndjson' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mercadona-media-browser.jsonl';
  a.click();
  console.log('downloaded mercadona-media-browser.jsonl — drop into ~/Downloads and run scripts/merge-browser-fetch.ts');
  console.log('(when done, clear the localStorage cache: localStorage.removeItem(\"' + LS_KEY + '\"))');
})();`;

await writeFile(OUT, snippet);
console.log(`wrote ${OUT}`);
