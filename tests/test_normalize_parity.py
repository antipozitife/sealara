"""Parity: Node disease-text helper vs Python normalize_text (no HTTP)."""
import json
import os
import subprocess
from pathlib import Path

import pytest

from ml_service.normalization import normalize_text

ROOT = Path(__file__).resolve().parent.parent
NODE_SNIPPET = (
    "const { normalizeDiseaseText } = require('./server/lib/text-diseases.cjs');"
    "process.stdout.write(JSON.stringify(normalizeDiseaseText(process.env.RAW)));"
)


@pytest.mark.parametrize(
    "raw",
    [
        "  КАШЕЛЬ   сильный ",
        "Боль   в  горле!",
        "Тест   с   лишними пробелами",
    ],
)
def test_node_text_diseases_matches_python_normalize(raw: str) -> None:
    env = {**os.environ, "RAW": raw}
    proc = subprocess.run(
        ["node", "-e", NODE_SNIPPET],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    if proc.returncode != 0:
        pytest.skip("node not available: " + (proc.stderr or proc.stdout or ""))
    node_out = json.loads(proc.stdout.strip())
    assert node_out == normalize_text(raw)
