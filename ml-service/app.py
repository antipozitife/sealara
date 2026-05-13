from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi import Header, HTTPException
from fastapi.responses import JSONResponse
from starlette.responses import Response
from pydantic import BaseModel, Field, field_validator
from typing import Any
from datetime import date
import math
import os
import random
import secrets
import logging
import signal
import asyncio
import concurrent.futures
import time
import json
import shutil
import hashlib
import joblib
import numpy as np
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.metrics import accuracy_score, top_k_accuracy_score
from sklearn.ensemble import RandomForestClassifier, StackingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.utils.class_weight import compute_sample_weight
from starlette.middleware.base import BaseHTTPMiddleware

try:
    from xgboost import XGBClassifier
except Exception:  # pragma: no cover
    XGBClassifier = None

try:
    from lightgbm import LGBMClassifier
except Exception:  # pragma: no cover
    LGBMClassifier = None

try:
    import torch
    import torch.nn as nn
    import torch.optim as optim
except Exception:  # pragma: no cover
    torch = None
    nn = None
    optim = None

try:
    import redis.asyncio as aioredis
except Exception:  # pragma: no cover
    aioredis = None

try:
    from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
except ImportError:  # pragma: no cover
    Counter = None  # type: ignore[misc, assignment]
    Histogram = None  # type: ignore[misc, assignment]
    generate_latest = None  # type: ignore[misc, assignment]
    CONTENT_TYPE_LATEST = "text/plain; version=0.0.4; charset=utf-8"  # type: ignore[misc]

from ml_service.catalog import diseases_signature, load_diseases_json, resolve_diseases_json_path
from ml_service.fallback_cosine import cosine_overlap_fallback_response
from ml_service.features import (
    _reference_date_for_profile,
    age_from_birthdate,
    build_vocab_and_idf,
    feature_vector,
    prune_vocab_by_mutual_info,
    softmax,
    symptom_cosine,
    symptom_set_for_disease,
)
from ml_service.normalization import normalize_text
from ml_service.information_gain import (
    calculate_information_gain,
    shannon_entropy,
    suggest_clarifying_symptoms,
    symptom_sets_by_disease_id_map,
)

API_KEY = os.environ.get("ML_API_KEY", "").strip()
CONFIRMED_BATCH_SIZE = int(os.getenv("FEEDBACK_BATCH_SIZE", "100"))
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.7"))
UNCERTAINTY_THRESHOLD = float(os.getenv("UNCERTAINTY_THRESHOLD", "0.55"))
SOFTMAX_TEMP_EARLY = float(os.getenv("SOFTMAX_TEMP_EARLY", "0.2"))
SOFTMAX_TEMP_LATE = float(os.getenv("SOFTMAX_TEMP_LATE", "0.14"))
TORCH_WEIGHT = float(os.getenv("TORCH_WEIGHT", "0.03"))
BAYES_WEIGHT = float(os.getenv("BAYES_WEIGHT", "0.03"))
COSINE_WEIGHT = float(os.getenv("COSINE_WEIGHT", "0.02"))
SYNTHETIC_AUGMENT = os.getenv("SYNTHETIC_AUGMENT", "1").strip().lower() in ("1", "true", "yes", "on")
IS_PRODUCTION = os.getenv("ENV") == "production"
MAX_VOCAB_SIZE = int(os.getenv("MAX_VOCAB_SIZE", "1200"))
REDIS_READY_TIMEOUT_SEC = float(os.getenv("REDIS_READY_TIMEOUT_SEC", "10"))
RF_N_ESTIMATORS = int(os.getenv("RF_N_ESTIMATORS", "220" if IS_PRODUCTION else "140"))
TORCH_EPOCHS = int(os.getenv("TORCH_EPOCHS", "120" if IS_PRODUCTION else "45"))
TORCH_MIN_INTERVAL_SEC = int(os.getenv("TORCH_MIN_INTERVAL_SEC", "900"))
DISEASES_JSON_PATH = os.getenv("DISEASES_JSON_PATH", "").strip() or resolve_diseases_json_path()
REDIS_URL = os.getenv("REDIS_URL", "").strip()
REDIS_STATE_KEY = os.getenv("REDIS_STATE_KEY", "sealara:ml:state")
REDIS_ACTIVE_VERSION_KEY = os.getenv("REDIS_ACTIVE_VERSION_KEY", "sealara:ml:active_model_version")
MAX_STORED_MODEL_VERSIONS = int(os.getenv("MAX_STORED_MODEL_VERSIONS", "5"))
MODELS_DIR = os.getenv("MODELS_DIR", "models").strip() or "models"
MANIFEST_FILE = os.path.join(MODELS_DIR, "manifest.json")
REDIS_CONNECT_RETRIES = int(os.getenv("REDIS_CONNECT_RETRIES", "8"))
REDIS_CONNECT_DELAY_MS = int(os.getenv("REDIS_CONNECT_DELAY_MS", "1200"))
REDIS_CMD_TIMEOUT_SEC = float(os.getenv("REDIS_CMD_TIMEOUT_SEC", "5"))
REDIS_TRAIN_LOCK_KEY = os.getenv("REDIS_TRAIN_LOCK_KEY", "sealara:ml:train_lock")
REDIS_TRAIN_LOCK_TTL_SEC = int(os.getenv("REDIS_TRAIN_LOCK_TTL_SEC", "900"))
REDIS_TRAIN_LOCK_ACQUIRE_RETRIES = int(os.getenv("REDIS_TRAIN_LOCK_ACQUIRE_RETRIES", "30"))
REDIS_MODEL_PUBSUB_CHANNEL = os.getenv("REDIS_MODEL_PUBSUB_CHANNEL", "sealara:ml:model_events").strip()
ML_RATE_LIMIT_WINDOW_SEC = float(os.getenv("ML_RATE_LIMIT_WINDOW_SEC", "60"))
ML_RATE_LIMIT_MAX = int(os.getenv("ML_RATE_LIMIT_MAX", "120"))
CONFIRMED_CASES_MEMORY_MAX = int(os.getenv("CONFIRMED_CASES_MEMORY_MAX", "10000"))
_training_lock = asyncio.Lock()
_training_in_progress = False
redis_client = None
_model_pubsub_task: asyncio.Task | None = None
training_status: str = "idle"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ml-service")

if not API_KEY:
    logger.error("ML_API_KEY must be set")
    raise RuntimeError("ML_API_KEY must be set")

random.seed(42)
np.random.seed(42)
if torch is not None:
    torch.manual_seed(42)

if Counter is not None and Histogram is not None:
    predict_requests_total = Counter("ml_predict_requests_total", "Total predict requests")
    predict_errors_total = Counter("ml_predict_errors_total", "Total failed predictions (unexpected)")
    predict_duration_seconds = Histogram("ml_predict_duration_seconds", "Prediction latency")
    preliminary_requests_total = Counter("ml_preliminary_requests_total", "Total preliminary requests")
    preliminary_duration_seconds = Histogram("ml_preliminary_duration_seconds", "Preliminary latency")
    train_requests_total = Counter("ml_train_requests_total", "Total train requests")
    train_duration_seconds = Histogram("ml_train_duration_seconds", "Train latency")
    feedback_events_total = Counter("ml_feedback_events_total", "Total feedback events")
    preprocess_requests_total = Counter("ml_preprocess_requests_total", "Total preprocess requests")
    preprocess_duration_seconds = Histogram("ml_preprocess_duration_seconds", "Preprocess latency")
else:  # pragma: no cover
    predict_requests_total = predict_errors_total = predict_duration_seconds = None
    preliminary_requests_total = preliminary_duration_seconds = None
    train_requests_total = train_duration_seconds = None
    feedback_events_total = None
    preprocess_requests_total = preprocess_duration_seconds = None


def verify_api_key(x_api_key: str = Header(...)) -> None:
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API Key")


class APIKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.url.path in ("/health", "/prometheus"):
            return await call_next(request)
        api_key = request.headers.get("x-api-key")
        if not api_key or api_key != API_KEY:
            return JSONResponse(status_code=401, content={"detail": "Missing or invalid API Key"})
        return await call_next(request)


class MlServiceRateLimitMiddleware(BaseHTTPMiddleware):
    """Simple per-IP sliding window (protects direct ML exposure; health/metrics exempt)."""

    def __init__(self, app: Any, max_requests: int, window_sec: float) -> None:
        super().__init__(app)
        self.max_requests = max(1, int(max_requests))
        self.window_sec = max(1.0, float(window_sec))
        self._hits: dict[str, list[float]] = {}

    async def dispatch(self, request, call_next):  # type: ignore[no-untyped-def]
        path = request.url.path
        if path in ("/health", "/prometheus") or path.startswith("/docs") or path.startswith("/openapi") or path == "/redoc":
            return await call_next(request)
        host = request.client.host if request.client else "unknown"
        now = time.time()
        bucket = self._hits.setdefault(host, [])
        cutoff = now - self.window_sec
        while bucket and bucket[0] < cutoff:
            bucket.pop(0)
        if len(bucket) >= self.max_requests:
            return JSONResponse(status_code=429, content={"detail": "rate limit exceeded"})
        bucket.append(now)
        return await call_next(request)


