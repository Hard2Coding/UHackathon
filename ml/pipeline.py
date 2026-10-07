"""Import, validate, train and evaluate real sample-data classifiers.

No labels from community reports are read here. Explicitly verified source datasets
must be imported by an administrator. The saved split is grouped by connected
campaign/domain/exact-text components, never by individual rows.
"""
from __future__ import annotations

import csv
import hashlib
import json
import os
import platform
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import GroupShuffleSplit
from xgboost import XGBClassifier

from .features import FEATURE_NAMES, domain_key, feature_vector

DEFAULT_ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts" / "default"


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().casefold())


def normalize_record(record: dict[str, Any], index: int = 0) -> dict[str, Any]:
    text = str(record.get("text") or "").strip()
    urls = record.get("urls", record.get("url", []))
    if isinstance(urls, str):
        if urls.strip().startswith("["):
            urls = json.loads(urls)
        else:
            urls = [urls] if urls.strip() else []
    if not isinstance(urls, list) or not all(isinstance(url, str) for url in urls):
        raise ValueError(f"Row {index}: urls must be a list of strings")
    urls = list(dict.fromkeys(url.strip() for url in urls if url.strip()))
    label = str(record.get("label", "")).strip().casefold()
    if label not in {"normal", "scam"}:
        raise ValueError(f"Row {index}: label must be normal or scam")
    if not text and not urls:
        raise ValueError(f"Row {index}: text or urls is required")
    source = str(record.get("source") or "").strip()
    if not source:
        raise ValueError(f"Row {index}: source metadata is required")
    campaign_id = str(record.get("campaign_id") or "").strip()
    if not campaign_id:
        raise ValueError(f"Row {index}: campaign_id is required for leakage-safe splitting")
    for url in urls:
        feature_vector(url)  # URL parsing only, no network I/O.
    sample = record.get("is_sample", False)
    if isinstance(sample, str):
        if sample.lower() not in {"true", "false", "1", "0"}:
            raise ValueError(f"Row {index}: is_sample must be boolean")
        sample = sample.lower() in {"true", "1"}
    if not isinstance(sample, bool):
        raise ValueError(f"Row {index}: is_sample must be boolean")
    identifier = str(record.get("id") or hashlib.sha256((text + "|" + "|".join(urls)).encode()).hexdigest()[:20])
    return {**record, "id": identifier, "text": text, "urls": urls, "label": label, "campaign_id": campaign_id, "source": source, "is_sample": sample}


def load_records(path: str | Path) -> list[dict]:
    path = Path(path)
    if path.suffix.lower() == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as handle:
            records = list(csv.DictReader(handle))
    elif path.suffix.lower() == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        records = data.get("records", []) if isinstance(data, dict) else data
    else:
        records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not isinstance(records, list):
        raise ValueError("Dataset must be an array or JSONL/CSV rows")
    return [normalize_record(record, index + 1) for index, record in enumerate(records)]


def deduplicate_records(records: list[dict]) -> tuple[list[dict], int]:
    seen: dict[tuple, dict] = {}
    text_labels: dict[str, str] = {}
    url_labels: dict[str, str] = {}
    ids: set[str] = set()
    unique = []
    duplicates = 0
    for index, raw in enumerate(records):
        record = normalize_record(raw, index + 1)
        text = normalize_text(record["text"])
        if text and text in text_labels and text_labels[text] != record["label"]:
            raise ValueError(f"Conflicting labels for duplicate text at row {index + 1}")
        if text:
            text_labels[text] = record["label"]
        for url in record["urls"]:
            key = url.rstrip("/")
            if key in url_labels and url_labels[key] != record["label"]:
                raise ValueError(f"Conflicting labels for duplicate URL at row {index + 1}")
            url_labels[key] = record["label"]
        key = (text, tuple(sorted(url.rstrip("/") for url in record["urls"])))
        if key in seen:
            if seen[key]["label"] != record["label"]:
                raise ValueError(f"Conflicting labels for duplicate row at row {index + 1}")
            duplicates += 1
            continue
        if record["id"] in ids:
            raise ValueError(f"Duplicate id with different content: {record['id']}")
        ids.add(record["id"])
        seen[key] = record
        unique.append(record)
    return unique, duplicates


