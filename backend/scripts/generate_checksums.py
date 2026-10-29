"""Record the SHA-256 of every model file in model_checksums.json.

Run this ONCE, on a machine you trust, right after (re)training or copying the
models, then commit model_checksums.json. The server compares against it on
every start-up.

    python scripts/generate_checksums.py
"""
import hashlib
import json
from pathlib import Path

backend = Path(__file__).resolve().parent.parent
models_dir = backend / "Models"

checksums = {
    path.name: hashlib.sha256(path.read_bytes()).hexdigest()
    for path in sorted(models_dir.glob("*.pkl"))
}
if not checksums:
    raise SystemExit(f"No .pkl files found in {models_dir}")

(backend / "model_checksums.json").write_text(json.dumps(checksums, indent=2) + "\n", encoding="utf-8")
for name, digest in checksums.items():
    print(f"{digest}  {name}")
print("Wrote model_checksums.json")
