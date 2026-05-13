"""Integration-style test: _predict_internal with mocked in-memory cache (no full train)."""

from __future__ import annotations

import asyncio
import os
from unittest.mock import AsyncMock, patch

import numpy as np
if not str(os.environ.get("ML_API_KEY", "")).strip():
    os.environ["ML_API_KEY"] = "pytest-ml-api-key"

from ml_service.catalog import diseases_signature  # noqa: E402

from app import _predict_internal, build_frequency_table  # noqa: E402


class _StubRf:
    def predict_proba(self, x: np.ndarray) -> np.ndarray:
        return np.array([[0.55, 0.45]], dtype=np.float64)


def _minimal_cache() -> dict:
    diseases = [
        {"id": 201, "name": "MockA", "definition": "x", "raw": {"симптомы": "кашель|озноб"}},
        {"id": 202, "name": "MockB", "definition": "y", "raw": {"симптомы": "температура"}},
    ]
    cases: list = []
    sig = diseases_signature(diseases) + f"|cases={len(cases)}"
    return {
        "diseases": diseases,
        "confirmed_cases": cases,
        "signature": sig,
        "vocab": ["кашель", "озноб", "температура"],
        "idf": {"кашель": 1.0, "озноб": 1.0, "температура": 1.0},
        "rf": _StubRf(),
        "xgb": None,
        "lgbm": None,
        "stacked": None,
        "torch_model": None,
        "symptom_freq": build_frequency_table(diseases),
        "metrics": {},
    }


def test_predict_internal_with_mock_get_cache() -> None:
    cache = _minimal_cache()

    async def run() -> dict:
        with patch("app.get_cache", new_callable=AsyncMock, return_value=cache):
            return await _predict_internal(
                ["кашель"],
                {"gender": "female", "birthDate": "1995-01-01"},
                {},
                1,
                list(cache["diseases"]),
                allow_empty_symptoms=False,
                confidence_threshold=0.01,
            )

    out = asyncio.run(run())
    assert "predictions" in out
    assert len(out["predictions"]) >= 1
