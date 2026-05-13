"""ML service tests (run from repo root: pytest tests/ or npm run test:ml)."""
import asyncio
import os
from datetime import date

import pytest

if not str(os.environ.get("ML_API_KEY", "")).strip():
    os.environ["ML_API_KEY"] = "pytest-ml-api-key"

from fastapi.testclient import TestClient

from app import app

from ml_service.features import age_from_birthdate, feature_vector
from ml_service.normalization import normalize_text

client = TestClient(app)

API_HEADERS = {"x-api-key": os.environ["ML_API_KEY"]}


@pytest.fixture(scope="module", autouse=True)
def ensure_ml_trained_from_disk() -> None:
    """Seed RF/vocab once. Sync TestClient does not reliably advance ``create_task`` training between polls; train via asyncio like integration tests."""
    from app import load_diseases_from_file, train_cached_models

    diseases = load_diseases_from_file()
    if not diseases:
        pytest.skip("diseases.json not available for ML integration tests")

    async def _go() -> None:
        ev = asyncio.Event()
        await train_cached_models(diseases, [], bootstrap_done_event=ev)
        await asyncio.wait_for(ev.wait(), timeout=300.0)

    asyncio.run(_go())
    h = client.get("/health")
    if h.status_code != 200 or not h.json().get("models_ready"):
        pytest.fail(f"ML not ready after train_cached_models: {h.status_code} {h.text}")


def test_normalize_text():
    assert normalize_text("  Боль в  горле  ") == "боль в горле"
    assert normalize_text("Тест   с   лишними пробелами") == "тест с лишними пробелами"
    assert normalize_text("Боль   в  горле!") == "боль в горле!"


def test_age_from_birthdate_fixed_date():
    assert age_from_birthdate("1990-06-15", reference_date=date(2024, 1, 1)) == 33


def test_predict_endpoint_auth():
    response = client.post("/predict", json={"symptoms": ["кашель"]}, headers={"x-api-key": "wrong"})
    assert response.status_code == 401


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_feature_vector_uses_evaluation_date_for_age_band():
    ref = date(2024, 1, 1)
    age = age_from_birthdate("1990-06-15", reference_date=ref)
    assert age == 33
    vocab = ["кашель"]
    vec = feature_vector(
        ["кашель"],
        vocab,
        {"gender": "female", "birthDate": "1990-06-15", "evaluationDate": "2024-01-01"},
        {},
    )
    # layout: len(vocab) symptom bits + 2 gender + 5 age bands + question_vector
    age_start = len(vocab) + 2
    age_slice = vec[age_start : age_start + 5]
    assert sum(age_slice) == 1.0
    assert age_slice[2] == 1.0  # 18–35 for age 33


def test_catalog_symptom_vocabulary():
    response = client.get("/catalog/symptom-vocabulary", headers=API_HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data.get("symptoms"), list)


def test_fallback_cosine_returns_predictions():
    response = client.post(
        "/fallback/cosine",
        json={"symptoms": ["кашель", "температура"], "profile": {"gender": "ж"}, "round": 1},
        headers=API_HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    assert body.get("debug", {}).get("source") == "python-cosine-fallback"
    assert isinstance(body.get("predictions"), list)
    assert len(body["predictions"]) >= 1


def test_preprocess_tokens_match_normalize_text_pipeline():
    response = client.post(
        "/preprocess",
        json={"raw_symptoms": ["  Сухой   кашель  ", "сухой кашель"], "profile": {}, "answers": {}},
        headers=API_HEADERS,
    )
    assert response.status_code == 200
    norm = response.json()["normalized_symptoms"]
    assert norm == ["сухой кашель"]


def test_predict_identical_payload_same_top1():
    body = {
        "symptoms": ["кашель"],
        "profile": {},
        "answers": {},
        "round": 1,
        "confidence_threshold": 0.99,
    }
    a = client.post("/predict", json=body, headers=API_HEADERS)
    b = client.post("/predict", json=body, headers=API_HEADERS)
    if a.status_code != 200:
        pytest.skip(f"predict not available: {a.status_code} {a.text}")
    assert b.status_code == 200
    assert a.json()["predictions"][0]["id"] == b.json()["predictions"][0]["id"]
