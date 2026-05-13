"""Diseases JSON path resolution and catalog helpers."""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("ml-service")


def resolve_diseases_json_path(explicit: str | None = None) -> str:
    """Prefer synced copy under ml-service/data, then repo src/data (dev)."""
    if explicit and str(explicit).strip():
        return str(explicit).strip()
    pkg_root = Path(__file__).resolve().parent.parent
    candidates = [
        pkg_root / "data" / "diseases.json",
        pkg_root.parent / "src" / "data" / "diseases.json",
    ]
    for p in candidates:
        if p.is_file():
            return str(p)
    return str(candidates[-1])


def load_diseases_json(path: str) -> list[dict[str, Any]]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except Exception as e:
        logger.error("Failed to load diseases from %s: %s", path, e)
    return []


def diseases_signature(diseases: list[dict[str, Any]]) -> str:
    ids = sorted(str(d.get("id")) for d in diseases if d.get("id") is not None)
    digest = hashlib.md5("|".join(ids).encode("utf-8")).hexdigest()
    return digest
