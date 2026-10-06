from __future__ import annotations

import argparse
import json
from pathlib import Path

from .pipeline import DEFAULT_ARTIFACT_DIR, deduplicate_records, evaluate_pipeline, load_records, train_pipeline, validate_records
from .sample_data import generate_sample


def main():
    parser = argparse.ArgumentParser(description="ScamGraph AI reproducible ML pipeline; sample data is not production accuracy evidence")
    commands = parser.add_subparsers(dest="command", required=True)
    sample = commands.add_parser("sample", help="Generate reserved-domain synthetic Thai/English examples")
    sample.add_argument("--output", default="ml/datasets/sample.jsonl")
    sample.add_argument("--campaigns", type=int, default=200)
    ingest = commands.add_parser("import", help="Validate and normalize explicit CSV/JSON/JSONL dataset")
    ingest.add_argument("input")
    ingest.add_argument("--output", required=True)
    validate = commands.add_parser("validate")
    validate.add_argument("dataset")
    train = commands.add_parser("train")
    train.add_argument("dataset")
    train.add_argument("--artifacts", default=str(DEFAULT_ARTIFACT_DIR))
    evaluate = commands.add_parser("evaluate")
    evaluate.add_argument("dataset")
    evaluate.add_argument("--artifacts", default=str(DEFAULT_ARTIFACT_DIR))
    args = parser.parse_args()
    if args.command == "sample":
        rows = generate_sample(args.output, args.campaigns)
        result = validate_records(rows)
    elif args.command == "import":
        rows = load_records(args.input)
        result = validate_records(rows)
        rows, _ = deduplicate_records(rows)
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n", encoding="utf-8")
    elif args.command == "validate":
        result = validate_records(load_records(args.dataset))
    elif args.command == "train":
        result = train_pipeline(args.dataset, args.artifacts)
    else:
        result = evaluate_pipeline(args.dataset, args.artifacts)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
