"""Unit tests: softmax, feature_vector (layout), information gain."""

from __future__ import annotations

from ml_service.features import feature_vector, question_vector, softmax
from ml_service.information_gain import calculate_information_gain


def test_softmax_empty_and_sums_to_one() -> None:
    assert softmax([], 0.2) == []
    out = softmax([0.0, 1.0, 2.0], temperature=0.5)
    assert len(out) == 3
    assert abs(sum(out) - 1.0) < 1e-9
    assert out[2] > out[1] > out[0]


def test_feature_vector_age_band() -> None:
    vocab = ["кашель"]
    vec = feature_vector(
        ["кашель"],
        vocab,
        {"gender": "male", "birthDate": "1990-06-15", "evaluationDate": "2024-01-01"},
        {},
    )
    age_start = len(vocab) + 2
    age_slice = vec[age_start : age_start + 5]
    assert sum(age_slice) == 1.0


def test_question_vector_visible_both_and_pain_none() -> None:
    v_both = question_vector({"visible_changes": "both", "pain_character": "none"})
    assert v_both[0] == 1.0 and v_both[1] == 1.0
    assert v_both[-1] == 0.0
    v_sharp = question_vector({"pain_character": "sharp"})
    assert v_sharp[-1] == 1.0


def test_information_gain_non_negative() -> None:
    diseases = [
        {"id": 1, "raw": {"симптомы": "кашель|температура"}},
        {"id": 2, "raw": {"симптомы": "боль|слабость"}},
    ]
    ranked = [{"id": 1, "score": 0.7}, {"id": 2, "score": 0.3}]
    ig = calculate_information_gain("кашель", ranked, diseases)
    assert ig >= 0.0
