#!/usr/bin/env python3

import argparse
import json
import os
import re
import shutil
import sys
from decimal import Decimal
from datetime import UTC, datetime
from pathlib import Path

try:
    import duckdb
except ImportError as exc:
    raise SystemExit(
        "Missing Python dependency 'duckdb'. Install it with: python3 -m pip install duckdb"
    ) from exc


DEFAULT_OUT_DIR = "public/off-cache"
DEFAULT_PREFIX_LENGTH = 4
NUTRIENT_NAMES = [
    "proteins",
    "carbohydrates",
    "sugars",
    "fat",
    "energy-kcal",
    "fiber",
    "salt",
    "saturated-fat",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Build compact NutriData OFF cache shards from the official Open Food Facts "
            "Parquet export."
        )
    )
    parser.add_argument(
        "--dump",
        required=True,
        help="Path to the Open Food Facts Parquet export (for example food.parquet).",
    )
    parser.add_argument(
        "--eans",
        required=True,
        help="Text, CSV, or JSON file containing the EANs to keep.",
    )
    parser.add_argument(
        "--out-dir",
        default=DEFAULT_OUT_DIR,
        help=f"Output directory for generated shard files (default: {DEFAULT_OUT_DIR}).",
    )
    parser.add_argument(
        "--prefix-length",
        type=int,
        default=DEFAULT_PREFIX_LENGTH,
        help=f"Leading EAN digits per shard (default: {DEFAULT_PREFIX_LENGTH}).",
    )
    return parser.parse_args()


def load_target_eans(file_path: str) -> list[str]:
    raw = Path(file_path).read_text(encoding="utf-8")
    trimmed = raw.strip()
    if not trimmed:
        raise ValueError(f"EAN file is empty: {file_path}")

    if trimmed.startswith("["):
        parsed = json.loads(trimmed)
        if not isinstance(parsed, list):
            raise ValueError(f"Expected JSON array in {file_path}")
        values = [str(value) for value in parsed]
    else:
        values = re.findall(r"\d{8,18}", trimmed)

    eans = sorted({value.strip() for value in values if value.strip()})
    if not eans:
        raise ValueError(f"No EANs found in {file_path}")
    return eans


def normalize_struct(item) -> dict:
    if item is None:
        return {}
    if isinstance(item, dict):
        return item
    if hasattr(item, "_asdict"):
        return item._asdict()
    if hasattr(item, "__dict__"):
        return vars(item)
    return {}


def nutriments_to_compact(nutriments) -> list[float | None] | None:
    if not nutriments:
        return None

    by_name: dict[str, float | None] = {}
    for item in nutriments:
        record = normalize_struct(item)
        name = record.get("name")
        if not name:
            continue
        by_name[str(name)] = record.get("100g")

    compact = [by_name.get(name) for name in NUTRIENT_NAMES]
    if not any(value is not None for value in compact):
        return None
    return compact


def to_json_scalar(value):
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float, str, bool)):
        return value
    try:
        return float(value)
    except Exception:
        return None


def build_cache(dump_path: str, eans_file: str, out_dir: str, prefix_length: int) -> None:
    targets = load_target_eans(eans_file)
    out_path = Path(out_dir)
    if out_path.exists():
        shutil.rmtree(out_path)
    out_path.mkdir(parents=True, exist_ok=True)

    con = duckdb.connect()
    con.execute("CREATE TEMP TABLE targets(code VARCHAR)")
    con.executemany("INSERT INTO targets VALUES (?)", [(ean,) for ean in targets])

    rows = con.execute(
        """
        SELECT p.code, p.nutriments
        FROM read_parquet(?) AS p
        INNER JOIN targets AS t ON p.code = t.code
        """,
        [dump_path],
    ).fetchall()

    shards: dict[str, dict[str, list[float | None]]] = {}
    found: set[str] = set()

    for code, nutriments in rows:
        compact = nutriments_to_compact(nutriments)
        if compact is None:
            continue
        code = str(code).strip()
        prefix = code[:prefix_length]
        shards.setdefault(prefix, {})[code] = [to_json_scalar(value) for value in compact]
        found.add(code)

    prefixes = sorted(shards.keys())
    for prefix in prefixes:
        (out_path / f"{prefix}.json").write_text(
            json.dumps(shards[prefix], separators=(",", ":")),
            encoding="utf-8",
        )

    missing = sorted(ean for ean in targets if ean not in found)
    manifest = {
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "sourceDump": os.path.basename(dump_path),
        "prefixLength": prefix_length,
        "requestedEans": len(targets),
        "products": len(found),
        "missing": len(missing),
        "format": "nutridata-off-v1-array",
        "sourceFormat": "parquet",
        "prefixes": prefixes,
    }

    (out_path / "manifest.json").write_text(
        json.dumps(manifest, separators=(",", ":")),
        encoding="utf-8",
    )
    (out_path / "missing-eans.txt").write_text("\n".join(missing), encoding="utf-8")

    print(
        json.dumps(
            {
                "outDir": out_dir,
                "dump": dump_path,
                "requestedEans": len(targets),
                "products": len(found),
                "missing": len(missing),
                "prefixes": len(prefixes),
                "rows": len(rows),
            },
            indent=2,
        )
    )


def main() -> int:
    args = parse_args()
    if args.prefix_length <= 0:
        raise SystemExit("--prefix-length must be a positive integer")

    build_cache(args.dump, args.eans, args.out_dir, args.prefix_length)
    return 0


if __name__ == "__main__":
    sys.exit(main())
