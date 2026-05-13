"""Feature engineering and vectorization (vocab, IDF, question vector, model input)."""

from __future__ import annotations

import math
from datetime import date
from typing import Any

from ml_service.normalization import normalize_text, split_pipe_normalized


def prevalence_fraction(raw: dict[str, Any], default: float = 0.01) -> float:
    """Доля 0..1 для приоров в MI; строки «2.5%» и числа (1,100] как проценты."""
    v = raw.get("распространенность")
    if v is None or v == "":
        return default
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        x = float(v)
        if x > 1.0 and x <= 100.0:
            return max(0.0, min(1.0, x / 100.0))
        return max(0.0, min(1.0, x))
    s = str(v).strip().replace(",", ".").lower()
    if not s or s == "-":
        return default
    if s.endswith("%"):
        try:
            x = float(s[:-1])
            return max(0.0, min(1.0, x / 100.0))
        except ValueError:
            return default
    try:
        x = float(s)
    except ValueError:
        return default
    if x > 1.0 and x <= 100.0:
        return max(0.0, min(1.0, x / 100.0))
    return max(0.0, min(1.0, x))


def symptom_set_for_disease(d: dict[str, Any]) -> set[str]:
    raw = d.get("raw", {}) or {}
    return set(split_pipe_normalized(raw.get("симптомы")))


def symptom_cosine(selected: list[str], disease_symptoms: set[str], idf: dict[str, float]) -> float:
    if not selected or not disease_symptoms:
        return 0.0
    dot = sum(idf.get(s, 1.0) for s in selected if s in disease_symptoms)
    s_norm = math.sqrt(sum(idf.get(s, 1.0) for s in selected))
    d_norm = math.sqrt(sum(idf.get(s, 1.0) for s in disease_symptoms))
    if s_norm <= 0 or d_norm <= 0:
        return 0.0
    return max(0.0, min(1.0, dot / (s_norm * d_norm)))


def softmax(scores: list[float], temperature: float = 0.2) -> list[float]:
    if not scores:
        return []
    m = max(scores)
    exps = [math.exp((s - m) / temperature) for s in scores]
    total = sum(exps)
    if total <= 0:
        return [0.0 for _ in scores]
    return [v / total for v in exps]


def age_from_birthdate(birth_date: str | None, reference_date: date | None = None) -> int | None:
    raw = str(birth_date or "").strip()
    if not raw:
        return None
    ref = reference_date or date.today()
    try:
        parts = raw.split("-")
        if len(parts) == 3:
            year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
            born = date(year, month, day)
            age = ref.year - born.year
            if (ref.month, ref.day) < (born.month, born.day):
                age -= 1
            return max(0, min(120, age))
    except Exception:
        return None
    return None


def _reference_date_for_profile(profile: dict[str, Any] | None) -> date:
    p = profile or {}
    raw = str(p.get("evaluationDate") or p.get("evaluation_date") or "").strip()
    if raw:
        try:
            parts = raw.split("-")
            if len(parts) == 3:
                return date(int(parts[0]), int(parts[1]), int(parts[2]))
        except Exception:
            pass
    return date.today()


def question_vector(answers: dict[str, Any]) -> list[float]:
    systems = answers.get("additional_systems", [])
    if isinstance(systems, str):
        systems = [systems]
    systems_set = {normalize_text(x) for x in systems if normalize_text(x)}
    systems_for_flags = systems_set - {"none"}
    vis = answers.get("visible_changes")
    pain = normalize_text(answers.get("pain_character"))
    return [
        1.0 if vis in ("visible", "both") else 0.0,
        1.0 if vis in ("internal", "both") else 0.0,
        1.0 if answers.get("onset") == "sudden" else 0.0,
        1.0 if answers.get("fever") == "high" else 0.0,
        1.0 if answers.get("fever") == "low" else 0.0,
        1.0 if answers.get("pattern") == "episodic" else 0.0,
        1.0 if answers.get("weakness") in ("severe", "mild") else 0.0,
        1.0 if answers.get("triggers") == "yes" else 0.0,
        1.0 if answers.get("dynamics") == "worsening" else 0.0,
        1.0 if answers.get("dynamics") == "improving" else 0.0,
        1.0 if "respiratory" in systems_for_flags else 0.0,
        1.0 if "digestive" in systems_for_flags else 0.0,
        1.0 if "urinary" in systems_for_flags else 0.0,
        1.0 if "joints" in systems_for_flags else 0.0,
        1.0 if "neurological" in systems_for_flags else 0.0,
        1.0 if normalize_text(answers.get("main_complaint")) else 0.0,
        1.0 if pain and pain != "none" else 0.0,
    ]


