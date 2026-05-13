"""Single source of truth for symptom / text normalization (mirrors Node historical rules)."""

from __future__ import annotations

from typing import Any


def normalize_text(value: Any) -> str:
    """Lowercase, trim edges, collapse whitespace; keeps punctuation attached to words."""
    s = str(value or "").strip().lower()
    s = " ".join(s.split())
    return s[:200]


def split_pipe_normalized(value: Any) -> list[str]:
    """Split pipe-separated raw field into normalized non-empty tokens (order preserved, de-duped)."""
    out: list[str] = []
    seen: set[str] = set()
    for part in str(value or "").split("|"):
        t = normalize_text(part)
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out