def connected_groups(records: list[dict]) -> list[str]:
    parent = list(range(len(records)))

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(left, right):
        parent[find(right)] = find(left)

    keys: dict[tuple[str, str], int] = {}
    for index, record in enumerate(records):
        identities = [("campaign", record["campaign_id"])]
        if normalize_text(record["text"]):
            identities.append(("exact_text", normalize_text(record["text"])))
        identities.extend(("domain", domain_key(url)) for url in record["urls"] if domain_key(url))
        for key in identities:
            if key in keys:
                union(index, keys[key])
            else:
                keys[key] = index
    return [f"group-{find(index)}" for index in range(len(records))]


def validate_records(records: list[dict]) -> dict:
    unique, duplicates = deduplicate_records(records)
    if not unique:
        raise ValueError("Dataset is empty")
    groups = connected_groups(unique)
    labels = {label: sum(row["label"] == label for row in unique) for label in ("normal", "scam")}
    if not all(labels.values()):
        raise ValueError("Dataset must contain both normal and scam labels")
    return {"valid": True, "records": len(unique), "duplicates_removed": duplicates, "labels": labels, "connected_groups": len(set(groups)), "sources": sorted({row["source"] for row in unique}), "dataset_is_sample": all(row["is_sample"] for row in unique), "sample_records": sum(row["is_sample"] for row in unique), "domain_grouping": "campaign + conservative registrable-domain + normalized exact-text connected components"}


def fingerprint(records: list[dict]) -> str:
    canonical = json.dumps(records, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def split_records(records: list[dict], random_state: int = 2026) -> dict[str, list[int]]:
    groups = np.asarray(connected_groups(records))
    labels = np.asarray([row["label"] == "scam" for row in records], dtype=int)
    if len(set(groups)) < 10:
        raise ValueError("At least 10 independent campaign/domain/text groups are required")
    indices = np.arange(len(records))
    best = None
    best_error = float("inf")
    # GroupShuffleSplit preserves connected groups. Select a deterministic seed
    # with both labels in every split and approximately balanced prevalence.
    for seed in range(random_state, random_state + 100):
        train_val, test = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=seed).split(indices, labels, groups))
        train_rel, val_rel = next(GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=seed + 101).split(train_val, labels[train_val], groups[train_val]))
        train, val = train_val[train_rel], train_val[val_rel]
        splits = {"train": train, "validation": val, "test": test}
        if any(len(set(labels[subset])) != 2 for subset in splits.values()):
            continue
        error = sum(abs(float(labels[subset].mean()) - float(labels.mean())) for subset in splits.values())
        if error < best_error:
            best_error = error
            best = splits
        if error < 0.01:
            break
    if best is None:
        raise ValueError("Could not form grouped train/validation/test splits with both labels")
    group_sets = [set(groups[subset]) for subset in best.values()]
    assert all(not group_sets[left] & group_sets[right] for left in range(3) for right in range(left + 1, 3))
    return {name: indices.tolist() for name, indices in best.items()}


def choose_threshold(labels: np.ndarray, scores: np.ndarray) -> float:
    candidates = np.unique(np.concatenate(([0.5], scores, np.linspace(0.1, 0.9, 81))))
    # Maximize validation F1; break ties by precision, then distance to 0.5.
    # A wide equally-performing interval should not select an extreme boundary.
    return float(max(candidates, key=lambda threshold: (f1_score(labels, scores >= threshold, zero_division=0), precision_score(labels, scores >= threshold, zero_division=0), -abs(threshold - 0.5))))


