#!/usr/bin/env bun
// Ingests the file the devtools snippet downloaded (mercadona-media-browser.jsonl)
// and appends its successful rows into data/mercadona-media.jsonl, de-duping
// on product_id. 404/'gone' rows are kept so they're not re-fetched.

import { appendFile, readFile, writeFile, access } from 'node:fs/promises';

const DOWNLOADS = `${process.env.HOME}/Downloads/mercadona-media-browser.jsonl`;
const INPUT = process.argv[2] || DOWNLOADS;
const JSONL = '/Users/mohamed/personal/extensions/NutriData/data/mercadona-media.jsonl';

const fileExists = async (p: string) => access(p).then(() => true).catch(() => false);
if (!(await fileExists(INPUT))) { console.error(`not found: ${INPUT}`); process.exit(1); }

const existing = new Map<string, any>();
if (await fileExists(JSONL)) {
  for (const line of (await readFile(JSONL, 'utf8')).split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); existing.set(r.product_id, r); } catch {}
  }
}
const before = existing.size;

let added = 0, updated = 0;
for (const line of (await readFile(INPUT, 'utf8')).split('\n')) {
  if (!line.trim()) continue;
  try {
    const r = JSON.parse(line);
    if (!r.product_id) continue;
    if (existing.has(r.product_id)) updated++; else added++;
    existing.set(r.product_id, r);
  } catch {}
}

await writeFile(JSONL, [...existing.values()].map(r => JSON.stringify(r)).join('\n') + '\n');
console.log(`merged ${INPUT}`);
console.log(`  before: ${before}  added: ${added}  updated: ${updated}  after: ${existing.size}`);
