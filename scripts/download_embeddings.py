"""Download a genuine pinned pretrained multilingual model, never a fake embedding."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

MODEL_ID = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
MODEL_REVISION = "e8f8c211226b894fcb81acc59f3b34ba3efd5f42"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default="ml/artifacts/embedding-model")
    parser.add_argument("--revision", default=MODEL_REVISION, help="Pinned Hugging Face commit revision")
    args = parser.parse_args()
    from sentence_transformers import SentenceTransformer

    revision = args.revision
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    manifest = output / "scamgraph_source.json"
    cached = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else {}
    if cached.get("source") == MODEL_ID and cached.get("revision") == revision and (output / "model.safetensors").is_file():
        model = SentenceTransformer(str(output), device="cpu", local_files_only=True)
        print("Reusing pinned local pretrained model; no network download", flush=True)
    else:
        model = SentenceTransformer(MODEL_ID, revision=revision, device="cpu")
        model.save(str(output))
    vector = model.encode(["ตรวจสอบข้อความภาษาไทย", "Check a message"], normalize_embeddings=True)
    metadata = {"source": MODEL_ID, "revision": revision, "dimensions": int(vector.shape[1]), "kind": "pretrained", "languages_checked": ["th", "en"]}
    (output / "scamgraph_source.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False))


if __name__ == "__main__":
    main()