def metrics_at(labels: np.ndarray, scores: np.ndarray, threshold: float) -> dict:
    predicted = scores >= threshold
    return {"count": int(len(labels)), "threshold": float(threshold), "precision": float(precision_score(labels, predicted, zero_division=0)), "recall": float(recall_score(labels, predicted, zero_division=0)), "f1": float(f1_score(labels, predicted, zero_division=0)), "pr_auc": float(average_precision_score(labels, scores)), "pr_auc_method": "average_precision (non-interpolated precision-recall area)", "confusion_matrix": confusion_matrix(labels, predicted, labels=[0, 1]).tolist(), "confusion_matrix_labels": ["normal", "scam"]}


def url_arrays(records: list[dict], indices: list[int]) -> tuple[np.ndarray, np.ndarray]:
    values, labels = [], []
    for index in indices:
        for url in records[index]["urls"]:
            values.append(feature_vector(url))
            labels.append(int(records[index]["label"] == "scam"))
    return np.asarray(values, dtype=float), np.asarray(labels, dtype=int)


def text_arrays(records: list[dict], indices: list[int]) -> tuple[list[str], np.ndarray]:
    subset = [records[index] for index in indices if records[index]["text"].strip()]
    return [row["text"] for row in subset], np.asarray([int(row["label"] == "scam") for row in subset], dtype=int)


def train_pipeline(dataset_path: str | Path, artifact_dir: str | Path | None = None) -> dict:
    records, _ = deduplicate_records(load_records(dataset_path))
    validation = validate_records(records)
    splits = split_records(records)
    output = Path(artifact_dir or DEFAULT_ARTIFACT_DIR)
    output.mkdir(parents=True, exist_ok=True)
    text_train, y_text_train = text_arrays(records, splits["train"])
    url_train, y_url_train = url_arrays(records, splits["train"])
    if len(set(y_text_train)) != 2 or len(set(y_url_train)) != 2:
        raise ValueError("Training requires normal/scam examples for both text and URL models")
    vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(2, 5), min_df=2, max_features=30000, sublinear_tf=True, strip_accents=None)
    x_text_train = vectorizer.fit_transform(text_train)
    text_model = LogisticRegression(C=3, max_iter=2000, class_weight="balanced", random_state=2026)
    text_model.fit(x_text_train, y_text_train)
    url_model = XGBClassifier(n_estimators=120, max_depth=3, learning_rate=0.06, min_child_weight=2, reg_lambda=2, subsample=0.9, colsample_bytree=0.9, eval_metric="logloss", random_state=2026, n_jobs=2, tree_method="hist")
    url_model.fit(url_train, y_url_train)
    normal_urls = url_train[y_url_train == 0]
    anomaly_model = IsolationForest(n_estimators=160, contamination=0.12, random_state=2026, n_jobs=2)
    anomaly_model.fit(normal_urls)
    text_val, y_text_val = text_arrays(records, splits["validation"])
    url_val, y_url_val = url_arrays(records, splits["validation"])
    if len(set(y_text_val)) != 2 or len(set(y_url_val)) != 2:
        raise ValueError("Validation requires both labels for each model")
    text_val_scores = text_model.predict_proba(vectorizer.transform(text_val))[:, 1]
    url_val_scores = url_model.predict_proba(url_val)[:, 1]
    text_threshold = choose_threshold(y_text_val, text_val_scores)
    url_threshold = choose_threshold(y_url_val, url_val_scores)
    metrics = {"text": {}, "url": {}}
    for name, indices in splits.items():
        text, y_text = text_arrays(records, indices)
        urls, y_url = url_arrays(records, indices)
        metrics["text"][name] = metrics_at(y_text, text_model.predict_proba(vectorizer.transform(text))[:, 1], text_threshold)
        metrics["url"][name] = metrics_at(y_url, url_model.predict_proba(urls)[:, 1], url_threshold)
    version = f"sample-v1-{fingerprint(records)[:10]}" if validation["dataset_is_sample"] else f"trained-v1-{fingerprint(records)[:10]}"
    reference_examples = [{"text": records[index]["text"], "source": records[index]["source"], "is_sample": records[index]["is_sample"]} for index in splits["train"] if records[index]["label"] == "scam" and records[index]["text"]]
    bundle = {"version": version, "vectorizer": vectorizer, "text_model": text_model, "url_model": url_model, "anomaly_model": anomaly_model, "feature_names": FEATURE_NAMES, "reference_examples": reference_examples, "reference_vectors": vectorizer.transform([row["text"] for row in reference_examples])}
    import sklearn
    import xgboost
    metadata = {"version": version, "trained_at": datetime.now(timezone.utc).isoformat(), "dataset_fingerprint": fingerprint(records), "dataset": validation, "dataset_is_sample": validation["dataset_is_sample"], "calibrated": False, "score_label": "risk score; not calibrated probability", "threshold_selection": "validation F1, then precision, then nearest threshold to 0.5", "classification_thresholds": {"text": text_threshold, "url": url_threshold}, "risk_thresholds": {"high": 70, "medium": 40}, "metrics": metrics, "splits": {name: [records[index]["id"] for index in indices] for name, indices in splits.items()}, "split_counts": {name: len(indices) for name, indices in splits.items()}, "split_group_counts": {name: len({connected_groups(records)[index] for index in indices}) for name, indices in splits.items()}, "anomaly": {"model": "IsolationForest", "reference": "normal URL features from training split only", "reference_count": len(normal_urls), "contamination": 0.12, "score_unit": "raw isolation score (not scam probability)"}, "models": {"text": "TF-IDF character 2–5 grams + LogisticRegression", "url": "XGBoost binary logistic", "similarity_default": "TF-IDF lexical cosine; optional local SentenceTransformer"}, "versions": {"python": platform.python_version(), "scikit-learn": sklearn.__version__, "xgboost": xgboost.__version__}, "limitations": ["Synthetic demonstration data is not representative of real-world scams; test metrics describe this sample dataset only.", "No calibration study, domain age, external reputation or production accuracy claim.", "Reference similarity is supporting context, not confirmation of a scam.", "No graph/history model is trained because independent verified labeled evidence is unavailable.", "Unverified community reports never automatically retrain these models."]}
    temporary_model = output / f".models-{uuid4().hex}.joblib"
    temporary_metadata = output / f".metadata-{uuid4().hex}.json"
    try:
        joblib.dump(bundle, temporary_model, compress=3)
        temporary_metadata.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temporary_model, output / "models.joblib")
        os.replace(temporary_metadata, output / "metadata.json")
    finally:
        temporary_model.unlink(missing_ok=True)
        temporary_metadata.unlink(missing_ok=True)
    return metadata


