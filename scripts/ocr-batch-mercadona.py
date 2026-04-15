#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "google-genai>=1.0",
#     "aiohttp>=3.9",
# ]
# ///
"""OCR Mercadona products that aren't in the bundled nutrients file.

Uses Gemini Flex inference (50% off standard, same as Batch) with concurrent
async calls. Persists each result to data/ocr-results.jsonl as it lands so a
crash doesn't lose progress, and re-runs skip already-OCR'd productIds.

Usage:
    GEMINI_API_KEY=... scripts/ocr-batch-mercadona.py [--limit N] [--concurrency 20]
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
from google import genai
from google.genai import types

REPO = Path(__file__).resolve().parent.parent
HARVEST = Path('/tmp/nutridata-pilot/products.jsonl')
BUNDLE = REPO / 'public/mercadona-nutrients.json'
OCR_LOG = REPO / 'data/ocr-results.jsonl'
WHACKY_LOG = Path('/tmp/nutridata-batch/whacky.jsonl')

MODEL = 'gemini-3.1-flash-lite-preview'
BEBE_ROOT_ID = 24

PROMPT = """Extract the per-100g nutrition values from this Spanish food label.

Return ONLY a JSON object with these keys (numbers, not strings). Use null for
any value not visible on the label. Use the per-100g column (NOT per-serving).
Decimal separator in the label is a comma — convert to dot.

{
  "calories_kcal": <number>,
  "fat_g": <number>,
  "saturated_fat_g": <number>,
  "carbs_g": <number>,
  "sugars_g": <number>,
  "fiber_g": <number>,
  "protein_g": <number>,
  "salt_g": <number>
}

