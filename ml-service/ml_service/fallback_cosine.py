"""Node-compatible cosine overlap fallback (uniform weights, same ranking as legacy server/index.cjs)."""

from __future__ import annotations

import math
from typing import Any

from ml_service.features import symptom_set_for_disease


def cosine_overlap_fallback_response(
    diseases: list[dict[str, Any]],
    normalized_symptoms: list[str],
    profile: dict[str, Any],
    round_number: int,
) -> dict[str, Any]:
    selected: list[str] = []
    seen: set[str] = set()
    for s in normalized_symptoms:
        if s and s not in seen:
            seen.add(s)
            selected.append(s)
    selected_set = set(selected)
    selected_norm = math.sqrt(len(selected_set) or 1)
    disease_sets = [symptom_set_for_disease(d) for d in diseases]
    symptom_to_idxs: dict[str, list[int]] = {}
    for i, ds in enumerate(disease_sets):
        for s in ds:
            symptom_to_idxs.setdefault(s, []).append(i)
    candidate_idx: set[int] = set()
    for s in selected_set:
        for idx in symptom_to_idxs.get(s, []):
            candidate_idx.add(idx)
    if len(candidate_idx) == 0:
        candidate_idx = set(range(len(diseases)))
    scored: list[dict[str, Any]] = []
    for idx in candidate_idx:
        disease = diseases[idx]
        ds = disease_sets[idx] or set()
        dot = sum(1 for s in selected_set if s in ds)
        disease_norm = math.sqrt(len(ds) or 1)
        cosine = 0.0 if dot <= 0 else dot / (selected_norm * disease_norm)
        scored.append(
            {
                "id": disease.get("id"),
                "name": disease.get("name", ""),
                "definition": disease.get("definition", "") or "",
                "specialist": str((disease.get("raw", {}) or {}).get("специалист", "")),
                "scoreRaw": cosine,
                "probability": cosine,
                "cosineScore": cosine,
            }
        )
    total_raw = sum(max(0.0, float(x["scoreRaw"])) for x in scored) or 1.0
    predictions = [
        {
            **x,
            "score": max(0.0, float(x["scoreRaw"])) / total_raw,
        }
        for x in scored
    ]
    predictions.sort(key=lambda x: x["score"], reverse=True)
    predictions = predictions[:6]
    return {
        "profileUsed": {
            "age": None,
            "gender": str((profile or {}).get("gender", "") or ""),
            "region": str((profile or {}).get("region", "") or ""),
        },
        "predictions": predictions,
        "uncertainty": 1.0,
        "needClarification": True,
        "clarifyingSymptoms": [],
        "round": round_number,
        "debug": {"source": "python-cosine-fallback"},
    }