def evaluate_pipeline(dataset_path: str | Path, artifact_dir: str | Path | None = None) -> dict:
    output = Path(artifact_dir or DEFAULT_ARTIFACT_DIR)
    metadata = json.loads((output / "metadata.json").read_text(encoding="utf-8"))
    records, _ = deduplicate_records(load_records(dataset_path))
    if fingerprint(records) != metadata["dataset_fingerprint"]:
        raise ValueError("Evaluation dataset differs from the frozen training dataset. Train a new artifact version first.")
    bundle = joblib.load(output / "models.joblib")
    id_to_index = {record["id"]: index for index, record in enumerate(records)}
    test_indices = [id_to_index[identifier] for identifier in metadata["splits"]["test"]]
    text, y_text = text_arrays(records, test_indices)
    urls, y_url = url_arrays(records, test_indices)
    result = {"version": metadata["version"], "split": "frozen_test", "dataset_is_sample": metadata["dataset_is_sample"], "calibrated": False, "text": metrics_at(y_text, bundle["text_model"].predict_proba(bundle["vectorizer"].transform(text))[:, 1], metadata["classification_thresholds"]["text"]), "url": metrics_at(y_url, bundle["url_model"].predict_proba(urls)[:, 1], metadata["classification_thresholds"]["url"])}
    (output / "evaluation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result
