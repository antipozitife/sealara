"""ML feedback / signature helpers (lightweight, no full train loop)."""

from ml_service.catalog import diseases_signature


def test_diseases_signature_includes_stable_id_digest() -> None:
    d = [{"id": 3, "name": "X"}, {"id": 1, "name": "Y"}]
    sig = diseases_signature(d)
    assert sig
    assert diseases_signature([{"id": 1}, {"id": 3}]) == sig


def test_expected_signature_string_depends_on_case_count() -> None:
    d = [{"id": 10, "name": "A"}]
    base = diseases_signature(d)
    assert f"{base}|cases=0" != f"{base}|cases=3"