def build_vocab_and_idf(diseases: list[dict[str, Any]]) -> tuple[list[str], dict[str, float]]:
    docs = []
    all_symptoms: set[str] = set()
    for d in diseases:
        ds = symptom_set_for_disease(d)
        docs.append(ds)
        all_symptoms.update(ds)
    vocab = sorted(list(all_symptoms))
    n_docs = len(docs) or 1
    df: dict[str, int] = {}
    for s in vocab:
        df[s] = sum(1 for doc in docs if s in doc)
    idf = {s: math.log1p((n_docs + 1) / (df[s] + 1)) + 0.5 for s in vocab}
    return vocab, idf


def feature_vector(symptoms: list[str], vocab: list[str], profile: dict[str, Any], answers: dict[str, Any]) -> list[float]:
    symptom_set = set(symptoms)
    v = [1.0 if s in symptom_set else 0.0 for s in vocab]
    gender = normalize_text(profile.get("gender"))
    v.append(1.0 if gender in ("male", "м") else 0.0)
    v.append(1.0 if gender in ("female", "ж") else 0.0)
    ref = _reference_date_for_profile(profile)
    age = age_from_birthdate(profile.get("birthDate"), reference_date=ref)
    age_f = float(age if age is not None else 35)
    v.extend(
        [
            1.0 if 0 <= age_f <= 11 else 0.0,
            1.0 if 12 <= age_f <= 17 else 0.0,
            1.0 if 18 <= age_f <= 35 else 0.0,
            1.0 if 36 <= age_f <= 59 else 0.0,
            1.0 if 60 <= age_f <= 120 else 0.0,
        ]
    )
    v.extend(question_vector(answers))
    return v


def prune_vocab_by_mutual_info(
    diseases: list[dict[str, Any]],
    vocab: list[str],
    max_size: int,
    prior_weight: float = 1.0,
    smoothing: float = 1e-6,
    min_mi: float = 0.0,
) -> list[str]:
    """Select most informative symptoms by mutual information with disease labels."""
    n_classes = len(diseases)
    if n_classes == 0 or len(vocab) <= max_size:
        return vocab[:max_size]

    # Disease priors: prevalence-weighted by default, fallback to uniform.
    priors: list[float] = []
    for d in diseases:
        raw = d.get("raw", {}) or {}
        prevalence = prevalence_fraction(raw, 0.01)
        priors.append(prevalence if prior_weight else 1.0)
    total_prior = sum(priors) or float(n_classes)
    p_d = [p / total_prior for p in priors]

    disease_symptoms = [symptom_set_for_disease(d) for d in diseases]
    mi_scores: dict[str, float] = {}

    for symptom in vocab:
        p_s_given_d: list[float] = []
        for ds in disease_symptoms:
            count = 1.0 if symptom in ds else 0.0
            total = float(len(ds)) if ds else 1.0
            p = (count + smoothing) / (total + smoothing * 2.0)
            p_s_given_d.append(p)

        p_s = sum(p_d[i] * p_s_given_d[i] for i in range(n_classes))
        if p_s <= 0.0 or p_s >= 1.0:
            mi_scores[symptom] = 0.0
            continue

        mi = 0.0
        p_not_s = 1.0 - p_s
        for i in range(n_classes):
            pd = p_d[i]
            p_pos = p_s_given_d[i]
            if p_pos > 0.0:
                mi += pd * p_pos * math.log2(p_pos / p_s)
            p_neg = 1.0 - p_pos
            if p_neg > 0.0 and p_not_s > 0.0:
                mi += pd * p_neg * math.log2(p_neg / p_not_s)
        mi_scores[symptom] = max(0.0, mi)

    filtered = [s for s in vocab if mi_scores.get(s, 0.0) >= min_mi]
    filtered.sort(key=lambda s: mi_scores[s], reverse=True)
    return filtered[:max_size]
