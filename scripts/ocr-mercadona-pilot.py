#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "google-genai>=1.0",
#     "requests>=2.31",
# ]
# ///
"""Pilot: extract per-100g nutrition values from Mercadona back-of-pack photos
using Gemini's vision model.

Tesseract was tried first and landed at ~2% success (small text, multi-language
side-by-side labels, lost decimal commas). Gemini 2.5 Flash returns structured
JSON directly from the image, which avoids the whole OCR-text-parsing problem.

Usage:
    GEMINI_API_KEY=... scripts/ocr-mercadona-pilot.py --limit 50 \
        --out pilot-results.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Optional

import requests
from google import genai
from google.genai import types

API = "https://tienda.mercadona.es/api"
WH = "vlc1"
LANG = "es"
MODEL = "gemini-3.1-flash-lite-preview"

FOOD_CATEGORIES = [
    78,   # Cereales
    80,   # Galletas
    92,   # Chocolate
    104,  # Yogures naturales y sabores
    122,  # Atún y otras conservas de pescado
    132,  # Patatas fritas y snacks
]

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
    "type": "object",
    "properties": {
        "calories_kcal": {"type": "number", "nullable": True},
        "fat_g": {"type": "number", "nullable": True},
        "saturated_fat_g": {"type": "number", "nullable": True},
        "carbs_g": {"type": "number", "nullable": True},
        "sugars_g": {"type": "number", "nullable": True},
        "fiber_g": {"type": "number", "nullable": True},
        "protein_g": {"type": "number", "nullable": True},
        "salt_g": {"type": "number", "nullable": True},
        "error": {"type": "string", "nullable": True},
    },
}


@dataclass
class ProductRow:
    product_id: str
    ean: Optional[str]
    name: str
    image_url: Optional[str] = None
    parsed: dict = field(default_factory=dict)
    valid: bool = False
    reason: str = ""


def walk_category(cat_id: int) -> list[dict]:
    r = requests.get(f"{API}/categories/{cat_id}/?lang={LANG}&wh={WH}", timeout=15)
    r.raise_for_status()
    out: list[dict] = []
    def walk(node: dict) -> None:
        out.extend(node.get("products", []) or [])
        for sub in node.get("categories", []) or []:
            walk(sub)
    walk(r.json())
    return out


def fetch_product(pid: str) -> Optional[dict]:
    try:
        r = requests.get(f"{API}/products/{pid}/", timeout=15)
        return r.json() if r.status_code == 200 else None
    except requests.RequestException:
        return None


def nutrition_photo(detail: dict) -> Optional[str]:
    for p in detail.get("photos", []) or []:
        if p.get("perspective") == 9:
            return p.get("zoom") or p.get("regular")
    return None


def extract_nutrition(client: genai.Client, image_bytes: bytes) -> dict:
    response = client.models.generate_content(
        model=MODEL,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
            PROMPT,
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=SCHEMA,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    return json.loads(response.text)


def validate(p: dict) -> tuple[bool, str]:
    if p.get("error"):
        return False, f"model reported: {p['error']}"
    required = ("calories_kcal", "protein_g", "carbs_g", "fat_g")
    missing = [k for k in required if p.get(k) is None]
    if missing:
        return False, f"missing: {missing}"
    cal = p["calories_kcal"]
    if cal <= 0:
        return False, "calories=0"
    # EU FIC energy formula: 4P + 4C(net) + 9F + 2·fiber. Fiber has ~2 kcal/g
    # (fermentable portion) so high-fiber foods look 15-20% short without it.
    fiber = p.get("fiber_g") or 0
    computed = 4 * p["protein_g"] + 4 * p["carbs_g"] + 9 * p["fat_g"] + 2 * fiber
    drift = abs(cal - computed) / cal
    if drift > 0.15:
        return False, f"caloric math off by {drift * 100:.0f}% (label={cal}, computed={computed:.0f})"
    for k in ("protein_g", "carbs_g", "fat_g"):
        if p[k] > 100:
            return False, f"{k}={p[k]} exceeds 100/100g"
    return True, "ok"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--out", default="pilot-results.json")
    ap.add_argument("--sleep", type=float, default=0.1)
    args = ap.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: set GEMINI_API_KEY", file=sys.stderr)
        return 2
    client = genai.Client(api_key=api_key)

    per_category: list[list[dict]] = []
    for cid in FOOD_CATEGORIES:
        print(f"[cat {cid}] fetching listing…", file=sys.stderr)
        try:
            per_category.append(walk_category(cid))
        except requests.RequestException as e:
            print(f"[cat {cid}] failed: {e}", file=sys.stderr)
            per_category.append([])

    sample: list[dict] = []
    i = 0
    while len(sample) < args.limit and any(i < len(lst) for lst in per_category):
        for lst in per_category:
            if i < len(lst) and len(sample) < args.limit:
                sample.append(lst[i])
        i += 1

    print(f"sampling {len(sample)} products across {len(FOOD_CATEGORIES)} categories", file=sys.stderr)

    rows: list[ProductRow] = []
    stats = {"ok": 0, "bad": 0, "no_image": 0, "no_detail": 0, "api_error": 0}

    for n, p in enumerate(sample, 1):
        pid = str(p.get("id"))
        name = (p.get("display_name") or "")[:80]
        row = ProductRow(product_id=pid, ean=None, name=name)

        detail = fetch_product(pid)
        time.sleep(args.sleep)
        if not detail:
            row.reason = "product detail fetch failed"
            stats["no_detail"] += 1
            rows.append(row)
            continue
        row.ean = detail.get("ean")
        url = nutrition_photo(detail)
        row.image_url = url
        if not url:
            row.reason = "no perspective=9 photo"
            stats["no_image"] += 1
            rows.append(row)
            continue

        try:
            img_r = requests.get(url, timeout=20)
            img_r.raise_for_status()
            row.parsed = extract_nutrition(client, img_r.content)
        except Exception as e:
            row.reason = f"gemini failed: {e}"
            stats["api_error"] += 1
            rows.append(row)
            continue

        row.valid, row.reason = validate(row.parsed)
        stats["ok" if row.valid else "bad"] += 1
        rows.append(row)

        if n % 10 == 0 or n == len(sample):
            print(f"  [{n}/{len(sample)}] ok={stats['ok']} bad={stats['bad']} no_image={stats['no_image']} api_err={stats['api_error']}", file=sys.stderr)

        time.sleep(args.sleep)

    out_path = Path(args.out)
    out_path.write_text(json.dumps({
        "stats": stats,
        "total": len(rows),
        "success_rate": stats["ok"] / len(rows) if rows else 0,
        "rows": [asdict(r) for r in rows],
    }, ensure_ascii=False, indent=2))

    print(f"\nwrote {out_path} ({len(rows)} rows)")
    print(f"  valid: {stats['ok']}  invalid: {stats['bad']}  no_image: {stats['no_image']}  api_err: {stats['api_error']}")
    if rows:
        print(f"  success rate: {stats['ok'] / len(rows) * 100:.1f}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
