import os

if not str(os.environ.get("ML_API_KEY", "")).strip():
    os.environ["ML_API_KEY"] = "pytest-ml-api-key"

from fastapi.testclient import TestClient
from app import app
from ml_service.information_gain import calculate_information_gain
from ml_service.features import feature_vector, softmax
from ml_service.normalization import normalize_text


def test_health_endpoint():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body.get("ok") is True


def test_softmax_distribution():
    values = softmax([1.0, 2.0, 3.0], 0.2)
    assert len(values) == 3
    assert abs(sum(values) - 1.0) < 1e-6


def test_feature_vector_shape():
    vocab = ["кашель", "температура"]
    vec = feature_vector(
        ["кашель"],
        vocab,
        {"gender": "female", "birthDate": "1995-01-01"},
        {"fever": "high", "additional_systems": ["respiratory"]},
    )
    assert len(vec) >= len(vocab) + 2 + 5


def test_normalize_text_strips_and_lowercase():
    assert normalize_text("  Боль в горле  ") == "боль в горле"
    assert normalize_text("Боль   в  горле!") == "боль в горле!"


def test_preprocess_endpoint():
    client = TestClient(app)
    key = os.environ["ML_API_KEY"]
    r = client.post(
        "/preprocess",
        json={"raw_symptoms": ["  Боль в горле  ", "кашель"], "profile": {}, "answers": {}},
        headers={"x-api-key": key},
    )
    assert r.status_code == 200
    body = r.json()
    assert "боль в горле" in body.get("normalized_symptoms", [])
    assert isinstance(body.get("feature_vector"), list)
    assert len(body["feature_vector"]) > 0


def test_information_gain_non_negative():
    diseases = [
        {"id": 1, "raw": {"симптомы": "кашель|температура"}},
        {"id": 2, "raw": {"симптомы": "боль|слабость"}},
    ]
    ranked = [{"id": 1, "score": 0.7}, {"id": 2, "score": 0.3}]
    ig = calculate_information_gain("кашель", ranked, diseases)
    assert ig >= 0.0

