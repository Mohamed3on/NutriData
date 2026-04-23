#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "aiohttp>=3.9",
# ]
# ///
"""Harvest every food product from Mercadona's catalog.

Per product we capture:
  - English display_name (lang=en)
  - EAN, category path
  - image_url: back-of-pack nutrition photo (perspective=9) for the OCR pipeline
  - image_primary: front-of-pack marketing photo (lowest non-9 perspective)
  - price, price_per_kg, unit_size, reference_format, size_format

Two phases:
1. Walk the food category tree (fast, ~100 small calls).
2. Fetch per-product detail concurrently (~8k calls; this is the bottleneck,
   async with a concurrency cap keeps wall time in single-digit minutes).

Output is streamed JSONL (one product per line) so a Ctrl-C leaves a
resumable file. Re-running with the same --out skips IDs already present.

Usage:
    scripts/harvest-mercadona-products.py --out mercadona-products.jsonl
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path
from typing import Any, Optional

import aiohttp

API = "https://tienda.mercadona.es/api"
WH = "vlc1"
LANG = "es"

# Top-level categories the user considers "food". The `?categories` endpoint
# only works at subcategory level, so we walk these roots' subtrees.
FOOD_ROOTS = {
    1,   # Fruta y verdura
    2,   # Marisco y pescado
    3,   # Carne
    4,   # Charcutería y quesos
    5,   # Panadería y pastelería
    6,   # Huevos, leche y mantequilla
    7,   # Cereales y galletas
    8,   # Cacao, café e infusiones
    9,   # Azúcar, caramelos y chocolate
    10,  # Zumos
    11,  # Postres y yogures
    12,  # Aceite, especias y salsas
    13,  # Arroz, legumbres y pasta
    14,  # Conservas, caldos y cremas
    15,  # Aperitivos
    16,  # Pizzas y platos preparados
    17,  # Congelados
    18,  # Agua y refrescos
    19,  # Bodega
    24,  # Bebé
}

CONCURRENCY = 20
DETAIL_RETRIES = 3
DETAIL_RETRY_BACKOFF = 2.0


async def http_json(session: aiohttp.ClientSession, url: str, retries: int = 2) -> Optional[Any]:
    for attempt in range(retries + 1):
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=20)) as r:
                if r.status == 404:
                    return None
                if r.status >= 500 or r.status == 429:
                    raise aiohttp.ClientResponseError(
                        r.request_info, r.history, status=r.status,
                        message=r.reason or "", headers=r.headers,
                    )
                r.raise_for_status()
                return await r.json()
        except (aiohttp.ClientError, asyncio.TimeoutError):
            if attempt == retries:
                raise
            await asyncio.sleep(DETAIL_RETRY_BACKOFF * (2 ** attempt))
    return None


async def fetch_root_listing(session: aiohttp.ClientSession) -> list[dict]:
    data = await http_json(session, f"{API}/categories/?lang={LANG}&wh={WH}")
    return data.get("results", []) if data else []


async def walk_subcategory(
    session: aiohttp.ClientSession,
    cat_id: int,
    path: tuple[int, ...],
) -> list[tuple[dict, tuple[int, ...]]]:
    """Fetch one subcategory and flatten every product in the returned subtree.
    Mercadona nests products inside `categories[].products` rather than exposing
    them at top level, so a single fetch already covers the whole subtree."""
    data = await http_json(session, f"{API}/categories/{cat_id}/?lang={LANG}&wh={WH}")
    if not data:
        return []
    out: list[tuple[dict, tuple[int, ...]]] = []

    def extract(node: dict, current_path: tuple[int, ...]) -> None:
        for p in node.get("products", []) or []:
            out.append((p, current_path))
        for child in node.get("categories", []) or []:
            cid = child.get("id")
            extract(child, current_path + (cid,) if cid is not None else current_path)

    extract(data, path + (cat_id,))
    return out


async def collect_products(session: aiohttp.ClientSession) -> dict[str, dict]:
    """Phase 1: category tree walk. Returns {product_id: {name, category_path}}."""
    roots = await fetch_root_listing(session)
    food_roots = [r for r in roots if r["id"] in FOOD_ROOTS]
    print(f"walking {len(food_roots)} food roots…", file=sys.stderr)

    tasks = []
    for root in food_roots:
        for sub in root.get("categories", []) or []:
            tasks.append(walk_subcategory(session, sub["id"], (root["id"],)))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    products: dict[str, dict] = {}
    for result in results:
        if isinstance(result, Exception):
            print(f"  subtree failed: {result}", file=sys.stderr)
            continue
        for p, path in result:
            pid = str(p.get("id"))
            if not pid or pid in products:
                continue
            products[pid] = {
                "name": (p.get("display_name") or "")[:120],
                "category_path": list(path),
            }
    return products


def _pick_zoom(photo: Optional[dict]) -> Optional[str]:
    if not photo:
        return None
    return photo.get("zoom") or photo.get("regular")


def _pick_primary(photos: list[dict]) -> Optional[str]:
    """Front-of-pack marketing shot: lowest perspective that isn't 9 (nutrition
    label). Most SKUs have perspective=2; fall back to the first available."""
    non_nutrition = sorted(
        (p for p in photos if p.get("perspective") != 9),
        key=lambda p: p.get("perspective") or 99,
    )
    return _pick_zoom(non_nutrition[0] if non_nutrition else (photos[0] if photos else None))


async def fetch_detail(
    session: aiohttp.ClientSession,
    sem: asyncio.Semaphore,
    pid: str,
    meta: dict,
) -> dict:
    async with sem:
        try:
            d = await http_json(session, f"{API}/products/{pid}/?lang=en", retries=DETAIL_RETRIES)
        except Exception as e:
            return {"product_id": pid, "error": f"detail fetch: {e}", **meta}
        if not d:
            return {"product_id": pid, "error": "product not found", **meta}
        photos = d.get("photos", []) or []
        img_nutrition = _pick_zoom(next((p for p in photos if p.get("perspective") == 9), None))
        img_primary = _pick_primary(photos)
        pi = d.get("price_instructions") or {}
        return {
            "product_id": pid,
            "ean": d.get("ean"),
            "name": (d.get("display_name") or meta.get("name") or "")[:120],
            "image_url": img_nutrition,  # back-of-pack, used by OCR pipeline
            "image_primary": img_primary,  # front-of-pack marketing shot
            "price": pi.get("unit_price"),
            "price_per_kg": pi.get("reference_price"),
            "unit_size": pi.get("unit_size"),
            "reference_format": pi.get("reference_format"),
            "size_format": pi.get("size_format"),
            "category_path": meta.get("category_path"),
        }


def load_existing(path: Path) -> set[str]:
    if not path.exists():
        return set()
    seen = set()
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                seen.add(str(json.loads(line)["product_id"]))
            except Exception:
                continue
    return seen


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="mercadona-products.jsonl")
    ap.add_argument("--concurrency", type=int, default=CONCURRENCY)
    ap.add_argument("--limit", type=int, default=0, help="cap product count (0=all)")
    args = ap.parse_args()

    out_path = Path(args.out)
    seen = load_existing(out_path)
    if seen:
        print(f"resuming: {len(seen)} products already in {out_path}", file=sys.stderr)

    t0 = time.time()
    connector = aiohttp.TCPConnector(limit=args.concurrency * 2)
    # Mercadona's API 403s non-browser User-Agents.
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"}
    async with aiohttp.ClientSession(connector=connector, headers=headers) as session:
        products = await collect_products(session)
        print(f"phase 1 done: {len(products)} unique products in {time.time()-t0:.1f}s", file=sys.stderr)

        pending = {pid: meta for pid, meta in products.items() if pid not in seen}
        if args.limit:
            pending = dict(list(pending.items())[: args.limit])
        print(f"phase 2: fetching details for {len(pending)} products (concurrency={args.concurrency})…", file=sys.stderr)

        sem = asyncio.Semaphore(args.concurrency)
        tasks = [fetch_detail(session, sem, pid, meta) for pid, meta in pending.items()]

        stats = {"ok_with_image": 0, "ok_no_image": 0, "error": 0}
        done = 0
        # Append mode — writes stream as each fetch completes.
        with out_path.open("a") as out:
            for coro in asyncio.as_completed(tasks):
                row = await coro
                out.write(json.dumps(row, ensure_ascii=False) + "\n")
                out.flush()
                done += 1
                if row.get("error"):
                    stats["error"] += 1
                elif row.get("image_url"):
                    stats["ok_with_image"] += 1
                else:
                    stats["ok_no_image"] += 1
                if done % 100 == 0 or done == len(pending):
                    elapsed = time.time() - t0
                    rate = done / elapsed if elapsed else 0
                    print(
                        f"  [{done}/{len(pending)}] with_image={stats['ok_with_image']} "
                        f"no_image={stats['ok_no_image']} error={stats['error']} "
                        f"elapsed={elapsed:.0f}s rate={rate:.1f}/s",
                        file=sys.stderr,
                    )

    total = len(seen) + done
    print(f"\ndone in {time.time()-t0:.1f}s — {total} products total")
    print(f"  with_image: {stats['ok_with_image']}  no_image: {stats['ok_no_image']}  error: {stats['error']}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
