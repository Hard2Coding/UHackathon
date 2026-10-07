# ScamGraph AI ML pipeline

โมเดลทดลองนี้ฝึกจริงจากข้อมูลสังเคราะห์สำหรับเดโม 400 รายการ ภาษาไทยและอังกฤษ (normal 200 / scam 200) URL ทุกอันอยู่ใต้ `.test` ซึ่งเป็นโดเมนสงวน ข้อมูลนี้ไม่ใช่ประวัติร้องเรียนหรือหลักฐานเกี่ยวกับบุคคลหรือแบรนด์จริง ผลประเมินด้านล่างใช้ตรวจ pipeline บนข้อมูลตัวอย่างเท่านั้น ยังไม่มีข้อมูลรองรับความแม่นยำในโลกจริง

Run commands from the monorepo root after installing its pinned Python dependencies:

```sh
.venv/bin/python -m ml sample --output ml/datasets/sample.jsonl
.venv/bin/python -m ml import your-verified-data.csv --output ml/datasets/imported.jsonl
.venv/bin/python -m ml validate ml/datasets/sample.jsonl
.venv/bin/python -m ml train ml/datasets/sample.jsonl --artifacts ml/artifacts/default
.venv/bin/python -m ml evaluate ml/datasets/sample.jsonl --artifacts ml/artifacts/default
.venv/bin/python -m pytest ml/tests -q
```

The backend uses `ModelService(artifact_dir=None).analyze(text, urls=None)`. `train_pipeline(dataset_path, artifact_dir=None)`, `load_records(path)` and `validate_records(records)` are available in `ml.pipeline` for explicit administrator jobs. No community-report labels are automatically read or used for training. Loading joblib files is restricted to artifacts generated locally by this trusted pipeline; do not load files uploaded by users as model artifacts.

Dataset records require `text` and/or `urls`, `label` (`normal`/`scam`), `campaign_id`, `source`, and `is_sample`. `id` is recommended. CSV accepts `url` or a JSON-array `urls` column; JSON and JSONL accept `urls` arrays. Mark all synthetic rows `is_sample=true`. Training currently requires examples of both classes for both the text and URL models. Importing a dataset does not replace a running model.

Validation normalizes whitespace/case for duplicate-text detection, rejects conflicting text/URL labels, and removes identical normalized input records. Splitting unions shared campaign IDs, conservatively grouped registrable domains, and exact normalized texts into connected components. Components never cross train, validation, or test. The demo has 200 authored campaigns and 150 effective independent components after exact-text grouping. Unknown public suffixes are deliberately over-grouped; this is not a live public-suffix or reputation service. Semantic near-duplicate deduplication and independent external-campaign validation still need curated real data.

Text inference uses TF-IDF character 2–5 grams with Logistic Regression. It excludes URL tokens from text features to avoid counting the same URL twice. URL inference uses XGBoost over the numerical features in `features.py`: length, dots, hyphens, digits, subdomains, IP hosts, punycode, HTTPS, suspicious keywords, entropy, query/path properties, and lexical brand similarity. No URL is opened or fetched. HTTPS and brand spelling are features, never proof that a website is safe or belongs to that brand. Domain age/reputation are explicitly missing until a real data source is configured.

Isolation Forest is fitted only to normal URLs in the training split. `score_samples` and `decision_function` are returned separately from scam classification. Its contamination setting is 0.12 for this demonstration reference population. These raw anomaly scores are not scam probabilities and do not raise the combined risk score by themselves.

The saved classifiers are not calibrated. Their raw output can support a **risk score 0–100**, never a stated percentage chance of fraud. Classification thresholds are selected by validation F1, then precision, then proximity to 0.5; the separate application risk thresholds are high 70 / medium 40 and can be configured by the backend. No classifier output is used as another model's training feature, so this pipeline does not require out-of-fold stacking features. Graph/history evidence is handled separately until independent verified labels support a trained combined model.

SHAP TreeExplainer explains XGBoost's raw binary-logistic margin. Contributions, base values and their sum are in **log-odds**, not percentage points. Inference verifies that the base plus all SHAP contributions reconstructs the model margin. The top displayed contributions are only a subset; `model_explanations.all_contributions_sum` preserves the full sum. Text explanation uses the exact linear decomposition `coefficient × TF-IDF`, also in log-odds, and is explicitly distinguished from SHAP.

For actual semantic retrieval, set `MODEL_EMBEDDINGS_ENABLED=true` and optionally `MODEL_EMBEDDINGS_PATH=ml/artifacts/embedding-model`. The included local model is `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, revision `e8f8c211226b894fcb81acc59f3b34ba3efd5f42`, with 384 dimensions. It is pretrained externally and is not fine-tuned on these examples. Inference loads local files only, and computes cosine similarity to scam examples from the training split only. When disabled/missing/failing, the response labels its fallback **TF-IDF lexical cosine**, never semantic embeddings. Similarity and example labels are context, not confirmation of fraud.

Actual frozen-test results from artifact `sample-v1-6c6c58eff5`:

| Model | Test rows | Validation threshold | Precision | Recall | F1 | PR-AUC (average precision) | Confusion matrix [normal, scam] |
|---|---:|---:|---:|---:|---:|---:|---|
| Text | 90 | 0.71 | 1.0000 | 0.8913 | 0.9425 | 0.9947 | `[[44,0],[5,41]]` |
| URL | 90 | 0.50 | 1.0000 | 0.9348 | 0.9663 | 1.0000 | `[[44,0],[3,43]]` |

These numbers were computed from persisted model artifacts, not invented. Synthetic motifs can occur in multiple campaigns, and this small sample does not establish generalization to new writing styles or real adversaries. Exact split IDs, dataset fingerprint, counts, library versions, validation metrics, training metrics and limitations are saved in `artifacts/default/metadata.json`; `evaluate` recomputes the frozen test and rejects changed dataset fingerprints. Add curated, permissioned, representative Thai/English data and calibration before relying on the score for production decisions.
