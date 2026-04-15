#!/usr/bin/env python3

import argparse
import csv
import json
import re
import sys
import time
import urllib.request
from pathlib import Path


ALGOLIA_APP_ID = "7UZJKL1DJ0"
ALGOLIA_API_KEY = "9d8f2e39e90df472b4f2e559a116fe17"
DEFAULT_WH = "vlc1"
DEFAULT_LANG = "en"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Harvest Mercadona EANs for a search query or category into a newline-delimited file."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--search", help="Mercadona search query, for example 'cheese'.")
    group.add_argument("--category-id", help="Mercadona category id.")
    group.add_argument("--csv", help="CSV file containing Mercadona product ids or product URLs.")
    group.add_argument(
        "--all-categories",
        action="store_true",
        help="Crawl the full Mercadona category tree and harvest all reachable product EANs.",
    )
    parser.add_argument("--warehouse", default=DEFAULT_WH, help=f"Mercadona warehouse id (default: {DEFAULT_WH}).")
    parser.add_argument("--lang", default=DEFAULT_LANG, help=f"Mercadona language code (default: {DEFAULT_LANG}).")
    parser.add_argument("--hits-per-page", type=int, default=100, help="Algolia hits per page for search harvest.")
    parser.add_argument("--delay-ms", type=int, default=0, help="Delay between Mercadona product-detail requests.")
    parser.add_argument(
        "--id-column",
        help="Explicit CSV column to read product ids from. Optional; otherwise auto-detected.",
    )
    parser.add_argument("--output", required=True, help="Output path for newline-delimited EANs.")
    return parser.parse_args()


def http_json(url: str, *, method: str = "GET", headers: dict | None = None, body: bytes | None = None):
    request = urllib.request.Request(url, data=body, method=method)
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_search_product_ids(query: str, warehouse: str, lang: str, hits_per_page: int) -> list[str]:
    url = (
        f"https://{ALGOLIA_APP_ID.lower()}-dsn.algolia.net/1/indexes/"
        f"products_prod_{warehouse}_{lang}/query"
        f"?x-algolia-agent=NutriData"
        f"&x-algolia-api-key={ALGOLIA_API_KEY}"
        f"&x-algolia-application-id={ALGOLIA_APP_ID}"
    )
    payload = json.dumps({"query": query, "hitsPerPage": hits_per_page}).encode("utf-8")
    data = http_json(
        url,
        method="POST",
        headers={"content-type": "text/plain"},
        body=payload,
    )
    return [str(hit["id"]) for hit in data.get("hits", []) if hit.get("id")]


def walk_category_products(node, result: list[str]) -> None:
    if not node:
        return
    for product in node.get("products", []) or []:
        product_id = product.get("id")
        if product_id is not None:
            result.append(str(product_id))
    for child in node.get("categories", []) or []:
        walk_category_products(child, result)


def fetch_category_product_ids(category_id: str, warehouse: str, lang: str) -> list[str]:
    data = http_json(
        f"https://tienda.mercadona.es/api/categories/{category_id}/?lang={lang}&wh={warehouse}"
    )
    result: list[str] = []
    walk_category_products(data, result)
    return result


def fetch_root_category_ids(warehouse: str, lang: str) -> list[str]:
    data = http_json(f"https://tienda.mercadona.es/api/categories/?lang={lang}&wh={warehouse}")
    results = data.get("results", []) if isinstance(data, dict) else []
    category_ids: list[str] = []
    for top_level in results:
        for child in top_level.get("categories", []) or []:
            category_id = child.get("id")
            if category_id is not None:
                category_ids.append(str(category_id))
    return category_ids


def fetch_all_category_product_ids(warehouse: str, lang: str) -> list[str]:
    product_ids: list[str] = []
    for category_id in fetch_root_category_ids(warehouse, lang):
        product_ids.extend(fetch_category_product_ids(category_id, warehouse, lang))
    return product_ids


def parse_product_id(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.isdigit():
        return text
    match = re.search(r"/product/(\d+)", text)
    if match:
        return match.group(1)
    return None


def load_csv_product_ids(csv_path: str, id_column: str | None) -> list[str]:
    with open(csv_path, newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError(f"CSV has no header row: {csv_path}")

        normalized = {name.strip().lower(): name for name in reader.fieldnames if name}
        preferred_keys = [
            "product_id",
            "productid",
            "id",
            "share_url",
            "shareurl",
            "product_url",
            "producturl",
            "url",
            "link",
        ]

        chosen_column = None
        if id_column:
            chosen_column = id_column
            if chosen_column not in reader.fieldnames:
                raise ValueError(f"CSV column not found: {id_column}")
        else:
            for key in preferred_keys:
                if key in normalized:
                    chosen_column = normalized[key]
                    break

        product_ids: list[str] = []
        if chosen_column:
            for row in reader:
                product_id = parse_product_id(row.get(chosen_column))
                if product_id:
                    product_ids.append(product_id)
            if product_ids:
                return product_ids

        with open(csv_path, newline="", encoding="utf-8-sig") as handle:
            raw_reader = csv.reader(handle)
            header = next(raw_reader, None)
            for row in raw_reader:
                for cell in row:
                    product_id = parse_product_id(cell)
                    if product_id:
                        product_ids.append(product_id)
                        break

        return product_ids


def fetch_product_ean(product_id: str) -> str | None:
    data = http_json(f"https://tienda.mercadona.es/api/products/{product_id}/")
    ean = data.get("ean")
    return str(ean).strip() if ean else None


def main() -> int:
    args = parse_args()

    if args.search:
        product_ids = fetch_search_product_ids(args.search, args.warehouse, args.lang, args.hits_per_page)
    elif args.csv:
        product_ids = load_csv_product_ids(args.csv, args.id_column)
    elif args.all_categories:
        product_ids = fetch_all_category_product_ids(args.warehouse, args.lang)
    else:
        product_ids = fetch_category_product_ids(args.category_id, args.warehouse, args.lang)

    product_ids = sorted(set(product_ids))
    eans: list[str] = []
    missing = 0
    for index, product_id in enumerate(product_ids, start=1):
        try:
            ean = fetch_product_ean(product_id)
        except Exception as exc:
            print(f"[harvest-mercadona-eans] productId={product_id} error={exc}", file=sys.stderr)
            ean = None

        if ean:
            eans.append(ean)
        else:
            missing += 1

        if args.delay_ms > 0 and index < len(product_ids):
            time.sleep(args.delay_ms / 1000)

    unique_eans = sorted(set(eans))
    Path(args.output).write_text("\n".join(unique_eans), encoding="utf-8")

    print(
        json.dumps(
            {
                "products": len(product_ids),
                "eans": len(unique_eans),
                "missing": missing,
                "output": args.output,
                "warehouse": args.warehouse,
                "lang": args.lang,
                "mode": "search" if args.search else "csv" if args.csv else "all-categories" if args.all_categories else "category",
                "query": args.search,
                "categoryId": args.category_id,
                "csv": args.csv,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
