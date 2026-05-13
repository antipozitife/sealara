"""Clarifying-symptom scoring (information gain) — extracted from app for modularity."""

from __future__ import annotations

from typing import Any

import numpy as np

from ml_service.features import symptom_set_for_disease
from ml_service.normalization import normalize_text

try:
    from scipy.stats import entropy as scipy_entropy
except Exception:  # pragma: no cover
    scipy_entropy = None


def shannon_entropy(probs: np.ndarray) -> float:
    p = np.clip(np.asarray(probs, dtype=np.float64), 1e-12, 1.0)
    p = p / max(1e-12, float(p.sum()))
    if scipy_entropy is not None:
        return float(scipy_entropy(p))
    return float(-(p * np.log(p)).sum())


def symptom_sets_by_disease_id_map(all_diseases: list[dict[str, Any]]) -> dict[int, set[str]]:
    """One symptom-set build per disease id (avoids repeated symptom_set_for_disease inside IG loops)."""
    out: dict[int, set[str]] = {}
    for d in all_diseases:
        did = int(d.get("id", -1))
        if did < 0:
            continue
        out[did] = symptom_set_for_disease(d)
    return out


def calculate_information_gain(
    symptom: str,
    current_diseases: list[dict[str, Any]],
    all_diseases: list[dict[str, Any]],
    symptom_sets_by_id: dict[int, set[str]] | None = None,
) -> float:
    if not current_diseases:
        return 0.0

    if symptom_sets_by_id is None:
        symptom_sets_by_id = symptom_sets_by_disease_id_map(all_diseases)

    probs = np.array([max(0.0, float(d.get("score", 0.0))) for d in current_diseases], dtype=np.float64)
    if probs.sum() <= 0:
        probs = np.ones(len(current_diseases), dtype=np.float64) / len(current_diseases)
    else:
        probs = probs / probs.sum()

    p_s_given_d = []
    s_norm = normalize_text(symptom)
    for d in current_diseases:
        d_id = int(d.get("id", -1))
        ds = symptom_sets_by_id.get(d_id)
        if ds is None:
            p_s_given_d.append(0.05)
            continue
        p_s_given_d.append(0.85 if s_norm in ds else 0.15)
    p_s_given_d = np.array(p_s_given_d, dtype=np.float64)

    base_h = shannon_entropy(probs)
    p_s = float(np.dot(probs, p_s_given_d))
    p_not_s = max(1e-12, 1.0 - p_s)
    if p_s <= 1e-12:
        return 0.0

    post_yes = (probs * p_s_given_d) / max(1e-12, p_s)
    post_no = (probs * (1.0 - p_s_given_d)) / p_not_s
    cond_h = p_s * shannon_entropy(post_yes) + p_not_s * shannon_entropy(post_no)
    return max(0.0, float(base_h - cond_h))


def suggest_clarifying_symptoms(
    diseases: list[dict[str, Any]],
    normalized_symptoms: list[str],
    ranked_for_ig: list[dict[str, Any]],
    limit: int = 5,
    scan_limit: int = 80,
) -> list[str]:
    all_possible_symptoms = set()
    for d in diseases:
        all_possible_symptoms.update(symptom_set_for_disease(d))
    missing_symptoms = all_possible_symptoms - set(normalized_symptoms)
    by_id = symptom_sets_by_disease_id_map(diseases)
    ig_list = []
    for symptom in list(missing_symptoms)[:scan_limit]:
        ig = calculate_information_gain(symptom, ranked_for_ig, diseases, by_id)
        ig_list.append((symptom, ig))
    ig_list.sort(key=lambda x: x[1], reverse=True)
    return [s for s, _ in ig_list[:limit]]