class PredictPayload(BaseModel):
    symptoms: list[str] = Field(..., max_items=50, min_items=1)
    profile: dict[str, Any] = Field(default_factory=dict)
    answers: dict[str, Any] = Field(default_factory=dict)
    round: int = Field(1, ge=1, le=10)
    diseases: list[dict[str, Any]] = Field(default_factory=list, max_items=500)
    confidence_threshold: float = Field(0.7, ge=0.0, le=1.0)

    @field_validator("symptoms")
    @classmethod
    def validate_symptoms(cls, v: list[str]) -> list[str]:
        cleaned = [normalize_text(s)[:100] for s in v if s and len(str(s)) <= 200]
        if not cleaned:
            raise ValueError("symptoms must contain at least one valid item")
        return cleaned

    @field_validator("profile")
    @classmethod
    def validate_profile(cls, v: dict[str, Any]) -> dict[str, Any]:
        return ProfilePayload(**(v or {})).model_dump(exclude_none=True)

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, v: dict[str, Any]) -> dict[str, Any]:
        return AnswersPayload(**(v or {})).model_dump(exclude_none=True)


class TrainPayload(BaseModel):
    diseases: list[dict[str, Any]] = Field(default_factory=list, max_items=500)
    confirmed_cases: list[dict[str, Any]] = Field(default_factory=list, max_items=5000)


class SwitchVersionPayload(BaseModel):
    version: int = Field(..., ge=1)


class FeedbackPayload(BaseModel):
    symptoms: list[str] = Field(..., max_items=50, min_items=1)
    profile: dict[str, Any] = Field(default_factory=dict)
    answers: dict[str, Any] = Field(default_factory=dict)
    confirmed_disease_id: int

    @field_validator("profile")
    @classmethod
    def validate_profile(cls, v: dict[str, Any]) -> dict[str, Any]:
        return ProfilePayload(**(v or {})).model_dump(exclude_none=True)

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, v: dict[str, Any]) -> dict[str, Any]:
        return AnswersPayload(**(v or {})).model_dump(exclude_none=True)


class PreliminaryPayload(BaseModel):
    profile: dict[str, Any] = Field(default_factory=dict)
    answers: dict[str, Any] = Field(default_factory=dict)
    diseases: list[dict[str, Any]] = Field(default_factory=list, max_items=500)

    @field_validator("profile")
    @classmethod
    def validate_profile(cls, v: dict[str, Any]) -> dict[str, Any]:
        return ProfilePayload(**(v or {})).model_dump(exclude_none=True)

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, v: dict[str, Any]) -> dict[str, Any]:
        return AnswersPayload(**(v or {})).model_dump(exclude_none=True)


class PreprocessPayload(BaseModel):
    """Same symptom normalization and feature layout as /predict (single source of truth)."""

    raw_symptoms: list[str] = Field(default_factory=list, max_items=50)
    profile: dict[str, Any] = Field(default_factory=dict)
    answers: dict[str, Any] = Field(default_factory=dict)

    @field_validator("raw_symptoms")
    @classmethod
    def validate_raw_symptoms(cls, v: list[str]) -> list[str]:
        cleaned = [normalize_text(s)[:100] for s in v if s and len(str(s)) <= 200]
        out: list[str] = []
        seen: set[str] = set()
        for t in cleaned:
            if t and t not in seen:
                seen.add(t)
                out.append(t)
        return out

    @field_validator("profile")
    @classmethod
    def validate_profile(cls, v: dict[str, Any]) -> dict[str, Any]:
        return ProfilePayload(**(v or {})).model_dump(exclude_none=True)

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, v: dict[str, Any]) -> dict[str, Any]:
        return AnswersPayload(**(v or {})).model_dump(exclude_none=True)


class ProfilePayload(BaseModel):
    birthDate: str | None = None
    gender: str | None = None
    region: str | None = None


class AnswersPayload(BaseModel):
    visible_changes: str | None = None
    onset: str | None = None
    main_complaint: str | None = None
    pattern: str | None = None
    fever: str | None = None
    weakness: str | None = None
    triggers: str | None = None
    pain_character: str | None = None
    additional_systems: list[str] | None = None
    dynamics: str | None = None


class FallbackCosinePayload(BaseModel):
    """Same symptom list shape as /predict; uses ML cache diseases for overlap fallback."""

    symptoms: list[str] = Field(..., max_items=50, min_items=1)
    profile: dict[str, Any] = Field(default_factory=dict)
    round: int = Field(1, ge=1, le=10)

    @field_validator("symptoms")
    @classmethod
    def validate_symptoms(cls, v: list[str]) -> list[str]:
        cleaned = [normalize_text(s)[:100] for s in v if s and len(str(s)) <= 200]
        out: list[str] = []
        seen: set[str] = set()
        for t in cleaned:
            if t and t not in seen:
                seen.add(t)
                out.append(t)
        if not out:
            raise ValueError("symptoms must contain at least one valid item")
        return out

    @field_validator("profile")
    @classmethod
    def validate_profile(cls, v: dict[str, Any]) -> dict[str, Any]:
        return ProfilePayload(**(v or {})).model_dump(exclude_none=True)


TorchMLP = None
if torch is not None and nn is not None:
    class TorchMLP(nn.Module):
        def __init__(self, input_dim: int, num_classes: int):
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(input_dim, 128),
                nn.BatchNorm1d(128),
                nn.ReLU(),
                nn.Dropout(0.25),
                nn.Linear(128, 64),
                nn.BatchNorm1d(64),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.Linear(64, num_classes),
            )

        def forward(self, x):
            return self.net(x)


def _train_torch_in_subprocess(
    input_dim: int,
    num_classes: int,
    X_fit: np.ndarray,
    y_fit: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    epochs: int,
    lr: float = 0.003,
) -> dict[str, Any] | None:
    """Train TorchMLP in separate process and return state_dict."""
    try:
        import torch as _torch
        import torch.nn as _nn
        import torch.optim as _optim
    except Exception:
        return None

    class _SubprocessTorchMLP(_nn.Module):
        def __init__(self, in_dim: int, n_classes: int):
            super().__init__()
            self.net = _nn.Sequential(
                _nn.Linear(in_dim, 128),
                _nn.BatchNorm1d(128),
                _nn.ReLU(),
                _nn.Dropout(0.25),
                _nn.Linear(128, 64),
                _nn.BatchNorm1d(64),
                _nn.ReLU(),
                _nn.Dropout(0.2),
                _nn.Linear(64, n_classes),
            )

        def forward(self, x):  # type: ignore[no-untyped-def]
            return self.net(x)

    model = _SubprocessTorchMLP(int(input_dim), int(num_classes))
    criterion = _nn.CrossEntropyLoss()
    optimizer = _optim.Adam(model.parameters(), lr=float(lr))

    x_t = _torch.tensor(X_fit, dtype=_torch.float32)
    y_t = _torch.tensor(y_fit, dtype=_torch.long)
    x_v = _torch.tensor(X_val, dtype=_torch.float32)
    y_v = _torch.tensor(y_val, dtype=_torch.long)

    best_val = float("inf")
    patience = 10
    bad_epochs = 0
    for _ in range(int(max(1, epochs))):
        optimizer.zero_grad()
        logits = model(x_t)
        loss = criterion(logits, y_t)
        loss.backward()
        optimizer.step()

        with _torch.no_grad():
            v_logits = model(x_v)
            v_loss = criterion(v_logits, y_v).item()
        if v_loss < best_val - 1e-4:
            best_val = v_loss
            bad_epochs = 0
        else:
            bad_epochs += 1
            if bad_epochs >= patience:
                break
    return model.state_dict()


_torch_training_executor: concurrent.futures.ProcessPoolExecutor | None = (
    concurrent.futures.ProcessPoolExecutor(max_workers=1) if torch is not None else None
)


_model_cache: dict[str, Any] = {
    "signature": None,
    "vocab": [],
    "idf": {},
    "diseases": [],
    "rf": None,
    "xgb": None,
    "lgbm": None,
    "stacked": None,
    "torch_model": None,
    "metrics": {},
    "symptom_freq": {},
    "confirmed_cases": [],
    "feedback_count": 0,
    "last_torch_train_ts": 0.0,
    "torch_cases_count": 0,
    "active_model_version": None,
}


async def get_cache() -> dict[str, Any]:
    """Current model cache snapshot; does not block on background training (no 503)."""
    async with _training_lock:
        return dict(_model_cache)


async def read_model_cache_locked() -> dict[str, Any]:
    """Snapshot under lock (for /health, shutdown, metrics)."""
    async with _training_lock:
        return dict(_model_cache)


async def set_cache(new_cache: dict[str, Any]) -> dict[str, Any]:
    async with _training_lock:
        global _model_cache
        _model_cache = new_cache
        return dict(_model_cache)


def get_stacked_ensemble(estimators: list[tuple[str, Any]]) -> StackingClassifier | None:
    if len(estimators) < 2:
        return None
    return StackingClassifier(
        estimators=estimators,
        final_estimator=LogisticRegression(max_iter=1000),
        cv=3,
    )


