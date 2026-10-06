from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest
import joblib

from ml.features import domain_key, extract_features
from ml.inference import DEFAULT_ARTIFACT_DIR, ModelService
from ml.pipeline import connected_groups, deduplicate_records, evaluate_pipeline, load_records, split_records, validate_records

DATASET = Path(__file__).resolve().parents[1] / "datasets" / "sample.jsonl"


def row(identifier, text, label="normal", campaign="a", url="https://example.test/news"):
    return {"id": identifier, "text": text, "label": label, "campaign_id": campaign, "urls": [url], "source": "test fixtures", "is_sample": True}


def test_conflicting_labels_rejected_even_with_different_campaign_and_url():
    rows = [row("a", "Hello team"), row("b", " hello   TEAM ", "scam", "b", "https://different.test")]
    with pytest.raises(ValueError, match="Conflicting labels"):
        validate_records(rows)


def test_duplicate_normalization_removes_same_input():
    original = row("a", "Hello team")
    duplicate = {**original, "id": "b", "text": " Hello  TEAM "}
    unique, removed = deduplicate_records([original, duplicate])
    assert len(unique) == 1 and removed == 1


def test_campaign_and_domain_transitive_components_stay_together():
    rows = [row("a", "first", campaign="campaign-a", url="https://one.test"), row("b", "second", campaign="campaign-a", url="https://two.test"), row("c", "third", campaign="campaign-b", url="https://login.two.test")]
    groups = connected_groups(rows)
    assert len(set(groups)) == 1
    assert domain_key("https://one.bank.co.th/path") == "bank.co.th"


def test_sample_has_balanced_groups_and_no_split_leakage():
    records = load_records(DATASET)
    report = validate_records(records)
    assert report["records"] >= 200
    assert report["connected_groups"] >= 100
    assert report["labels"]["normal"] == report["labels"]["scam"]
    assert all(domain_key(url).endswith(".test") for record in records for url in record["urls"])
    splits = split_records(records)
    groups = connected_groups(records)
    group_sets = {name: {groups[index] for index in indices} for name, indices in splits.items()}
    for left, right in [("train", "validation"), ("train", "test"), ("validation", "test")]:
        assert not group_sets[left] & group_sets[right]


def test_url_features_do_not_treat_https_as_safe():
    https = extract_features("https://paypal-verify-42.test/account/login?confirm=now")
    http = extract_features("http://paypal-verify-42.test/account/login?confirm=now")
    assert https["https"] == 1 and http["https"] == 0
    assert https["suspicious_keyword_count"] >= 3
    assert https["brand_in_host"] == 1
    assert extract_features("https://127.0.0.1/login")["ip_host"] == 1
    assert extract_features("https://xn--name.test")["punycode"] == 1


@pytest.fixture(scope="module")
def model():
    assert (DEFAULT_ARTIFACT_DIR / "models.joblib").is_file(), "Train artifacts before testing inference"
    return ModelService()


def test_real_scores_change_with_inputs_and_are_not_hardcoded(model):
    normal = model.analyze("พรุ่งนี้ประชุมทีมเรื่องการเรียน เวลา 9 โมง หากไม่สะดวกแจ้งเพื่อนได้ครับ", [])
    scam = model.analyze("บัญชีของคุณกำลังถูกระงับ ยืนยันรหัส OTP และรหัสผ่านทันที ก่อนหมดเวลา", ["https://paypal-verify-42.test/account/verify?confirm=now"])
    assert 0 <= normal["text_score"] < scam["text_score"] <= 1
    assert scam["url_score"] is not None
    assert scam["dataset_is_sample"] is True
    assert scam["calibrated"] is False
    assert normal["url_score"] is None
    assert "url_input" in normal["missing_data"]


def test_empty_unknown_and_url_only_inputs_have_truthful_missing_data(model):
    empty = model.analyze("", [])
    assert empty["text_score"] is None and empty["url_score"] is None
    assert empty["anomaly"]["status"] == "not_applicable"
    url_only = model.analyze("https://example.test/news")
    assert url_only["text_score"] is None
    assert url_only["url_score"] is not None
    unknown = model.analyze("🐱🐱🐱", [])
    assert unknown["text_score"] is None


def test_model_unavailable_returns_null_scores(tmp_path):
    unavailable = ModelService(tmp_path).analyze("Please verify password", ["https://example.test"])
    assert unavailable["text_score"] is None and unavailable["url_score"] is None
    assert unavailable["status"]["text_model"] == "unavailable"
    assert "trained_models" in unavailable["missing_data"]


