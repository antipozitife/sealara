"""Model version directory: SHA-256 in meta.json verified on load."""

from __future__ import annotations

import os
import tempfile

import numpy as np
import pytest

if not str(os.environ.get("ML_API_KEY", "")).strip():
    os.environ["ML_API_KEY"] = "pytest-ml-api-key"


class _MiniRf:
    def predict_proba(self, x: np.ndarray) -> np.ndarray:
        return np.array([[0.5, 0.5]], dtype=np.float64)


def test_save_then_load_rejects_corrupted_artifact() -> None:
    import app as app_module

    with tempfile.TemporaryDirectory() as tmp:
        prev = app_module.MODELS_DIR
        app_module.MODELS_DIR = tmp
        try:
            cache = {k: None for k in app_module._VERSION_ARTIFACT_KEYS}
            cache["rf"] = _MiniRf()
            app_module.save_model_version(cache, 7)
            loaded = app_module.load_model_version(7)
            assert loaded is not None
            assert loaded.get("rf") is not None
            rf_path = os.path.join(tmp, "v7", "rf.joblib")
            with open(rf_path, "ab") as f:
                f.write(b"corrupt")
            assert app_module.load_model_version(7) is None
        finally:
            app_module.MODELS_DIR = prev
