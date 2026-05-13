"""Concurrent /predict calls against ASGI app (httpx AsyncClient)."""

from __future__ import annotations

import asyncio
import os

import httpx
from httpx import ASGITransport

if not str(os.environ.get("ML_API_KEY", "")).strip():
    os.environ["ML_API_KEY"] = "pytest-ml-api-key"

from app import app, train_cached_models  # noqa: E402

API_HEADERS = {"x-api-key": os.environ["ML_API_KEY"]}

DISEASES_SMALL = [
    {"id": 91001, "name": "C1", "definition": "d", "raw": {"симптомы": "кашель"}},
    {"id": 91002, "name": "C2", "definition": "d", "raw": {"симптомы": "температура"}},
]


def test_many_parallel_predict_requests() -> None:
    async def seed() -> None:
        ev = asyncio.Event()
        await train_cached_models(DISEASES_SMALL, [], bootstrap_done_event=ev)
        await asyncio.wait_for(ev.wait(), timeout=180.0)

    asyncio.run(seed())

    async def main() -> None:
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            body = {
                "symptoms": ["кашель"],
                "profile": {},
                "answers": {},
                "round": 1,
                "confidence_threshold": 0.99,
            }

            async def one() -> int:
                pr = await client.post("/predict", json=body, headers=API_HEADERS)
                return pr.status_code

            codes = await asyncio.gather(*[one() for _ in range(24)])
            assert all(c == 200 for c in codes), codes

    asyncio.run(main())
