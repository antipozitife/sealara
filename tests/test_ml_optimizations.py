"""Trim confirmed_cases + information gain cache path (PYTHONPATH=ml-service)."""

from __future__ import annotations

import os

if not str(os.environ.get("ML_API_KEY", "")).strip():
    os.environ["ML_API_KEY"] = "pytest-ml-api-key"

from app import CONFIRMED_CASES_MEMORY_MAX, trim_confirmed_cases  # noqa: E402
from ml_service.information_gain import calculate_information_gain, symptom_sets_by_disease_id_map  # noqa: E402


def test_trim_confirmed_cases_keeps_tail_and_cap() -> None:
    cap = CONFIRMED_CASES_MEMORY_MAX
    long = [{"i": i} for i in range(cap + 50)]
    out = trim_confirmed_cases(long)
    assert len(out) == cap
    assert out[0]["i"] == 50
    assert out[-1]["i"] == cap + 49


def test_information_gain_with_prebuilt_map_matches_naive_scores() -> None:
    diseases = [
        {"id": 1, "raw": {"симптомы": "кашель|температура"}},
        {"id": 2, "raw": {"симптомы": "боль|слабость"}},
    ]
    ranked = [{"id": 1, "score": 0.7}, {"id": 2, "score": 0.3}]
    m = symptom_sets_by_disease_id_map(diseases)
    ig_cached = calculate_information_gain("кашель", ranked, diseases, m)
    ig_naive = calculate_information_gain("кашель", ranked, diseases, None)
    assert abs(ig_cached - ig_naive) < 1e-9
    assert ig_cached >= 0.0
