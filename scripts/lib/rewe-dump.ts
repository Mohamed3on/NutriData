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

// "3.9 g" → 3.9 ; "\N" / "" / null → null
export function num(s: string | null | undefined): number | null {
  if (!s || s === '\\N') return null;
  const m = String(s).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// energy string → kcal (converts when the value is declared in kJ)
export function kcal(s: string | null | undefined): number | null {
  if (!s || s === '\\N') return null;
  const v = num(s);
  if (v === null) return null;
  return /kj/i.test(String(s)) && !/kcal/i.test(String(s)) ? Math.round(v / 4.184) : v;
}

// REWE nutrition object → compact per-100g array, in the canonical slot order
// used across the extension and site: [protein, carbs, sugar, fat, calories,
// fiber, salt, satFat].
export function toNutriArray(n: Record<string, string>): (number | null)[] {
  return [num(n.protein), num(n.carbs), num(n.sugar), num(n.fat), kcal(n.calories), num(n.fiber), num(n.salt), num(n.saturatedFat)];
}

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
