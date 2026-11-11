// Shared helpers for the REWE data pipeline: Postgres pg_dump parsing and
// nutrition normalisation. Used by build-rewe-data.ts (dump → JSON), seed-d1.ts
// (dump → seed SQL) and export-rewe-from-d1.ts (D1 → JSON), so the COPY-block
// slicing, the text[] parser, and the nutrition→compact-array mapping live in
// one place instead of drifting across three scripts.

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

// Parse a Postgres text[] literal like: {"A, B",C,D}
export function parseArr(s: string): string[] {
  s = s.replace(/^{|}$/g, '');
  const out: string[] = [];
  let cur = '', inq = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') { inq = !inq; continue; }
    if (c === ',' && !inq) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

// "\N" / "" / null → null, else the string unchanged (Postgres COPY null guard)
export function nz(s: string | null | undefined): string | null {
  return !s || s === '\\N' ? null : s;
}

// Nutrition normalisation lives with the card code, which the site page bundles too.
export { num, kcal, toNutriArray } from './rewe-card';

// Read a plain-SQL pg_dump (optionally gzipped) and slice the public.product
// COPY block. Returns the data rows plus a column accessor backed by a
// precomputed name→index map.
export function readProductCopyBlock(dumpPath: string): {
  rows: string[];
  col: (fields: string[], name: string) => string | undefined;
} {
  let buf = readFileSync(dumpPath);
  if (dumpPath.endsWith('.gz')) buf = gunzipSync(buf);
  const text = buf.toString('utf8');
  const copyIdx = text.indexOf('COPY public.product (');
  if (copyIdx < 0) throw new Error('public.product COPY block not found');
  const headerEnd = text.indexOf('\n', copyIdx);
  const header = text.slice(copyIdx, headerEnd);
  const cols = header.slice(header.indexOf('(') + 1, header.indexOf(')')).split(',').map((c) => c.trim().replace(/"/g, ''));
  const idx: Record<string, number> = Object.fromEntries(cols.map((c, i) => [c, i]));
  const term = text.indexOf('\n\\.\n', headerEnd);
  const rows = text.slice(headerEnd + 1, term).split('\n').filter(Boolean);
  return { rows, col: (fields, name) => fields[idx[name]] };
}
