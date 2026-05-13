"""ML integration: background train, predict, signatures (PYTHONPATH=ml-service)."""

from __future__ import annotations

import asyncio
import os
import time

import pytest
from fastapi.testclient import TestClient

if not str(os.environ.get("ML_API_KEY", "")).strip():
    os.environ["ML_API_KEY"] = "pytest-ml-api-key"

from app import (  # noqa: E402
    _predict_internal,
    app,
    get_cache,
    read_model_cache_locked,
    train_cached_models,
)
from ml_service.catalog import diseases_signature  # noqa: E402

client = TestClient(app)
API_HEADERS = {"x-api-key": os.environ["ML_API_KEY"]}


def _wait_models_ready(timeout_sec: float = 180.0) -> None:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        r = client.get("/health")
        if r.status_code == 200 and r.json().get("models_ready"):
            return
        time.sleep(0.1)
    pytest.fail("models_ready not reached in time")


def _train_and_wait(diseases: list, cases: list | None = None) -> None:
    async def _go() -> None:
        ev = asyncio.Event()
        await train_cached_models(diseases, cases, bootstrap_done_event=ev)
        await asyncio.wait_for(ev.wait(), timeout=180.0)

    asyncio.run(_go())
    _wait_models_ready()


DISEASES_A = [
    {"id": 91001, "name": "IntA1", "definition": "d1", "raw": {"симптомы": "кашель|лихорадка"}},
    {"id": 91002, "name": "IntA2", "definition": "d2", "raw": {"симптомы": "температура|озноб"}},
]

DISEASES_B = [
    {"id": 92001, "name": "IntB1", "definition": "d1", "raw": {"симптомы": "слабость|головная боль"}},
    {"id": 92002, "name": "IntB2", "definition": "d2", "raw": {"симптомы": "тошнота|рвота"}},
]


def test_get_cache_never_raises_training_503() -> None:
    async def _go() -> None:
        c = await get_cache()
        assert isinstance(c, dict)

    asyncio.run(_go())


def test_train_cached_models_returns_immediately_while_event_waits_for_finish() -> None:
    """bootstrap_done_event is set when training finishes (or immediately if cache already matches)."""

    async def _go() -> None:
        ev = asyncio.Event()
        out = await train_cached_models(DISEASES_A, [], bootstrap_done_event=ev)
        assert isinstance(out, dict)
        await asyncio.wait_for(ev.wait(), timeout=180.0)
        snap = await get_cache()
        assert isinstance(snap, dict)

    asyncio.run(_go())


def test_predict_via_http_after_train() -> None:
    _train_and_wait(DISEASES_A)
    r = client.post(
        "/predict",
        json={
            "symptoms": ["кашель"],
            "profile": {},
            "answers": {},
            "round": 1,
            "confidence_threshold": 0.99,
            "diseases": DISEASES_A,
        },
        headers=API_HEADERS,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "predictions" in body
    assert len(body["predictions"]) >= 1


def test_predict_internal_two_symptom_patterns_same_disease_list() -> None:
    _train_and_wait(DISEASES_A)

    async def _inner() -> None:
        out1 = await _predict_internal(
            ["кашель"],
            {},
            {},
            1,
            DISEASES_A,
            False,
            0.99,
        )
        out2 = await _predict_internal(
            ["температура"],
            {},
            {},
            1,
            DISEASES_A,
            False,
            0.99,
        )
        assert out1["predictions"] and out2["predictions"]

    asyncio.run(_inner())


def test_signature_changes_after_retrain_with_different_catalog() -> None:
    _train_and_wait(DISEASES_A)

    async def _s1() -> str | None:
        return (await read_model_cache_locked()).get("signature")

    s1 = asyncio.run(_s1())
    assert s1
    _train_and_wait(DISEASES_B)

    async def _s2() -> str | None:
        return (await read_model_cache_locked()).get("signature")

    s2 = asyncio.run(_s2())
    assert s2
    assert s1 != s2
    assert diseases_signature(DISEASES_A) != diseases_signature(DISEASES_B)


def test_feedback_triggers_retrain_flag_when_batch_threshold_met(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app as app_mod

    monkeypatch.setattr(app_mod, "CONFIRMED_BATCH_SIZE", 1)
    _train_and_wait(DISEASES_A)
    r = client.post(
        "/feedback",
        json={
            "symptoms": ["кашель"],
            "profile": {},
            "answers": {},
            "confirmed_disease_id": 91001,
        },
        headers=API_HEADERS,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("retrained") is True
    assert body.get("confirmed_cases", 0) >= 1


def test_predict_503_when_payload_diseases_mismatch_cache() -> None:
    _train_and_wait(DISEASES_A)
    r = client.post(
        "/predict",
        json={
            "symptoms": ["кашель"],
            "profile": {},
            "answers": {},
            "round": 1,
            "confidence_threshold": 0.99,
            "diseases": DISEASES_B,
        },
        headers=API_HEADERS,
    )
    assert r.status_code == 503