def save_persistent_models(cache: dict[str, Any]) -> None:
    os.makedirs(MODELS_DIR, exist_ok=True)
    for key in (
        "rf",
        "xgb",
        "lgbm",
        "stacked",
        "vocab",
        "idf",
        "diseases",
        "symptom_freq",
        "metrics",
        "confirmed_cases",
        "feedback_count",
        "last_torch_train_ts",
        "torch_cases_count",
    ):
        model = cache.get(key)
        if model is not None:
            joblib.dump(model, os.path.join(MODELS_DIR, f"{key}.joblib"))


async def save_persistent_models_async(cache: dict[str, Any]) -> None:
    await asyncio.to_thread(save_persistent_models, cache)


_PERSISTENT_MODEL_KEYS = (
    "rf",
    "xgb",
    "lgbm",
    "stacked",
    "vocab",
    "idf",
    "diseases",
    "symptom_freq",
    "metrics",
    "confirmed_cases",
    "feedback_count",
    "last_torch_train_ts",
    "torch_cases_count",
)


def _load_disk_models_joblib() -> dict[str, Any]:
    """Blocking disk I/O; call via asyncio.to_thread so startup does not block the event loop."""
    loaded: dict[str, Any] = {}
    for key in _PERSISTENT_MODEL_KEYS:
        path = os.path.join(MODELS_DIR, f"{key}.joblib")
        if os.path.exists(path):
            try:
                loaded[key] = joblib.load(path)
            except Exception as e:
                logger.error("Failed to load %s from %s: %s", key, path, e)
                loaded[key] = None
    return loaded


async def merge_disk_models_into_cache(loaded: dict[str, Any]) -> None:
    async with _training_lock:
        global _model_cache
        current = dict(_model_cache)
        for key, val in loaded.items():
            if key == "confirmed_cases" and isinstance(val, list):
                current[key] = trim_confirmed_cases(val)
            else:
                current[key] = val
        _model_cache = current


