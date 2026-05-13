"""Unit tests for information_gain module (no FastAPI app import)."""

from __future__ import annotations

from ml_service.information_gain import calculate_information_gain, symptom_sets_by_disease_id_map


def test_calculate_information_gain_symmetry_on_uniform_scores() -> None:
    diseases = [
        {"id": 1, "raw": {"симптомы": "кашель|озноб"}},
        {"id": 2, "raw": {"симптомы": "тошнота|рвота"}},
    ]
    ranked = [{"id": 1, "score": 0.5}, {"id": 2, "score": 0.5}]
    by_id = symptom_sets_by_disease_id_map(diseases)
    ig = calculate_information_gain("кашель", ranked, diseases, by_id)
    assert 0.0 <= ig < 1.0
