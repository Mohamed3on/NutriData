#!/usr/bin/env bun
// Submit a built extension to the Chrome Web Store for review, if the store is
// behind it. Safe to run anytime: it does nothing when the store already has
// this version, or while an earlier one is still in review. CI runs it after
// every release and daily (.github/workflows/chrome-web-store.yml); locally:
//
//   pnpm build:chrome && bun scripts/publish-chrome-web-store.ts dist/chrome pkgppeffgmpdjldplgbplbfcmckjemao
//
// Nothing here is NutriData-specific: pass any unpacked build and its item ID.
// Auth is the publisher's service account (Settings → Service account in the
// developer dashboard), which can publish every item. Its key comes from
// $CWS_SERVICE_ACCOUNT_KEY (CI) or ~/.config/chrome-web-store/service-account.json.

import { createSign } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { $ } from 'bun';

const [dirArg, itemId] = process.argv.slice(2);
if (!dirArg || !itemId) throw new Error('usage: bun publish-chrome-web-store.ts <extension-dir> <item-id>');
const dir = resolve(dirArg);
const ITEM = `publishers/${process.env.CWS_PUBLISHER_ID || 'fc1b63ae-ef56-4330-8395-9e656a1b7b0d'}/items/${itemId}`;
const API = 'https://chromewebstore.googleapis.com';

async function api(url: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url} → ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function accessToken(): Promise<string> {
  const key = JSON.parse(
    process.env.CWS_SERVICE_ACCOUNT_KEY ||
      (await Bun.file(`${homedir()}/.config/chrome-web-store/service-account.json`).text()),
  );
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const jwt = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/chromewebstore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = createSign('RSA-SHA256').update(jwt).sign(key.private_key, 'base64url');
  const { access_token } = await api('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${jwt}.${sig}` }),
  });
  return access_token;
}

const isNewer = (a: string, b: string): boolean => {
  const [pa, pb] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
};

const headers = { Authorization: `Bearer ${await accessToken()}` };
const fetchStatus = () => api(`${API}/v2/${ITEM}:fetchStatus`, { headers });

const status = await fetchStatus();
const version: string = (await Bun.file(`${dir}/manifest.json`).json()).version;
// Highest version the store has seen, published or submitted (a rejected
// version counts too: resubmitting the same package would be rejected again).
const store: string = [status.publishedItemRevisionStatus, status.submittedItemRevisionStatus]
  .flatMap((s) => s?.distributionChannels?.map((c: { crxVersion: string }) => c.crxVersion) ?? [])
  .reduce((max: string, v: string) => (isNewer(v, max) ? v : max), '0');

if (!isNewer(version, store)) {
  console.log(`Store already has ${store}`);
  process.exit(0);
}
if (status.submittedItemRevisionStatus?.state === 'PENDING_REVIEW') {
  console.log(`${store} is still in review; ${version} gets submitted on a later run`);
  process.exit(0);
}
// CI builds from a clean checkout; locally, refuse to ship work in progress.
if (!process.env.CI && (await $`git -C ${dir} status --porcelain --untracked-files=no`.nothrow().text()).trim())
  throw new Error('Uncommitted changes may be in this build; commit or stash them first');

// Hidden entries (.vite/, .DS_Store) are build leftovers, not extension files.
const zip = `${tmpdir()}/${itemId}-${version}.zip`;
await $`rm -f ${zip} && zip -qr ${zip} . -x ${'.*'} ${'*/.*'}`.cwd(dir);

let { uploadState: state } = await api(`${API}/upload/v2/${ITEM}:upload`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/zip' },
  body: Bun.file(zip),
});
for (let i = 0; state === 'IN_PROGRESS' && i < 30; i++) {
  await Bun.sleep(10_000);
  ({ lastAsyncUploadState: state } = await fetchStatus());
}
if (state !== 'SUCCEEDED') throw new Error(`Upload of ${version} ended in state ${state}`);

const submitted = await api(`${API}/v2/${ITEM}:publish`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: '{}',
});
console.log(`Submitted ${version} for review: ${submitted.state}`);