def trim_confirmed_cases(cases: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not cases:
        return []
    if len(cases) <= CONFIRMED_CASES_MEMORY_MAX:
        return list(cases)
    return list(cases[-CONFIRMED_CASES_MEMORY_MAX:])


def serialize_state(cache: dict[str, Any]) -> dict[str, Any]:
    cases = trim_confirmed_cases(list(cache.get("confirmed_cases") or []))
    return {
        "signature": cache.get("signature"),
        "diseases": cache.get("diseases", []),
        "confirmed_cases": cases,
        "feedback_count": int(cache.get("feedback_count", len(cases))),
        "metrics": cache.get("metrics", {}),
        "last_torch_train_ts": cache.get("last_torch_train_ts", 0.0),
        "torch_cases_count": cache.get("torch_cases_count", 0),
        "active_model_version": cache.get("active_model_version"),
    }


async def save_state_to_redis(cache: dict[str, Any]) -> None:
    if not redis_client:
        return
    try:
        payload = json.dumps(serialize_state(cache), ensure_ascii=False)
        await asyncio.wait_for(
            redis_client.set(REDIS_STATE_KEY, payload),
            timeout=REDIS_CMD_TIMEOUT_SEC,
        )
    except Exception as e:
        logger.warning("Failed to save ML state to Redis: %s", e)


async def load_state_from_redis() -> dict[str, Any] | None:
    if not redis_client:
        return None
    try:
        raw = await asyncio.wait_for(redis_client.get(REDIS_STATE_KEY), timeout=REDIS_CMD_TIMEOUT_SEC)
        if not raw:
            return None
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except Exception as e:
        logger.warning("Failed to load ML state from Redis: %s", e)
    return None


_VERSION_ARTIFACT_KEYS = (
    "rf",
    "xgb",
    "lgbm",
    "stacked",
    "torch_model",
    "vocab",
    "idf",
    "diseases",
    "symptom_freq",
    "metrics",
    "confirmed_cases",
    "feedback_count",
    "last_torch_train_ts",
    "torch_cases_count",
)


def load_manifest() -> dict[str, Any]:
    if not os.path.exists(MANIFEST_FILE):
        return {"active_version": None, "versions": []}
    try:
        with open(MANIFEST_FILE, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            data.setdefault("versions", [])
            return data
    except Exception as e:
        logger.warning("Failed to load manifest %s: %s", MANIFEST_FILE, e)
    return {"active_version": None, "versions": []}


def save_manifest(manifest: dict[str, Any]) -> None:
    os.makedirs(MODELS_DIR, exist_ok=True)
    tmp = f"{MANIFEST_FILE}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    os.replace(tmp, MANIFEST_FILE)


def get_next_version(manifest: dict[str, Any]) -> int:
    versions = [int(v["version"]) for v in manifest.get("versions", []) if v.get("version") is not None]
    return max(versions) + 1 if versions else 1


def prune_old_versions(manifest: dict[str, Any], keep: int = MAX_STORED_MODEL_VERSIONS) -> None:
    versions = list(manifest.get("versions", []))
    if len(versions) <= keep:
        manifest["versions"] = versions
        return
    versions.sort(key=lambda x: int(x.get("version", 0)))
    to_remove = versions[:-keep]
    for v in to_remove:
        ver = int(v.get("version", 0))
        if ver <= 0:
            continue
        version_dir = os.path.join(MODELS_DIR, f"v{ver}")
        if os.path.isdir(version_dir):
            shutil.rmtree(version_dir, ignore_errors=True)
        for key in ("rf", "xgb", "lgbm", "stacked", "torch_model", "vocab", "idf", "symptom_freq", "metrics"):
            fpath = os.path.join(MODELS_DIR, f"{key}_v{ver}.joblib")
            if os.path.isfile(fpath):
                try:
                    os.remove(fpath)
                except OSError:
                    pass
    manifest["versions"] = versions[-keep:]


def _file_sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def save_model_version(cache: dict[str, Any], version: int) -> None:
    version_dir = os.path.join(MODELS_DIR, f"v{version}")
    os.makedirs(version_dir, exist_ok=True)
    artifacts_sha256: dict[str, str] = {}
    for key in _VERSION_ARTIFACT_KEYS:
        model = cache.get(key)
        if model is not None:
            fp = os.path.join(version_dir, f"{key}.joblib")
            joblib.dump(model, fp)
            artifacts_sha256[key] = _file_sha256(fp)
    meta = {
        "version": version,
        "signature": cache.get("signature"),
        "timestamp": time.time(),
        "metrics": cache.get("metrics", {}),
        "diseases_count": len(cache.get("diseases", []) or []),
        "samples": (cache.get("metrics") or {}).get("samples", 0),
        "artifacts_sha256": artifacts_sha256,
    }
    with open(os.path.join(version_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)


def load_model_version(version: int) -> dict[str, Any] | None:
    version_dir = os.path.join(MODELS_DIR, f"v{version}")
    if not os.path.isdir(version_dir):
        return None
    meta_path = os.path.join(version_dir, "meta.json")
    expected_hashes: dict[str, str] = {}
    if os.path.isfile(meta_path):
        try:
            with open(meta_path, encoding="utf-8") as f:
                meta = json.load(f)
            if isinstance(meta, dict):
                raw_hashes = meta.get("artifacts_sha256")
                if isinstance(raw_hashes, dict):
                    expected_hashes = {str(k): str(v) for k, v in raw_hashes.items()}
        except Exception as e:
            logger.warning("Failed to read meta.json for v%s: %s", version, e)
    loaded: dict[str, Any] = {}
    for key in _VERSION_ARTIFACT_KEYS:
        fpath = os.path.join(version_dir, f"{key}.joblib")
        if os.path.isfile(fpath):
            exp = expected_hashes.get(key)
            if exp:
                try:
                    actual = _file_sha256(fpath)
                except OSError as e:
                    logger.error("Failed to hash %s: %s", fpath, e)
                    return None
                if actual.lower() != exp.lower():
                    logger.error("Artifact hash mismatch for %s in v%s (disk may be corrupted)", key, version)
                    return None
            try:
                loaded[key] = joblib.load(fpath)
            except Exception as e:
                logger.error("Failed to load %s from %s: %s", key, fpath, e)
    if os.path.isfile(meta_path):
        try:
            with open(meta_path, encoding="utf-8") as f:
                meta = json.load(f)
            if isinstance(meta, dict) and meta.get("signature") is not None:
                loaded["signature"] = meta["signature"]
        except Exception as e:
            logger.warning("Failed to read meta.json for v%s: %s", version, e)
    return loaded if loaded.get("rf") is not None else None


def persist_new_model_version_sync(cache: dict[str, Any]) -> int | None:
    """Append a new on-disk version, update manifest, prune old dirs. Caller should hold no model lock."""
    if cache.get("rf") is None:
        return None
    try:
        os.makedirs(MODELS_DIR, exist_ok=True)
        manifest = load_manifest()
        new_version = get_next_version(manifest)
        save_model_version(cache, new_version)
        manifest.setdefault("versions", [])
        manifest["versions"].append(
            {
                "version": new_version,
                "signature": cache.get("signature"),
                "timestamp": time.time(),
                "metrics": cache.get("metrics", {}),
            }
        )
        manifest["active_version"] = new_version
        prune_old_versions(manifest)
        save_manifest(manifest)
        return new_version
    except Exception as e:
        logger.exception("persist_new_model_version_sync failed: %s", e)
        return None


async def save_active_version_to_redis(version: int | None) -> None:
    if not redis_client:
        return
    try:
        if version is None:
            await asyncio.wait_for(redis_client.delete(REDIS_ACTIVE_VERSION_KEY), timeout=REDIS_CMD_TIMEOUT_SEC)
        else:
            await asyncio.wait_for(
                redis_client.set(REDIS_ACTIVE_VERSION_KEY, str(int(version))),
                timeout=REDIS_CMD_TIMEOUT_SEC,
            )
    except Exception as e:
        logger.warning("Failed to save active model version to Redis: %s", e)


async def load_active_version_from_redis() -> int | None:
    if not redis_client:
        return None
    try:
        raw = await asyncio.wait_for(redis_client.get(REDIS_ACTIVE_VERSION_KEY), timeout=REDIS_CMD_TIMEOUT_SEC)
        if raw is None or raw == "":
            return None
        v = int(str(raw).strip())
        return v if v > 0 else None
    except Exception as e:
        logger.warning("Failed to read active model version from Redis: %s", e)
        return None


async def _acquire_train_lock() -> str | None:
    """Return lock token if acquired, 'local' if Redis disabled, None if busy after retries."""
    if not redis_client:
        return "local"
    token = secrets.token_urlsafe(16)
    for attempt in range(max(1, REDIS_TRAIN_LOCK_ACQUIRE_RETRIES)):
        try:
            ok = await asyncio.wait_for(
                redis_client.set(REDIS_TRAIN_LOCK_KEY, token, nx=True, ex=REDIS_TRAIN_LOCK_TTL_SEC),
                timeout=REDIS_CMD_TIMEOUT_SEC,
            )
            if ok:
                return token
        except Exception as e:
            logger.warning("Train lock acquire attempt %d failed: %s", attempt + 1, e)
            return "local"
        await asyncio.sleep(0.2)
    return None


async def _release_train_lock(token: str | None) -> None:
    if not token or token == "local" or not redis_client:
        return
    script = """
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
    """
    try:
        await asyncio.wait_for(
            redis_client.eval(script, 1, REDIS_TRAIN_LOCK_KEY, token),
            timeout=REDIS_CMD_TIMEOUT_SEC,
        )
    except Exception as e:
        logger.warning("Train lock release failed: %s", e)


async def wait_for_redis_ready(timeout_sec: float | None = None) -> bool:
    if not redis_client:
        return True
    tlim = float(timeout_sec if timeout_sec is not None else REDIS_READY_TIMEOUT_SEC)
    start = time.time()
    attempt = 0
    while time.time() - start < tlim:
        attempt += 1
        try:
            if await asyncio.wait_for(redis_client.ping(), timeout=REDIS_CMD_TIMEOUT_SEC):
                logger.info("Redis is healthy on attempt %d", attempt)
                return True
        except Exception as e:
            logger.warning("Redis health check failed on attempt %d: %s", attempt, e)
        await asyncio.sleep(0.5)
    return False


def train_models(diseases: list[dict[str, Any]], vocab: list[str]) -> tuple[np.ndarray, np.ndarray]:
    X = []
    Y = []
    answer_variants = [
        {},
        {"visible_changes": "visible"},
        {"onset": "sudden"},
        {"fever": "high"},
        {"weakness": "severe"},
        {"triggers": "yes"},
        {"dynamics": "worsening"},
        {"additional_systems": ["respiratory"]},
        {"additional_systems": ["digestive"]},
    ]
    for idx, d in enumerate(diseases):
        ds = sorted(list(symptom_set_for_disease(d)))
        if not ds:
            continue
        base_profile = {"gender": "male", "birthDate": "1990-06-15"}
        female_profile = {"gender": "female", "birthDate": "1990-06-15"}
        for ans in answer_variants:
            X.append(feature_vector(ds, vocab, base_profile, ans))
            Y.append(idx)
            X.append(feature_vector(ds, vocab, female_profile, ans))
            Y.append(idx)
        # Include no-symptom samples – repeat 3 times to give them more weight.
        for _ in range(3):
            for ans in answer_variants:
                X.append(feature_vector([], vocab, base_profile, ans))
                Y.append(idx)
                X.append(feature_vector([], vocab, female_profile, ans))
                Y.append(idx)
        if SYNTHETIC_AUGMENT and len(ds) >= 2:
            for _ in range(min(3, len(ds))):
                size = max(1, int(len(ds) * random.uniform(0.6, 0.9)))
                subset = random.sample(ds, size)
                ans = answer_variants[random.randint(0, len(answer_variants) - 1)]
                profile = base_profile if random.random() < 0.5 else female_profile
                X.append(feature_vector(subset, vocab, profile, ans))
                Y.append(idx)
    return np.array(X, dtype=np.float32), np.array(Y, dtype=np.int64)


def confirmed_case_to_vector(case: dict[str, Any], diseases: list[dict[str, Any]], vocab: list[str]) -> tuple[list[float], int] | None:
    d_id = int(case.get("confirmed_disease_id", -1))
    y = -1
    for idx, d in enumerate(diseases):
        if int(d.get("id", -1)) == d_id:
            y = idx
            break
    if y < 0:
        return None
    symptoms = [normalize_text(x) for x in case.get("symptoms", []) if normalize_text(x)]
    profile = case.get("profile", {}) or {}
    answers = case.get("answers", {}) or {}
    return feature_vector(symptoms, vocab, profile, answers), y


def build_frequency_table(diseases: list[dict[str, Any]]) -> dict[int, dict[str, float]]:
    result: dict[int, dict[str, float]] = {}
    for idx, d in enumerate(diseases):
        ds = symptom_set_for_disease(d)
        denom = float(max(1, len(ds)))
        # smoothed frequency-like prior
        probs = {s: (1.0 / denom) for s in ds}
        result[idx] = probs
    return result


async def predict_proba_async(model: Any, x_in: np.ndarray) -> np.ndarray:
    return await asyncio.to_thread(model.predict_proba, x_in)


async def softmax_async(scores: list[float], temperature: float) -> list[float]:
    return await asyncio.to_thread(softmax, scores, temperature)


def load_diseases_from_file() -> list[dict[str, Any]]:
    return load_diseases_json(DISEASES_JSON_PATH)


async def _build_models_internal(
    diseases: list[dict[str, Any]],
    resolved_cases: list[dict[str, Any]],
    training_signature: str,
    seed_snapshot: dict[str, Any],
) -> dict[str, Any]:
    """Train all ensemble components from the disease catalog and optional confirmed cases.

    Architecture: builds a shared symptom vocabulary + IDF, then a synthetic training matrix
    via ``train_models`` (augmented profiles/answers). Confirmed doctor cases are appended as
    extra labeled rows. Outputs RF (always), optional XGB/LGBM, a stacking meta-learner when
    multiple bases exist, and an optional Torch MLP gated by time/case thresholds. The returned
    dict is a full cache snapshot (models + vocab + ``symptom_freq`` priors + metrics); callers
    merge it into ``_model_cache`` under ``_training_lock``. Does not touch Redis or disk.
    """
    out = dict(seed_snapshot)
    vocab, idf = build_vocab_and_idf(diseases)
    if len(vocab) > MAX_VOCAB_SIZE:
        vocab = prune_vocab_by_mutual_info(
            diseases,
            vocab,
            MAX_VOCAB_SIZE,
            min_mi=float(os.getenv("MI_MIN_THRESHOLD", "0.01")),
        )
        idf = {s: idf.get(s, 1.0) for s in vocab}

    X_train, y_train = await asyncio.to_thread(train_models, diseases, vocab)
    extra_cases = list(resolved_cases)
    for c in extra_cases:
        mapped = confirmed_case_to_vector(c, diseases, vocab)
        if mapped is None:
            continue
        x, y = mapped
        X_train = np.vstack([X_train, np.array([x], dtype=np.float32)])
        y_train = np.append(y_train, np.array([y], dtype=np.int64))

    if len(X_train) == 0:
        out["signature"] = training_signature
        out["vocab"] = vocab
        out["idf"] = idf
        out["diseases"] = diseases
        out["metrics"] = {"top1_accuracy": 0.0, "top3_accuracy": 0.0, "samples": 0}
        out["confirmed_cases"] = extra_cases
        return out

    logger.info("Training models on %d samples (%d classes)", len(X_train), len(diseases))

    X_fit = X_train
    y_fit = y_train
    X_val = X_train
    y_val = y_train
    stratify = y_train if len(np.unique(y_train)) > 1 else None
    if len(X_train) >= 12 and len(np.unique(y_train)) > 1:
        X_fit, X_val, y_fit, y_val = train_test_split(
            X_train, y_train, test_size=0.2, random_state=42, stratify=stratify
        )

    rf = RandomForestClassifier(
        n_estimators=RF_N_ESTIMATORS,
        max_features=max(8, int(math.sqrt(X_train.shape[1]) * 1.2)),
        class_weight="balanced_subsample",
        random_state=42,
    )
    sample_weight = compute_sample_weight(class_weight="balanced", y=y_fit)
    await asyncio.to_thread(rf.fit, X_fit, y_fit, sample_weight=sample_weight)

    xgb = None
    if XGBClassifier is not None:
        try:
            xgb = XGBClassifier(
                n_estimators=160,
                max_depth=6,
                learning_rate=0.08,
                objective="multi:softprob",
                num_class=len(diseases),
                subsample=0.9,
                colsample_bytree=0.9,
                eval_metric="mlogloss",
            )
            await asyncio.to_thread(xgb.fit, X_fit, y_fit, sample_weight=sample_weight)
        except Exception as e:
            logger.error("XGBoost init or fit failed: %s", e)
            xgb = None

    lgbm = None
    if LGBMClassifier is not None:
        try:
            lgbm = LGBMClassifier(
                n_estimators=200,
                num_leaves=31,
                learning_rate=0.06,
                objective="multiclass",
            )
            await asyncio.to_thread(lgbm.fit, X_fit, y_fit, sample_weight=sample_weight)
        except Exception as e:
            logger.error("LightGBM init or fit failed: %s", e)
            lgbm = None

    stacked = None
    estimators: list[tuple[str, Any]] = [("rf", rf)]
    if xgb is not None:
        estimators.append(("xgb", xgb))
    if lgbm is not None:
        estimators.append(("lgbm", lgbm))
    stack_model = get_stacked_ensemble(estimators)
    if stack_model is not None:
        try:
            stacked = await asyncio.to_thread(stack_model.fit, X_fit, y_fit)
        except Exception as e:
            logger.error("Stacking fit failed: %s", e)
            stacked = None

    torch_model = None
    if torch is not None and nn is not None and optim is not None:
        prev_torch_ts = float(seed_snapshot.get("last_torch_train_ts", 0.0) or 0.0)
        prev_torch_cases = int(seed_snapshot.get("torch_cases_count", 0) or 0)
        now_ts = time.time()
        prev_signature = str(seed_snapshot.get("signature") or "")
        diseases_changed = prev_signature.split("|cases=")[0] != training_signature.split("|cases=")[0]
        enough_new_cases = len(extra_cases) - prev_torch_cases >= CONFIRMED_BATCH_SIZE
        should_train_torch = diseases_changed or enough_new_cases or (now_ts - prev_torch_ts >= TORCH_MIN_INTERVAL_SEC)
        if should_train_torch:
            try:
                state_dict = None
                if _torch_training_executor is not None:
                    loop = asyncio.get_running_loop()
                    state_dict = await loop.run_in_executor(
                        _torch_training_executor,
                        _train_torch_in_subprocess,
                        int(X_train.shape[1]),
                        int(len(diseases)),
                        np.ascontiguousarray(X_fit.astype(np.float32)),
                        np.ascontiguousarray(y_fit.astype(np.int64)),
                        np.ascontiguousarray(X_val.astype(np.float32)),
                        np.ascontiguousarray(y_val.astype(np.int64)),
                        int(TORCH_EPOCHS),
                        0.003,
                    )
                if state_dict is not None and TorchMLP is not None:
                    torch_model = TorchMLP(X_train.shape[1], len(diseases))
                    torch_model.load_state_dict(state_dict)
                    torch_model.eval()
                out["last_torch_train_ts"] = now_ts
                out["torch_cases_count"] = len(extra_cases)
            except Exception as e:
                logger.error("Torch model train in subprocess failed: %s", e)
                torch_model = None
        else:
            torch_model = seed_snapshot.get("torch_model")

    rf_val_proba = await asyncio.to_thread(rf.predict_proba, X_val)
    rf_val_pred = np.argmax(rf_val_proba, axis=1)
    top1 = accuracy_score(y_val, rf_val_pred)
    try:
        top3 = top_k_accuracy_score(y_val, rf_val_proba, k=min(3, rf_val_proba.shape[1]), labels=list(range(rf_val_proba.shape[1])))
    except Exception:
        top3 = top1
    cv_scores = []
    if len(X_train) >= 15 and len(np.unique(y_train)) > 1:
        try:
            skf = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
            for tr, te in skf.split(X_train, y_train):
                m = RandomForestClassifier(n_estimators=140, random_state=42)
                m.fit(X_train[tr], y_train[tr])
                cv_scores.append(accuracy_score(y_train[te], m.predict(X_train[te])))
        except Exception:
            cv_scores = []

    out["signature"] = training_signature
    out["vocab"] = vocab
    out["idf"] = idf
    out["diseases"] = diseases
    out["rf"] = rf
    out["xgb"] = xgb
    out["lgbm"] = lgbm
    out["stacked"] = stacked
    out["torch_model"] = torch_model
    out["symptom_freq"] = build_frequency_table(diseases)
    out["confirmed_cases"] = extra_cases
    out["metrics"] = {
        "top1_accuracy": round(float(top1), 6),
        "top3_accuracy": round(float(top3), 6),
        "cv_top1_accuracy": round(float(np.mean(cv_scores)), 6) if cv_scores else None,
        "samples": int(len(X_train)),
    }
    return out


async def _background_train(
    diseases: list[dict[str, Any]],
    cases_snapshot: list[dict[str, Any]],
    seed_snapshot: dict[str, Any],
    training_signature: str,
    bootstrap_done_event: asyncio.Event | None,
) -> None:
    global _model_cache, _training_in_progress, training_status
    prev_snap_len = len(cases_snapshot)
    merged_cases: list[dict[str, Any]] = list(cases_snapshot)
    diseases_follow: list[dict[str, Any]] = []
    lock_token: str | None = None
    try:
        lock_token = await _acquire_train_lock()
        if lock_token is None:
            logger.warning("ML train lock not acquired; skipping this training run (another replica may hold the lock)")
            async with _training_lock:
                _training_in_progress = False
                training_status = "idle"
            return
        new_cache = await _build_models_internal(
            diseases,
            list(cases_snapshot),
            training_signature,
            dict(seed_snapshot),
        )
        async with _training_lock:
            latest = dict(_model_cache)
            merged_cases = trim_confirmed_cases(
                list(latest.get("confirmed_cases", new_cache.get("confirmed_cases", [])))
            )
            new_cache = dict(new_cache)
            new_cache["confirmed_cases"] = merged_cases
            new_cache["feedback_count"] = int(latest.get("feedback_count", len(merged_cases)))
            new_cache["signature"] = diseases_signature(new_cache["diseases"]) + f"|cases={len(merged_cases)}"
            _model_cache = new_cache
            diseases_follow = list(new_cache.get("diseases", diseases))
            _training_in_progress = False
            training_status = "idle"
        snapshot = dict(new_cache)
        new_ver = await asyncio.to_thread(persist_new_model_version_sync, snapshot)
        if new_ver is not None:
            await save_active_version_to_redis(new_ver)
            async with _training_lock:
                _model_cache["active_model_version"] = new_ver
            await _publish_model_version_event(int(new_ver))
        await save_persistent_models_async(new_cache)
        await save_state_to_redis(await read_model_cache_locked())
        logger.info("Background training completed successfully")
        if len(merged_cases) > prev_snap_len and diseases_follow:
            asyncio.create_task(train_cached_models(diseases_follow, None))
    except Exception as e:
        logger.exception("Background training failed: %s", e)
        async with _training_lock:
            _training_in_progress = False
            training_status = "idle"
    finally:
        await _release_train_lock(lock_token)
        if bootstrap_done_event is not None:
            bootstrap_done_event.set()


async def train_cached_models(
    diseases: list[dict[str, Any]],
    confirmed_cases: list[dict[str, Any]] | None = None,
    *,
    bootstrap_done_event: asyncio.Event | None = None,
) -> dict[str, Any]:
    global _model_cache, training_status, _training_in_progress
    defer_wait_for_running_train = False
    async with _training_lock:
        current = dict(_model_cache)
        if not diseases:
            current["signature"] = None
            current["metrics"] = {}
            current["rf"] = None
            _model_cache = current
            _training_in_progress = False
            training_status = "idle"
            if bootstrap_done_event is not None:
                bootstrap_done_event.set()
            return dict(_model_cache)

        cases_list = trim_confirmed_cases(
            list(confirmed_cases if confirmed_cases is not None else current.get("confirmed_cases", []))
        )
        signature = diseases_signature(diseases) + f"|cases={len(cases_list)}"
        if current.get("signature") == signature and current.get("rf") is not None:
            if bootstrap_done_event is not None:
                bootstrap_done_event.set()
            return dict(current)

        if _training_in_progress:
            if bootstrap_done_event is None:
                return dict(current)
            defer_wait_for_running_train = True
        else:
            seed = dict(current)
            _training_in_progress = True
            training_status = "running"

    if defer_wait_for_running_train:
        while _training_in_progress:
            await asyncio.sleep(0.05)
        if bootstrap_done_event is not None:
            bootstrap_done_event.set()
        return await read_model_cache_locked()

    asyncio.create_task(
        _background_train(
            diseases,
            cases_list,
            seed,
            signature,
            bootstrap_done_event,
        )
    )
    return dict(seed)


async def _publish_model_version_event(version: int) -> None:
    """Notify other ML replicas to reload weights from disk (Redis Pub/Sub)."""
    if not redis_client or not REDIS_MODEL_PUBSUB_CHANNEL:
        return
    try:
        payload = json.dumps({"action": "reload_version", "version": int(version)})
        await asyncio.wait_for(
            redis_client.publish(REDIS_MODEL_PUBSUB_CHANNEL, payload),
            timeout=REDIS_CMD_TIMEOUT_SEC,
        )
    except Exception as e:
        logger.warning("Redis publish model_version failed: %s", e)


async def _apply_loaded_model_version(version: int) -> None:
    """Load a versioned snapshot from disk into process memory (used by pub/sub replicas)."""
    loaded = await asyncio.to_thread(load_model_version, int(version))
    if not loaded or loaded.get("rf") is None:
        logger.warning("Pub/sub: could not load model version %s", version)
        return
    manifest = await asyncio.to_thread(load_manifest)
    versions = manifest.get("versions", [])
    ver_meta = next((v for v in versions if int(v.get("version", 0)) == int(version)), None)
    sig = (ver_meta or {}).get("signature")
    async with _training_lock:
        global _model_cache
        cur = dict(_model_cache)
        for k, v in loaded.items():
            if v is not None:
                cur[k] = v
        if sig is not None:
            cur["signature"] = sig
        cur["active_model_version"] = int(version)
        _model_cache = cur
    logger.info("Reloaded in-memory models to version %s (Redis pub/sub)", version)


async def _model_pubsub_listener() -> None:
    if not redis_client:
        return
    pubsub = redis_client.pubsub()
    try:
        await pubsub.subscribe(REDIS_MODEL_PUBSUB_CHANNEL)
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=60.0)
            if not msg or msg.get("type") != "message":
                continue
            raw = msg.get("data")
            if raw is None:
                continue
            if not isinstance(raw, str):
                raw = str(raw)
            try:
                body = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(body, dict) or body.get("action") != "reload_version":
                continue
            try:
                ver = int(body.get("version", 0))
            except (TypeError, ValueError):
                continue
            if ver > 0:
                await _apply_loaded_model_version(ver)
    except asyncio.CancelledError:
        raise
    except Exception as e:
        logger.exception("_model_pubsub_listener: %s", e)
    finally:
        try:
            await pubsub.unsubscribe(REDIS_MODEL_PUBSUB_CHANNEL)
            aclose = getattr(pubsub, "aclose", None)
            if callable(aclose):
                await aclose()
            else:
                close = getattr(pubsub, "close", None)
                if callable(close):
                    res = close()
                    if asyncio.iscoroutine(res):
                        await res
        except Exception:
            pass


async def shutdown() -> None:
    global redis_client, _model_pubsub_task, _torch_training_executor
    logger.info("Shutting down ML service...")
    cache = await read_model_cache_locked()
    await save_persistent_models_async(cache)
    if _model_pubsub_task is not None:
        _model_pubsub_task.cancel()
        try:
            await _model_pubsub_task
        except asyncio.CancelledError:
            pass
        _model_pubsub_task = None
    if redis_client is not None:
        try:
            await redis_client.aclose()
        except Exception:
            pass
        redis_client = None
    if _torch_training_executor is not None:
        try:
            _torch_training_executor.shutdown(wait=False)
        except Exception:
            pass
        _torch_training_executor = None


def handle_signal() -> None:
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(shutdown())
    except RuntimeError:
        asyncio.run(shutdown())

async def startup_ml() -> None:
    global redis_client, _model_cache, _model_pubsub_task
    manifest = await asyncio.to_thread(load_manifest)
    active_ver = manifest.get("active_version")
    loaded_version: dict[str, Any] | None = None
    loaded_from_manifest = False
    if active_ver is not None:
        loaded_version = await asyncio.to_thread(load_model_version, int(active_ver))
        if loaded_version and loaded_version.get("rf") is not None:
            async with _training_lock:
                current = dict(_model_cache)
                for k, v in loaded_version.items():
                    if v is not None:
                        current[k] = v
                current["active_model_version"] = int(active_ver)
                _model_cache = current
            loaded_from_manifest = True
            logger.info("Loaded ML models from manifest active_version=%s", active_ver)
    if not loaded_from_manifest:
        disk_models = await asyncio.to_thread(_load_disk_models_joblib)
        await merge_disk_models_into_cache(disk_models)

    if REDIS_URL and aioredis is not None:
        try:
            redis_client = aioredis.from_url(
                REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=float(os.getenv("REDIS_SOCKET_CONNECT_TIMEOUT_SEC", "5")),
                socket_timeout=float(os.getenv("REDIS_SOCKET_TIMEOUT_SEC", "5")),
            )
            redis_ready = await wait_for_redis_ready()
            if not redis_ready:
                raise RuntimeError("Redis did not become healthy during startup window")
            if not _model_cache.get("rf"):
                rav = await load_active_version_from_redis()
                if rav is not None:
                    ld = await asyncio.to_thread(load_model_version, int(rav))
                    if ld and ld.get("rf") is not None:
                        async with _training_lock:
                            current = dict(_model_cache)
                            for k, v in ld.items():
                                if v is not None:
                                    current[k] = v
                            current["active_model_version"] = int(rav)
                            _model_cache = current
                        logger.info("Loaded ML models from Redis active_version=%s", rav)
            redis_state = await load_state_from_redis()
            if isinstance(redis_state, dict):
                async with _training_lock:
                    current = dict(_model_cache)
                    current.update(
                        {
                            "signature": redis_state.get("signature", current.get("signature")),
                            "diseases": redis_state.get("diseases", current.get("diseases", [])),
                            "confirmed_cases": trim_confirmed_cases(
                                list(redis_state.get("confirmed_cases", current.get("confirmed_cases", [])))
                            ),
                            "feedback_count": int(redis_state.get("feedback_count", current.get("feedback_count", 0))),
                            "metrics": redis_state.get("metrics", current.get("metrics", {})),
                            "last_torch_train_ts": float(
                                redis_state.get("last_torch_train_ts", current.get("last_torch_train_ts", 0.0))
                            ),
                            "torch_cases_count": int(
                                redis_state.get("torch_cases_count", current.get("torch_cases_count", 0))
                            ),
                        }
                    )
                    avs = redis_state.get("active_model_version")
                    if avs is not None:
                        try:
                            current["active_model_version"] = int(avs)
                        except (TypeError, ValueError):
                            pass
                    _model_cache = current
            logger.info("Redis ML state enabled")
            pubsub_on = os.getenv("ML_MODEL_PUBSUB", "1").strip().lower() not in ("0", "false", "no", "off")
            if pubsub_on and (_model_pubsub_task is None or _model_pubsub_task.done()):
                _model_pubsub_task = asyncio.create_task(_model_pubsub_listener())
        except Exception as e:
            redis_client = None
            logger.warning("Redis is configured but unavailable: %s", e)
    elif REDIS_URL and aioredis is None:
        logger.warning("REDIS_URL configured but redis package is unavailable")

    # Diseases + initial train come from Node POST /train (not load_diseases_from_file here).
    # Disk/Redis snapshot may still load RF from a previous run; mismatching signature is fixed on first /train.
    try:
        loop = asyncio.get_running_loop()
        if hasattr(loop, "add_signal_handler"):
            loop.add_signal_handler(signal.SIGTERM, handle_signal)
            loop.add_signal_handler(signal.SIGINT, handle_signal)
    except Exception:
        pass


async def shutdown_ml() -> None:
    await shutdown()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await startup_ml()
    yield
    await shutdown_ml()


app = FastAPI(title="sealara-ml-service", lifespan=lifespan)
app.add_middleware(APIKeyMiddleware)
app.add_middleware(MlServiceRateLimitMiddleware, max_requests=ML_RATE_LIMIT_MAX, window_sec=ML_RATE_LIMIT_WINDOW_SEC)


@app.get("/health")
async def health() -> dict[str, Any]:
    cache = await read_model_cache_locked()
    redis_ok = False
    if redis_client:
        try:
            redis_ok = bool(await redis_client.ping())
        except Exception:
            redis_ok = False
    return {
        "ok": True,
        "models": {
            "xgboost": bool(XGBClassifier),
            "lightgbm": bool(LGBMClassifier),
            "stacking": True,
            "torch": bool(torch),
        },
        "cached": cache.get("signature") is not None,
        "models_ready": bool(cache.get("rf") is not None and cache.get("signature")),
        "training_status": training_status,
        "metrics": cache.get("metrics", {}),
        "active_model_version": cache.get("active_model_version"),
        "redis": {"enabled": bool(redis_client), "ok": redis_ok},
    }


@app.get("/metrics")
async def metrics() -> dict[str, Any]:
    cache = await read_model_cache_locked()
    redis_state_cached = False
    if redis_client:
        try:
            redis_state_cached = bool(await redis_client.exists(REDIS_STATE_KEY))
        except Exception:
            redis_state_cached = False
    return {
        "cached": cache.get("signature") is not None,
        "samples": int((cache.get("metrics") or {}).get("samples", 0)),
        "top1_accuracy": (cache.get("metrics") or {}).get("top1_accuracy"),
        "top3_accuracy": (cache.get("metrics") or {}).get("top3_accuracy"),
        "redis_enabled": bool(redis_client),
        "redis_state_cached": redis_state_cached,
        "active_model_version": cache.get("active_model_version"),
    }


@app.get("/models")
async def list_models() -> dict[str, Any]:
    manifest = await asyncio.to_thread(load_manifest)
    return {
        "active_version": manifest.get("active_version"),
        "versions": manifest.get("versions", []),
    }


@app.post("/models/switch")
async def switch_model_version(payload: SwitchVersionPayload) -> dict[str, Any]:
    manifest = await asyncio.to_thread(load_manifest)
    versions = manifest.get("versions", [])
    if not any(int(v.get("version", 0)) == int(payload.version) for v in versions):
        raise HTTPException(status_code=404, detail="Version not found")
    loaded = await asyncio.to_thread(load_model_version, int(payload.version))
    if not loaded or loaded.get("rf") is None:
        raise HTTPException(status_code=500, detail="Failed to load model version")
    ver_meta = next(v for v in versions if int(v.get("version", 0)) == int(payload.version))
    sig = ver_meta.get("signature")
    async with _training_lock:
        global _model_cache
        cur = dict(_model_cache)
        for k, v in loaded.items():
            if v is not None:
                cur[k] = v
        if sig is not None:
            cur["signature"] = sig
        cur["active_model_version"] = int(payload.version)
        _model_cache = cur
    manifest["active_version"] = int(payload.version)
    await asyncio.to_thread(save_manifest, manifest)
    await save_active_version_to_redis(int(payload.version))
    snap = await read_model_cache_locked()
    await save_state_to_redis(snap)
    await save_persistent_models_async(snap)
    await _publish_model_version_event(int(payload.version))
    return {"ok": True, "active_version": int(payload.version)}


@app.get("/prometheus")
async def prometheus_metrics() -> Response:
    if generate_latest is None:
        raise HTTPException(status_code=503, detail="prometheus_client not installed")
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/preprocess")
async def preprocess_endpoint(payload: PreprocessPayload) -> dict[str, Any]:
    if preprocess_requests_total is not None:
        preprocess_requests_total.inc()
    t0 = time.perf_counter()
    try:
        cache = await get_cache()
        profile = payload.profile or {}
        answers = payload.answers or {}
        normalized = list(dict.fromkeys(payload.raw_symptoms))
        vocab = list(cache.get("vocab") or [])
        idf = cache.get("idf") or {}
        if not isinstance(idf, dict):
            idf = {}
        vec = feature_vector(normalized, vocab, profile, answers)
        idf_scores = {s: float(idf[s]) for s in normalized if s in idf}
        return {
            "normalized_symptoms": normalized,
            "feature_vector": [float(x) for x in vec],
            "idf_scores": idf_scores,
        }
    finally:
        if preprocess_duration_seconds is not None:
            preprocess_duration_seconds.observe(time.perf_counter() - t0)


@app.get("/catalog/symptom-vocabulary")
async def symptom_vocabulary() -> dict[str, Any]:
    cache = await read_model_cache_locked()
    vocab = cache.get("vocab") or []
    return {"symptoms": list(vocab)}


@app.post("/fallback/cosine")
async def fallback_cosine_endpoint(payload: FallbackCosinePayload) -> dict[str, Any]:
    cache = await read_model_cache_locked()
    diseases = list(cache.get("diseases") or [])
    if not diseases:
        diseases = await asyncio.to_thread(load_diseases_from_file)
    return cosine_overlap_fallback_response(diseases, payload.symptoms, payload.profile or {}, payload.round)


@app.post("/train")
async def train(payload: TrainPayload) -> dict[str, Any]:
    if train_requests_total is not None:
        train_requests_total.inc()
    t0 = time.perf_counter()
    try:
        seed_cache = await get_cache()
        diseases = payload.diseases or list(seed_cache.get("diseases", []))
        cache = await train_cached_models(diseases, payload.confirmed_cases or [])
        return {
            "ok": True,
            "cached": cache.get("signature") is not None,
            "metrics": cache.get("metrics", {}),
            "model_flags": {
                "xgboost": cache.get("xgb") is not None,
                "lightgbm": cache.get("lgbm") is not None,
                "stacked": cache.get("stacked") is not None,
                "torch": cache.get("torch_model") is not None,
            },
        }
    finally:
        if train_duration_seconds is not None:
            train_duration_seconds.observe(time.perf_counter() - t0)


@app.post("/feedback")
async def feedback(payload: FeedbackPayload) -> dict[str, Any]:
    global _model_cache
    if feedback_events_total is not None:
        feedback_events_total.inc()
    case = {
        "symptoms": payload.symptoms,
        "profile": payload.profile,
        "answers": payload.answers,
        "confirmed_disease_id": payload.confirmed_disease_id,
    }
    async with _training_lock:
        current = dict(_model_cache)
        old_count = int(current.get("feedback_count", 0))
        diseases = list(current.get("diseases", []))
        confirmed_cases = trim_confirmed_cases(list(current.get("confirmed_cases", [])))
        confirmed_cases.append(case)
        confirmed_cases = trim_confirmed_cases(confirmed_cases)
        preview = dict(current)
        preview["confirmed_cases"] = confirmed_cases
        preview["feedback_count"] = len(confirmed_cases)
    retrain_needed = len(confirmed_cases) - old_count >= CONFIRMED_BATCH_SIZE
    await save_persistent_models_async(preview)
    await save_state_to_redis(preview)
    async with _training_lock:
        _model_cache = preview
    if retrain_needed and diseases:
        asyncio.create_task(train_cached_models(diseases, confirmed_cases))
        logger.info("Scheduled background retrain on feedback batch: %d", len(confirmed_cases))
    cache = await get_cache()
    return {
        "ok": True,
        "metrics": cache.get("metrics", {}),
        "confirmed_cases": len(confirmed_cases),
        "feedback_batch_size": CONFIRMED_BATCH_SIZE,
        "retrained": retrain_needed,
    }


async def _predict_internal(
    symptoms: list[str],
    profile: dict[str, Any],
    answers: dict[str, Any],
    round_number: int,
    diseases: list[dict[str, Any]],
    allow_empty_symptoms: bool = False,
    confidence_threshold: float = CONFIDENCE_THRESHOLD,
) -> dict[str, Any]:
    """Run ensemble inference + clarification logic for one patient turn.

    Steps: normalize symptoms, build one feature row, collect ``predict_proba`` from RF/XGB/LGBM
    (and Torch/stack when present), blend with frequency priors and cosine overlap, temperature
    softmax over raw scores, then either return low-confidence clarification (IG-ranked
    symptom hints) or a ranked prediction list with uncertainty. Raises ``HTTPException`` if
    the in-memory cache signature does not match the requested disease set (stale model guard).
    """
    if not diseases:
        seed_cache = await get_cache()
        diseases = list(seed_cache.get("diseases", []))
    normalized_symptoms = [normalize_text(x) for x in symptoms if normalize_text(x)]
    if not allow_empty_symptoms and not normalized_symptoms:
        raise HTTPException(status_code=422, detail="symptoms must contain at least one valid item")
    if not diseases:
        return {
            "profileUsed": {"age": None, "gender": "", "region": ""},
            "predictions": [],
            "uncertainty": 1.0,
            "needClarification": True,
            "clarifyingSymptoms": [],
            "round": round_number,
            "debug": {"source": "fastapi", "error": "no diseases"},
        }

    cache = await get_cache()
    expected_signature = diseases_signature(diseases) + f"|cases={len(cache.get('confirmed_cases', []))}"
    if cache.get("signature") != expected_signature:
        raise HTTPException(status_code=503, detail="Model is not ready for current diseases set")
    vocab = cache.get("vocab", [])
    idf = cache.get("idf", {})
    rf = cache.get("rf")
    if rf is None:
        raise HTTPException(status_code=503, detail="Model not trained yet")

    x_in = np.array([feature_vector(normalized_symptoms, vocab, profile or {}, answers or {})], dtype=np.float32)
    ref_date = _reference_date_for_profile(profile)

    timings: dict[str, float] = {}
    t0 = time.perf_counter()
    rf_proba = (await predict_proba_async(rf, x_in))[0]
    timings["rf"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    xgb_proba = rf_proba.copy()
    xgb = cache.get("xgb")
    if xgb is not None:
        try:
            xgb_proba = (await predict_proba_async(xgb, x_in))[0]
        except Exception:
            xgb_proba = rf_proba.copy()
    timings["xgb"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    lgbm_proba = rf_proba.copy()
    lgbm = cache.get("lgbm")
    if lgbm is not None:
        try:
            lgbm_proba = (await predict_proba_async(lgbm, x_in))[0]
        except Exception:
            lgbm_proba = rf_proba.copy()
    timings["lgbm"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    torch_proba = rf_proba.copy()
    model = cache.get("torch_model")
    if model is not None and torch is not None:
        try:
            with torch.no_grad():
                logits = model(torch.tensor(x_in, dtype=torch.float32))
                torch_proba = torch.softmax(logits, dim=1).numpy()[0]
        except Exception:
            torch_proba = rf_proba.copy()
    timings["torch"] = time.perf_counter() - t0

    t0 = time.perf_counter()
    stacked_proba = None
    stacked = cache.get("stacked")
    if stacked is not None:
        try:
            stacked_proba = (await predict_proba_async(stacked, x_in))[0]
        except Exception:
            stacked_proba = None
    timings["stacked"] = time.perf_counter() - t0

    logger.debug("Model inference timings (s): %s", timings)

    blended = []
    symptom_freq = cache.get("symptom_freq", {})
    model_probas = [rf_proba, xgb_proba, lgbm_proba]
    model_weights = []
    for proba in model_probas:
        h = shannon_entropy(proba)
        max_h = math.log(max(2, len(proba)))
        confidence = 1.0 - min(1.0, h / max_h)
        model_weights.append(max(1e-3, confidence))
    total_w = sum(model_weights)
    model_weights = [w / total_w for w in model_weights]

    for i, d in enumerate(diseases):
        ds = symptom_set_for_disease(d)
        cosine = symptom_cosine(normalized_symptoms, ds, idf)
        freq_probs = symptom_freq.get(i, {})
        bayes = 0.01
        for s in normalized_symptoms:
            p = float(freq_probs.get(s, 0.03))
            p = max(0.001, min(0.999, p))
            bayes *= p
        bayes = max(1e-9, bayes)
        if stacked_proba is not None:
            ensemble = float(stacked_proba[i])
        else:
            ensemble = rf_proba[i] * model_weights[0] + xgb_proba[i] * model_weights[1] + lgbm_proba[i] * model_weights[2]
        ensemble += torch_proba[i] * TORCH_WEIGHT + bayes * BAYES_WEIGHT + cosine * COSINE_WEIGHT
        blended.append(
            {
                "id": d.get("id"),
                "name": d.get("name", ""),
                "definition": d.get("definition", ""),
                "specialist": str((d.get("raw", {}) or {}).get("специалист", "")),
                "scoreRaw": float(ensemble),
                "probability": float(rf_proba[i]),
                "rfProbability": float(rf_proba[i]),
                "xgbProbability": float(xgb_proba[i]),
                "lgbmProbability": float(lgbm_proba[i]),
                "stackedProbability": float(stacked_proba[i]) if stacked_proba is not None else None,
                "torchProbability": float(torch_proba[i]),
                "cosineScore": float(cosine),
                "bayesProbability": float(bayes),
            }
        )

    probs = await softmax_async([x["scoreRaw"] for x in blended], SOFTMAX_TEMP_EARLY if round_number < 3 else SOFTMAX_TEMP_LATE)
    ranked = []
    for i, item in enumerate(blended):
        ranked.append(
            {
                "id": item["id"],
                "name": item["name"],
                "definition": item["definition"],
                "specialist": item["specialist"],
                "score": probs[i] if i < len(probs) else 0.0,
                "probability": item["probability"],
                "rfProbability": item["rfProbability"],
                "xgbProbability": item["xgbProbability"],
                "lgbmProbability": item["lgbmProbability"],
                "stackedProbability": item["stackedProbability"],
                "torchProbability": item["torchProbability"],
                "cosineScore": item["cosineScore"],
                "bayesProbability": item["bayesProbability"],
            }
        )
    ranked.sort(key=lambda x: x["score"], reverse=True)
    ranked = ranked[:6]
    confidence = ranked[0]["score"] if ranked else 0.0
    ranked_for_ig = ranked if ranked else [{"id": d.get("id"), "score": 1.0 / len(diseases)} for d in diseases]
    clarifying_always = suggest_clarifying_symptoms(
        diseases=diseases,
        normalized_symptoms=normalized_symptoms,
        ranked_for_ig=ranked_for_ig,
        limit=5,
        scan_limit=80,
    )
    if confidence < confidence_threshold:
        low_debug = {
            "source": "fastapi-ensemble",
            "confidence": confidence,
            "metrics": cache.get("metrics", {}),
        }
        if not IS_PRODUCTION:
            low_debug["inputSymptoms"] = normalized_symptoms
            low_debug["timings"] = timings
        return {
            "profileUsed": {
                "age": age_from_birthdate((profile or {}).get("birthDate"), reference_date=ref_date),
                "gender": (profile or {}).get("gender", ""),
                "region": (profile or {}).get("region", ""),
            },
            "predictions": ranked,
            "uncertainty": 1.0,
            "needClarification": True,
            "clarifyingSymptoms": clarifying_always,
            "round": round_number,
            "message": "Низкая уверенность модели, требуется уточнение симптомов",
            "debug": low_debug,
        }

    uncertainty = 1.0
    if len(ranked) > 1:
        uncertainty = max(0.0, 1.0 - (ranked[0]["score"] - ranked[1]["score"]))

    ok_debug = {
        "source": "fastapi-ensemble",
        "models": {
            "xgboost": cache.get("xgb") is not None,
            "lightgbm": cache.get("lgbm") is not None,
            "stacked": cache.get("stacked") is not None,
            "torch": cache.get("torch_model") is not None,
        },
        "metrics": cache.get("metrics", {}),
        "explainability": {
            "reasons": [s for s in normalized_symptoms[:3]],
        },
    }
    if not IS_PRODUCTION:
        ok_debug["inputSymptoms"] = normalized_symptoms
        ok_debug["timings"] = timings
    return {
        "profileUsed": {
            "age": age_from_birthdate((profile or {}).get("birthDate"), reference_date=ref_date),
            "gender": (profile or {}).get("gender", ""),
            "region": (profile or {}).get("region", ""),
        },
        "predictions": ranked,
        "uncertainty": uncertainty,
        "needClarification": uncertainty > UNCERTAINTY_THRESHOLD,
        "clarifyingSymptoms": clarifying_always,
        "round": round_number,
        "debug": ok_debug,
    }


@app.post("/predict")
async def predict(payload: PredictPayload) -> dict[str, Any]:
    if predict_requests_total is not None:
        predict_requests_total.inc()
    t0 = time.perf_counter()
    try:
        seed_cache = await get_cache()
        return await _predict_internal(
            symptoms=payload.symptoms,
            profile=payload.profile or {},
            answers=payload.answers or {},
            round_number=payload.round,
            diseases=payload.diseases or list(seed_cache.get("diseases", [])),
            allow_empty_symptoms=False,
            confidence_threshold=payload.confidence_threshold,
        )
    except HTTPException:
        raise
    except Exception:
        if predict_errors_total is not None:
            predict_errors_total.inc()
        raise
    finally:
        if predict_duration_seconds is not None:
            predict_duration_seconds.observe(time.perf_counter() - t0)


@app.post("/preliminary")
async def preliminary(payload: PreliminaryPayload) -> dict[str, Any]:
    if preliminary_requests_total is not None:
        preliminary_requests_total.inc()
    t0 = time.perf_counter()
    try:
        seed_cache = await get_cache()
        diseases = payload.diseases or list(seed_cache.get("diseases", []))
        if not diseases:
            return {
                "predictions": [],
                "relevantSymptoms": [],
                "uncertainty": 1.0,
                "needMoreDetails": True,
                "debug": {"source": "fastapi-ensemble", "error": "no diseases"},
            }

        answers = payload.answers or {}
        profile = payload.profile or {}
        symptom_scores: dict[str, float] = {}
        symptom_pool: set[str] = set()
        disease_sets: list[tuple[dict[str, Any], set[str]]] = []
        for d in diseases:
            ds = symptom_set_for_disease(d)
            disease_sets.append((d, ds))
            symptom_pool.update(ds)
            for s in ds:
                symptom_scores[s] = symptom_scores.get(s, 0.0) + 1.0

        if answers:
            rule_hints: list[str] = []
            if answers.get("fever") == "high":
                rule_hints.extend(["температура", "лихорад", "озноб"])
            if answers.get("visible_changes") == "visible":
                rule_hints.extend(["сыпь", "покрас", "отек", "пятн"])
            if answers.get("onset") == "sudden":
                rule_hints.extend(["остр", "внезап"])
            systems = answers.get("additional_systems", [])
            if isinstance(systems, str):
                systems = [systems]
            if "respiratory" in systems:
                rule_hints.extend(["кашель", "одыш", "горл"])
            if "digestive" in systems:
                rule_hints.extend(["тошнот", "живот", "диаре", "рвот"])
            if "neurological" in systems:
                rule_hints.extend(["голов", "онем", "слабост"])

            if rule_hints:
                for _, ds in disease_sets:
                    for s in ds:
                        if any(h in s for h in rule_hints):
                            symptom_scores[s] = symptom_scores.get(s, 0.0) + 2.0

        model_result = await _predict_internal(
            symptoms=[],
            profile=profile,
            answers=answers,
            round_number=1,
            diseases=diseases,
            allow_empty_symptoms=True,
            confidence_threshold=CONFIDENCE_THRESHOLD,
        )
        prelim_predictions = (model_result.get("predictions") or [])[:5]
        clarifying = (model_result.get("clarifyingSymptoms") or [])[:5]
        relevant = [k for k, _ in sorted(symptom_scores.items(), key=lambda x: x[1], reverse=True)[:25]]
        return {
            "predictions": prelim_predictions,
            "relevantSymptoms": relevant,
            "clarifyingSymptoms": clarifying,
            "uncertainty": float(model_result.get("uncertainty", 1.0)),
            "needMoreDetails": True,
            "debug": {
                "source": "preliminary-hybrid-model",
                "answers_used": bool(answers),
                "pool_size": len(symptom_pool),
            },
        }
    finally:
        if preliminary_duration_seconds is not None:
            preliminary_duration_seconds.observe(time.perf_counter() - t0)

