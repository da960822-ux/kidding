"""Validate the release manifest and import it with one service-role RPC."""

import argparse
import csv
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "assets" / "asset_manifest.csv"
CURRENT_CODES = {
    "ONION_HARVEST",
    "ONION_TRIMMING",
    "ONION_SORTING",
    "ONION_TRANSPORT",
    "STRAWBERRY_HARVEST",
    "STRAWBERRY_SORTING",
    "STRAWBERRY_INSPECTION",
    "STRAWBERRY_PACKING",
}
COLUMNS = [
    "id", "task_code", "asset_type", "content_type", "public_path", "provenance",
    "generator_provider", "prompt_version", "generated_at", "reviewer", "review_status",
    "safety_level", "purpose", "captions_text", "reviewed_at", "checksum_md5", "is_current",
]
REQUIRED = {
    "id", "task_code", "asset_type", "content_type", "public_path", "provenance",
    "reviewer", "review_status", "safety_level", "purpose", "captions_text", "reviewed_at",
    "checksum_md5", "is_current",
}


def _optional(value: str | None) -> str | None:
    return value.strip() or None if value is not None else None


def load_manifest(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != COLUMNS:
            raise ValueError("manifest columns must exactly match asset contract")
        rows: list[dict[str, Any]] = []
        for line_number, raw in enumerate(reader, start=2):
            if None in raw or any(raw[column] is None for column in COLUMNS):
                raise ValueError(f"manifest row {line_number} has extra or missing values")
            row = {column: _optional(raw[column]) for column in COLUMNS}
            if any(not row[column] for column in REQUIRED - {"is_current"}):
                raise ValueError(f"manifest row {line_number} misses required metadata")
            if row["is_current"] not in {"true", "false"}:
                raise ValueError(f"manifest row {line_number} has invalid is_current")
            row["is_current"] = row["is_current"] == "true"
            if not re.fullmatch(r"[0-9a-f]{32}", row["checksum_md5"] or ""):
                raise ValueError(f"manifest row {line_number} has invalid checksum_md5")
            try:
                datetime.fromisoformat((row["reviewed_at"] or "").replace("Z", "+00:00"))
            except ValueError as exc:
                raise ValueError(f"manifest row {line_number} has invalid reviewed_at") from exc
            rows.append(row)
    if len(rows) != 8 or {row["task_code"] for row in rows} != CURRENT_CODES:
        raise ValueError("manifest must contain each current two-crop task exactly once")
    if len({row["id"] for row in rows}) != 8:
        raise ValueError("manifest asset ids must be unique")
    if any(
        row["asset_type"] != "VIDEO"
        or row["content_type"] != "video/mp4"
        or row["provenance"] != "AI_GENERATED_PREGENERATED"
        or row["review_status"] != "APPROVED"
        or row["safety_level"] != "LOW"
        or row["is_current"] is not True
        for row in rows
    ):
        raise ValueError("manifest contains a non-publishable current asset")
    return rows


def import_manifest(rows: list[dict[str, Any]]) -> int:
    from supabase import create_client

    url = os.getenv("SUPABASE_URL")
    secret = os.getenv("SUPABASE_SECRET_KEY")
    if not url or not secret:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SECRET_KEY are required")
    result = create_client(url, secret).rpc("import_visual_assets_v2", {"p_assets": rows}).execute()
    return int(result.data)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--check", action="store_true")
    arguments = parser.parse_args()
    rows = load_manifest(arguments.manifest)
    if arguments.check:
        print(f"validated {len(rows)} visual asset rows")
        return
    print(f"imported {import_manifest(rows)} visual asset rows")


if __name__ == "__main__":
    main()