If the image has no nutrition table visible, return {"error": "no_label"}."""

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "calories_kcal": {"type": "NUMBER", "nullable": True},
        "fat_g": {"type": "NUMBER", "nullable": True},
        "saturated_fat_g": {"type": "NUMBER", "nullable": True},
        "carbs_g": {"type": "NUMBER", "nullable": True},
        "sugars_g": {"type": "NUMBER", "nullable": True},
        "fiber_g": {"type": "NUMBER", "nullable": True},
        "protein_g": {"type": "NUMBER", "nullable": True},
        "salt_g": {"type": "NUMBER", "nullable": True},
        "error": {"type": "STRING", "nullable": True},
    },
}

# Compact array layout — must match build-off-cache.py / runtime extension.
NUTRIENT_ORDER = [
    'protein_g', 'carbs_g', 'sugars_g', 'fat_g',
    'calories_kcal', 'fiber_g', 'salt_g', 'saturated_fat_g',
]


def load_bundle() -> dict:
    return json.loads(BUNDLE.read_text()) if BUNDLE.exists() else {}


def load_prior_ocr_ids() -> set[str]:
    if not OCR_LOG.exists():
        return set()
    return {json.loads(l)['product_id'] for l in OCR_LOG.read_text().splitlines() if l.strip()}


def compute_gap(limit: int = 0) -> list[dict]:
    bundle = load_bundle()
    prior = load_prior_ocr_ids()
    gap = []
    with HARVEST.open() as f:
        for line in f:
            r = json.loads(line)
            if r.get('error') or not r.get('ean') or not r.get('image_url'):
                continue
            pid = r['product_id']
            if pid in bundle or pid in prior:
                continue
            path = r.get('category_path') or []
            if path and path[0] == BEBE_ROOT_ID:
                continue
            gap.append(r)
            if limit and len(gap) >= limit:
                break
    return gap


def is_sane(p: dict) -> bool:
    """Required fields + range check + caloric-math drift ≤ 30%.

    Skips the drift check for kcal < 20 — low-cal beverages get most of their
    calories from sweeteners/polyols which 4P+4C+9F doesn't capture, and
    near-zero kcal makes the % drift meaningless.
    """
    required = ('calories_kcal', 'protein_g', 'carbs_g', 'fat_g')
    if any(p.get(k) is None for k in required):
        return False
    P, C, F = p['protein_g'], p['carbs_g'], p['fat_g']
    fi = p.get('fiber_g') or 0
    k = p['calories_kcal']
    if k < 0 or P > 100 or C > 100 or F > 100 or fi > 100:
        return False
    if k < 20:
        return True
    expected = 4 * P + 4 * C + 9 * F + 2 * fi
    return abs(k - expected) / k <= 0.30


async def fetch_image(session: aiohttp.ClientSession, url: str) -> bytes | None:
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=20)) as r:
            r.raise_for_status()
            return await r.read()
    except Exception:
        return None


RETRY_BACKOFFS = [2, 5, 12, 30]


async def call_gemini(client: genai.Client, img_bytes: bytes, service_tier: str | None) -> dict:
    cfg: dict = {
        'response_mime_type': 'application/json',
        'response_schema': SCHEMA,
    }
    if service_tier:
        cfg['service_tier'] = service_tier
    response = await client.aio.models.generate_content(
        model=MODEL,
        contents=[
            types.Part.from_bytes(data=img_bytes, mime_type='image/jpeg'),
            PROMPT,
        ],
        config=cfg,
    )
    return json.loads(response.text)


def _is_overload(err: str) -> bool:
    return any(x in err for x in ('503', '429', 'UNAVAILABLE', 'RESOURCE_EXHAUSTED'))


async def ocr_one(
    client: genai.Client,
    session: aiohttp.ClientSession,
    sem: asyncio.Semaphore,
    row: dict,
    primary_tier: str | None,
    fallback_tier: str | None,
) -> dict | None:
    """Try `primary_tier` with retries; if it keeps 503-ing, try `fallback_tier` once."""
    pid = row['product_id']
    async with sem:
        img_bytes = await fetch_image(session, row['image_url'])
        if not img_bytes:
            return {'pid': pid, 'status': 'image_fail'}

        parsed = None
        last_err = ''
        for backoff in [0, *RETRY_BACKOFFS]:
            if backoff:
                await asyncio.sleep(backoff)
            try:
                parsed = await call_gemini(client, img_bytes, primary_tier)
                break
            except Exception as e:
                last_err = str(e)[:120]
                if not _is_overload(last_err):
                    return {'pid': pid, 'status': f'api_error: {last_err}'}

        if parsed is None and fallback_tier != primary_tier:
            try:
                parsed = await call_gemini(client, img_bytes, fallback_tier)
            except Exception as e:
                return {'pid': pid, 'status': f'api_error_fallback: {str(e)[:120]}'}
        elif parsed is None:
            return {'pid': pid, 'status': f'api_error: {last_err}'}

        if parsed.get('error') == 'no_label':
            return {'pid': pid, 'status': 'no_label'}
        if not is_sane(parsed):
            return {'pid': pid, 'status': 'whacky', 'parsed': parsed}
        return {'pid': pid, 'status': 'ok', 'parsed': parsed}


def append_one(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a') as f:
        f.write(json.dumps(row) + '\n')


def log_ok(result: dict) -> None:
    append_one(OCR_LOG, {
        'product_id': result['pid'],
        'compact': [result['parsed'].get(k) for k in NUTRIENT_ORDER],
        'source': f'ocr-{MODEL}-flex',
        'ts': datetime.now(timezone.utc).isoformat(),
    })


def log_whacky(result: dict) -> None:
    p = result['parsed']
    P = p.get('protein_g') or 0
    C = p.get('carbs_g') or 0
    F = p.get('fat_g') or 0
    fi = p.get('fiber_g') or 0
    k = p.get('calories_kcal') or 0
    expected = 4 * P + 4 * C + 9 * F + 2 * fi
    drift = abs(k - expected) / k if k else None
    append_one(WHACKY_LOG, {
        'product_id': result['pid'],
        'parsed': p,
        'computed_kcal': round(expected, 1),
        'drift_pct': round(drift * 100, 1) if drift else None,
        'ts': datetime.now(timezone.utc).isoformat(),
    })


def regenerate_bundle() -> None:
    if not OCR_LOG.exists():
        print(f'no ocr log at {OCR_LOG} — bundle unchanged')
        return
    bundle = load_bundle()
    added = 0
    for line in OCR_LOG.read_text().splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        if r['product_id'] not in bundle:
            bundle[r['product_id']] = r['compact']
            added += 1
    BUNDLE.write_text(json.dumps(bundle, separators=(',', ':')))
    size_kb = BUNDLE.stat().st_size / 1024
    print(f'bundle: +{added} OCR rows → {BUNDLE} ({size_kb:.1f} KB, {len(bundle)} products)')


async def main_async(args: argparse.Namespace) -> int:
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        print('ERROR: set GEMINI_API_KEY', file=sys.stderr)
        return 2

    gap = compute_gap(args.limit)
    print(f'gap: {len(gap)} products to OCR (concurrency={args.concurrency})')
    if not gap:
        return 0

    client = genai.Client(api_key=api_key)
    primary: str | None = None if args.standard else 'flex'
    # Always fall through to standard if primary keeps 503-ing.
    fallback: str | None = None
    print(f'primary={primary or "standard"} fallback={fallback or "standard"}')
    sem = asyncio.Semaphore(args.concurrency)
    stats = {'ok': 0, 'whacky': 0, 'no_label': 0, 'image_fail': 0, 'api_error': 0}
    t0 = time.time()

    async with aiohttp.ClientSession() as session:
        tasks = [asyncio.create_task(ocr_one(client, session, sem, r, primary, fallback)) for r in gap]
        done = 0
        for coro in asyncio.as_completed(tasks):
            result = await coro
            done += 1
            if not result:
                continue
            status = result['status']
            if status == 'ok':
                stats['ok'] += 1
                log_ok(result)  # immediate flush — crash-safe
            elif status == 'whacky':
                stats['whacky'] += 1
                log_whacky(result)
            elif status.startswith('api_error'):
                stats['api_error'] += 1
                if done <= 5 or done % 100 == 0:
                    print(f'  api_error pid={result["pid"]}: {status}', file=sys.stderr)
            else:
                stats[status] = stats.get(status, 0) + 1
            if done % 50 == 0 or done == len(gap):
                rate = done / (time.time() - t0)
                print(f'  [{done}/{len(gap)}] ok={stats["ok"]} whacky={stats["whacky"]} '
                      f'no_label={stats["no_label"]} api_err={stats["api_error"]} '
                      f'img_fail={stats["image_fail"]} rate={rate:.1f}/s')
    print(f'\ndone in {time.time()-t0:.0f}s')
    print(f'  ok={stats["ok"]} whacky={stats["whacky"]} no_label={stats["no_label"]} '
          f'api_err={stats["api_error"]} img_fail={stats["image_fail"]}')

    regenerate_bundle()
    return 0


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--limit', type=int, default=0, help='cap product count (0=all)')
    p.add_argument('--concurrency', type=int, default=200, help='concurrent in-flight requests')
    p.add_argument('--standard', action='store_true', help='use standard tier (full price) instead of flex')
    args = p.parse_args()
    sys.exit(asyncio.run(main_async(args)))


if __name__ == '__main__':
    main()