def test_partial_model_failure_preserves_available_text_model(tmp_path, model, monkeypatch):
    monkeypatch.setenv("MODEL_EMBEDDINGS_ENABLED", "false")
    bundle = {**model.bundle, "url_model": None, "anomaly_model": None}
    joblib.dump(bundle, tmp_path / "models.joblib")
    (tmp_path / "metadata.json").write_text(json.dumps(model.metadata))
    partial = ModelService(tmp_path).analyze("Send your password and OTP now", ["https://example.test"])
    assert partial["text_score"] is not None
    assert partial["url_score"] is None
    assert partial["status"]["text_model"] == "ready"
    assert partial["status"]["url_model"] == "unavailable"
    assert partial["anomaly"]["status"] == "unavailable"


def test_shap_uses_raw_log_odds_and_reconstructs_margin(model):
    result = model.analyze("Enter your password and OTP now", ["https://paypal-verify-77.test/account/verify?confirm=now"])
    url_explanation = next(row for row in result["model_explanations"] if row["model"] == "url_xgboost")
    assert url_explanation["additivity_verified"] is True
    assert url_explanation["unit"] == "log_odds"
    margin = url_explanation["base_value"] + url_explanation["all_contributions_sum"]
    assert math.isclose(margin, url_explanation["raw_margin"], abs_tol=1e-4)
    sigmoid = 1 / (1 + math.exp(-margin))
    assert math.isclose(sigmoid, result["url_score"], rel_tol=1e-5)
    assert all(row["unit"] == "log_odds" for row in result["contributions"])
    assert isinstance(result["anomaly"]["raw_score"], float)
    assert "probability" in result["anomaly"]["explanation"]


def test_similarity_fallback_is_explicitly_lexical(monkeypatch):
    monkeypatch.setenv("MODEL_EMBEDDINGS_ENABLED", "false")
    service = ModelService()
    result = service.analyze("Your account will be suspended. Enter password and OTP now")
    assert result["similar_examples"]
    assert all(row["method"] == "tfidf_lexical_cosine" for row in result["similar_examples"])
    assert result["status"]["sentence_embeddings"] == "disabled"
    assert all(row["source"] and row["is_sample"] for row in result["similar_examples"])


def test_optional_embedding_failure_falls_back_truthfully(monkeypatch):
    monkeypatch.setenv("MODEL_EMBEDDINGS_ENABLED", "false")
    service = ModelService()

    class FailedEncoder:
        def encode(self, *args, **kwargs):
            raise TimeoutError("test provider timeout")

    service._sentence_model = FailedEncoder()
    service._embedding_state = "ready"
    result = service.analyze("Enter your password and OTP now")
    assert result["status"]["sentence_embeddings"] == "unavailable"
    assert result["status"]["text_model"] == "ready"
    assert all(row["method"] == "tfidf_lexical_cosine" for row in result["similar_examples"])
    assert "semantic_embeddings" in result["missing_data"]


def test_evaluation_recomputes_frozen_test_metrics(model):
    result = evaluate_pipeline(DATASET)
    for modality in ("text", "url"):
        saved = model.metadata["metrics"][modality]["test"]
        assert result[modality]["confusion_matrix"] == saved["confusion_matrix"]
        assert np.isclose(result[modality]["pr_auc"], saved["pr_auc"])
        assert 0 <= result[modality]["f1"] <= 1
    assert result["dataset_is_sample"] is True


def test_changed_evaluation_dataset_rejected(tmp_path):
    records = load_records(DATASET)
    records[0]["text"] += " changed"
    changed = tmp_path / "changed.json"
    changed.write_text(json.dumps(records, ensure_ascii=False))
    with pytest.raises(ValueError, match="differs from"):
        evaluate_pipeline(changed)


def test_local_multilingual_sentence_embeddings_are_real(monkeypatch):
    path = DEFAULT_ARTIFACT_DIR.parent / "embedding-model"
    if not (path / "model.safetensors").is_file():
        pytest.skip("Optional local embedding model has not been downloaded")
    monkeypatch.setenv("MODEL_EMBEDDINGS_ENABLED", "true")
    monkeypatch.setenv("MODEL_EMBEDDINGS_PATH", str(path))
    service = ModelService()
    assert service._sentence_vectors.shape[1] == 384
    for text in ["ยืนยันรหัสผ่านและ OTP ทันที บัญชีจะถูกระงับ", "Send your password and OTP now to unlock your bank account"]:
        result = service.analyze(text, [])
        assert result["status"]["sentence_embeddings"] == "ready"
        assert result["similar_examples"]
        assert all(row["method"] == "sentence_transformer_cosine" for row in result["similar_examples"])
