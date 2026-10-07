# ScamGraph AI

**Predict Before It Gets Reported** — a Thai/English hackathon app that assesses the risk of messages, links, images, QR codes, and identifiers, with explanations grounded in the available evidence.

This monorepo connects Expo/React Native, FastAPI, a database, and trained machine-learning models. Scores come from model-artifact inference combined with a history-based policy disclosed in each result; example results are not hardcoded. The included training data and graph records are **synthetic demonstration data**, not real fraud reports.

Scores from 0–100 are not calibrated and do not represent the probability of fraud. “No history found” does not mean safe. Graph connections and text similarity do not establish that a person committed fraud.

The branding follows the supplied `ScamGraph AI.png` reference: an S symbol, network nodes, and a shield/check, with a purple–blue–cyan gradient and light/dark variants. The logo is a reference-derived raster interpretation generated with ImageGen, rather than a pixel crop or the original vector artwork. The interface uses pale blue/white and blue–purple accents, with midnight navy in dark mode and semantic risk colors. Masters, exports, and prompts are documented in `app/assets/BRAND.md`.

## Current UI and Webapp

The interface follows the supplied mobile and desktop references. The opening screen contains the logo and Google, LINE, email login, and registration options. The Dashboard has four scan categories, bottom navigation on mobile, and a left sidebar on desktop. The light theme uses white/light blue with blue–purple gradient buttons; dark mode and Thai/English language switching are available. Entrance effects finish quickly and respect the operating system's reduced-motion preference. Buttons have hover/focus glow while login choices remain visible.

Dashboard totals and the seven-day chart use up to 300 saved records from the current user's history. The alerts page opens saved HIGH-risk results, and the help center provides searchable FAQs. The Webapp includes a manifest, icons, and a service worker for supported browsers. Updates wait for user confirmation before reloading. Only public app assets are cached; API responses, analysis results, and uploaded images are not cached. Analysis and private account data require an online connection.

Google Cloud and LINE projects have not been configured, so real provider login is not activated. Read the [activation guide](ACTIVATION.md), [Webapp guide](WEBAPP.md), [function status](FUNCTION_STATUS.md), and [verification results](QA_RESULTS.md) before enabling services for real users.

## Shared App + Web Source and Updates

The primary repository is `Hard2Coding/UHackathon`, on branch `DevTutor`. Mobile and web share `app/App.tsx`, `app/src`, and `shared`; the API and models live in `backend` and `ml`. Screens do not need to be copied between separate projects.

After installing dependencies, run `npm run dev` from the repository root. It starts API reload and one Expo Metro server for web and native development clients. Both platforms consume the shared source. `npm run ios` and `npm run android` build/install the native app using the running Metro server. See [DEVELOPMENT.md](DEVELOPMENT.md) for LAN addresses and port configuration.

The web build supports Vercel: import the repository at its root and set `EXPO_PUBLIC_API_URL` to a real HTTPS backend. See [VERCEL.md](VERCEL.md). Once Git integration is configured, Vercel builds/deploys the tracked branch according to the project settings. GitHub Actions checks and exports web/Android/iOS artifacts from the same Git SHA. OTA updates for installed mobile apps require an Expo project, update configuration, and a compatible native runtime first; see [RELEASES.md](RELEASES.md). Vercel deployment and mobile OTA publishing have not been activated in this delivery.

## Repository Layout

```text
app/                         Expo + React Native + TypeScript for web and Android/iOS
backend/app/                 FastAPI, auth, history, reports, graph, media, admin, jobs
backend/migrations/          Alembic database migrations
backend/tests/               API/security/integration tests
ml/                          Data import/validation/training/evaluation and inference
ml/datasets/                 Synthetic datasets explicitly marked as samples
ml/artifacts/default/        Trained models, metadata, and evaluation results
ml/artifacts/embedding-model/ Pretrained multilingual model; downloaded separately
shared/                      OpenAPI snapshot and API contract semantics
demo-assets/                 Safe OCR, QR, blank-image, and CSV demonstration assets
scripts/                     Setup, local demo, verification, and ZIP packaging
```

Python dependency pins are defined in `requirements.in`. The complete resolved dependency set installed on Python 3.12/macOS ARM64 is recorded in `requirements.lock`, with platform markers for macOS OCR and Linux x86_64 CPU XGBoost. Frontend installation uses `app/package-lock.json` with `npm ci`.

## Run the Local Demo

Requirements: Python **3.12**, Node.js **22 LTS or newer**, and npm. The verification machine used Node 24.18.0/npm 11.16.0. Initial setup requires internet access to install dependencies and download approximately 449 MB of pretrained SentenceTransformer weights. On macOS ARM64, it also downloads approximately 186 MB of portable OCR dependencies. No API key is required for the core demo.

From the repository root, create `.env` from the example if it does not already exist, then bootstrap:

```bash
cp .env.example .env
bash scripts/bootstrap.sh
```

If Python 3.12 is installed elsewhere, set `PYTHON_BIN=/absolute/path/python3.12` before running bootstrap. To skip the SentenceTransformer download, use `DOWNLOAD_EMBEDDINGS=0 bash scripts/bootstrap.sh`; baseline analysis remains available, and similarity is labeled as a lexical fallback. Use `INSTALL_LOCAL_OCR=0` to skip portable OCR on macOS and install it later with `.venv/bin/python scripts/install_local_ocr.py`.

For shared mobile/web development, use `npm run dev` as described above. The two-terminal demo can also be started separately.

Terminal 1:

```bash
bash scripts/local_demo.sh
```

This command explicitly selects **SQLite for the local demo** at `.runtime/scamgraph-demo.db`, runs migrations/seed, and starts the API at `http://localhost:8000`. API documentation is available at `http://localhost:8000/docs`. If model artifacts are missing, the sample dataset is trained before the server starts.

Terminal 2:

```bash
source scripts/env.sh
cd app
npm run web -- --port 8081
```

Open `http://localhost:8081`. The Webapp calls the real local API on port 8000. Browser camera access requires localhost or HTTPS, and permission is requested only when the user selects a camera feature.

Development seed accounts:

| Role | Email | Password |
|---|---|---|
| User | `demo@scamgraph.demo` | `DemoUser!2026` |
| Admin | `admin@scamgraph.demo` | `DemoAdmin!2026` |

Guests can analyze content without registering. Saving history, batch jobs, and submitting reports require a user account.

For a physical phone, set `EXPO_PUBLIC_API_URL=http://<API-computer-LAN-IP>:8000/api` before starting the development server. An Android emulator can use `http://10.0.2.2:8000/api`; localhost on a phone refers to the phone itself. Caller identification and the app's OAuth deep link require a development/production build containing the native module and app URL scheme. Expo Go and web show incoming-call protection as unavailable. Native source is included, but installation on physical Android/iOS devices has not been verified in this delivery. Because the runner honors `EXPO_PUBLIC_API_URL` from `.env`, override its localhost value explicitly when testing on a physical phone; changing `DEV_HOST` alone does not replace that configured API URL.

## PostgreSQL + Docker Compose

The intended deployment path uses **PostgreSQL 16**, Alembic migrations, Thai/English Tesseract, the API, and a built Webapp. The `.env` copy command below is for first-time setup only; skip it if `.env` already exists:

```bash
cp .env.example .env
docker compose build
docker compose run --rm backend python scripts/download_embeddings.py
docker compose up -d
docker compose logs -f backend
```

Keep an existing `.env` and update its required fields instead of overwriting it. Open the web interface at `http://localhost:8080` and API documentation at `http://localhost:8000/docs`. Nginx forwards `/api/` to the backend. Use `docker compose down` to stop the services; the database volume is retained.

If the embedding download is skipped, text/URL/anomaly models still use the included artifacts, but sentence embeddings are unavailable and the API reports that state. `.env` is not copied into images or included in the source ZIP. Do not commit API keys to Git.

**Verified scope:** Compose YAML, service references, build paths, and shell scripts were checked. Container builds and live PostgreSQL integration were not verified because a working Docker/PostgreSQL runtime was unavailable during those checks. A previous attempt to run project-local PostgreSQL binaries was blocked by a sandbox shared-memory syscall restriction (`shmget`). SQLite was used for the executable local-demo flows.

Before production use, set `APP_ENV=production` and `ENABLE_DEMO_SEED=false`, use your own credentials, provision a trusted administrator, and configure HTTPS, backups, secret management, background jobs, and rate limiting suitable for multiple workers. The demo does not provision production infrastructure automatically.

## Five-to-Seven-Minute Hackathon Demo

1. Start at the login screen and choose a demo email account or Guest. Google/LINE show “not configured” when credentials are absent. Compare a normal message with an urgent OTP-request example, then open the risk factors and technical details to inspect the model version and SHAP units.
2. Paste `https://bank-verify-demo.test/confirm`. Show that HTTPS does not establish safety and that live domain-age/external-reputation data is unavailable.
3. Upload `demo-assets/screenshot-thai-demo.png` or `screenshot-demo.png`. Review/edit the OCR text before analysis. Use `blank.png` to demonstrate an unreadable image.
4. Upload `demo-assets/qr-demo.png` and inspect its payload before analysis. The app does not open links or make transactions automatically. Use a blank image to demonstrate “QR not found.”
5. Analyze `https://reward-support.example/claim` and open the graph. The graph must display SAMPLE labels. Inspect node/edge provenance and timestamps; a connection is not an allegation.
6. Sign in to the demo account, save a result, search/filter history, share/export a masked report, and submit a new clue. Its pending status does not confirm an entity as fraudulent.
7. Import `demo-assets/batch-demo.csv` and follow the job and per-row results. Sign in as Admin to inspect usage statistics, moderate reports with reasons, and view model metrics, training jobs, and configuration.

Demo URLs use reserved `.test`/`.example` domains rather than real malicious links. Seeded graph/source records are fictional demonstration data and use placeholders rather than real people.

## Train and Evaluate Models

From the monorepo root:

```bash
source scripts/env.sh
.venv/bin/python -m ml sample --output ml/datasets/sample.jsonl
.venv/bin/python -m ml validate ml/datasets/sample.jsonl
.venv/bin/python -m ml train ml/datasets/sample.jsonl --artifacts ml/artifacts/default
.venv/bin/python -m ml evaluate ml/datasets/sample.jsonl --artifacts ml/artifacts/default
```

`env.sh` configures the macOS OpenMP library path from the installed PyTorch package and keeps Expo/npm caches under the project's `.runtime` directory (`__UNSAFE_EXPO_HOME_DIRECTORY`, `NPM_CONFIG_CACHE`, `EXPO_NO_TELEMETRY=1`). Running this demo does not require editing system files or placing those caches in the home directory.

Real-data import supports CSV/JSON/JSONL. Records must contain `label` (`normal`/`scam`), `source`, `campaign_id`, and `text` or `urls` (a list, or a URL string in CSV). Set `is_sample=false` only for data you are authorized to use and whose labels have been verified:

```bash
.venv/bin/python -m ml import /path/to/verified.csv --output ml/datasets/verified.jsonl
.venv/bin/python -m ml validate ml/datasets/verified.jsonl
.venv/bin/python -m ml train ml/datasets/verified.jsonl --artifacts ml/artifacts/verified-v1
.venv/bin/python -m ml evaluate ml/datasets/verified.jsonl --artifacts ml/artifacts/verified-v1
```

Example record:

```json
{"id":"source-row-001","text":"A message with a verified label","urls":[],"label":"normal","campaign_id":"campaign-001","source":"Source name and usage rights","is_sample":false}
```

The pipeline deduplicates records, rejects conflicting labels, and groups connected campaigns/domains/exact texts before splitting into train/validation/test sets. Classifier thresholds are selected on validation, and the test split is held out. Models do not use other classifiers' outputs as stacked training features, so those features do not require out-of-fold generation. Unverified community reports are not added to retraining automatically.

The included `sample-v1-6c6c58eff5` artifacts were trained on 400 sample records (200 normal/200 scam) across 150 connected groups: 230 training, 80 validation, and 90 test records. Results are recorded in `ml/artifacts/default/evaluation.json` and `metadata.json`, including precision, recall, F1, PR-AUC, and a confusion matrix. High metrics on this simple synthetic dataset do not establish real-world fraud-detection accuracy; it is not representative of production traffic.

Models in use:

- **Text:** character 2–5-gram TF-IDF + Logistic Regression for Thai/English.
- **URL:** XGBoost on features derived from the URL without visiting it. Tree SHAP contributions use raw model-margin/log-odds units.
- **Anomaly:** Isolation Forest fitted only to normal training URL features; its score is displayed separately from scam risk.
- **Similarity:** pretrained multilingual MiniLM SentenceTransformer embeddings with 384 dimensions when weights are available, otherwise an explicitly labeled lexical-cosine fallback.
- **Connections:** NetworkX with database source/edge records; no graph classifier trained on real-world data is included.

Fusion takes the maximum text/URL model score multiplied by 100 to avoid counting the same signal repeatedly. A separate **history policy, not an ML prediction**, applies score floors only to non-sample evidence: confirmed source 85, moderator-reviewed community source 65, and reported source 50. Each result identifies the evidence type and policy used. Graph, anomaly, and similarity results do not increase the score as a fraud probability.

SentenceTransformer is pinned to revision `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` of `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`. Large pretrained weights are excluded from the ZIP. Run `.venv/bin/python scripts/download_embeddings.py` to download the verified revision with the project environment. Its source/revision metadata is stored in `scamgraph_source.json` inside the model directory.

## Providers and External Data

### Google and LINE Login

`.env.example` contains configuration placeholders; real providers are not activated. Store client/channel credentials **only in the backend `.env` or a secrets manager**. Do not send secrets in chat or use `EXPO_PUBLIC_*` for client secrets/channel tokens. If `.env` already exists, add the new fields while preserving your existing values.

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google OAuth Web client and backend callback |
| `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET`, `LINE_REDIRECT_URI` | LINE Login channel and backend callback |
| `OAUTH_REDIRECT_ALLOWLIST` | Exact-match allowlist of app/web return URLs |
| `OAUTH_HTTP_TIMEOUT_SECONDS` | Provider HTTP timeout; default 5 seconds |

For Google, create a project and configure the audience/consent screen in Google Auth Platform, then create a **Web application** OAuth client. Register the exact URI from `GOOGLE_REDIRECT_URI`, such as `https://api.your-domain.example/api/auth/oauth/google/callback`, including the scheme, path, and trailing-slash behavior. Keep the secret on the backend, use account-information scopes only, and configure test users as required by the project's status. See the [Google web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).

For LINE, create a web-app LINE Login channel under your provider. Register `https://api.your-domain.example/api/auth/oauth/line/callback` to match `LINE_REDIRECT_URI`, and store the channel ID/secret on the backend. The `openid` scope identifies the user; requesting `email` requires the channel's email permission. A missing email does not authorize linking another account by display name. See the [LINE Login guide](https://developers.line.biz/en/docs/line-login/integrate-line-login/).

Provider callbacks and app return URLs serve different purposes. Provider callbacks are the registered backend HTTPS endpoints above. `http://localhost:8081/` and `scamgraph://oauth` in the allowlist are destinations **after the backend verifies the callback**. Do not register `scamgraph://oauth` as a Google Web-client redirect; Google does not support the older Android native custom-scheme OAuth flow. See [Google native-app redirect limitations](https://developers.google.com/identity/protocols/oauth2/native-app).

Login uses the system browser, state/nonce/PKCE, and a one-time handoff exchange. Missing credentials produce a “not configured” state; the app does not fabricate Google/LINE accounts. Restart the API after changing `.env`. Native builds must contain the `scamgraph` URL scheme for app deep links to work.

### LINE Messaging API Notifications

LINE Login and Messaging API use separate channels. Create a LINE Official Account in [Official Account Manager](https://manager.line.biz/) and enable Messaging API to create its channel. Messaging API channels are no longer created through the Developers Console's Create channel button. See the [LINE Messaging API setup guide](https://developers.line.biz/en/docs/messaging-api/getting-started/).

Choose the same provider as LINE Login. Configure `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_CHANNEL_SECRET` from the Messaging API channel on the backend only. Set `LINE_MESSAGING_SAME_PROVIDER=true` after confirming that both channels are under the same provider. User IDs match only within the same provider; they are not the LINE ID typed by a user. See [LINE user IDs](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/).

Set the webhook to a publicly reachable endpoint such as `https://api.your-domain.example/api/notifications/line/webhook`, enable Use webhook, and run Verify in the console. The backend verifies `x-line-signature` against the raw request body using the Messaging API channel secret before reading events; the body must not be modified first. See [webhook signature verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/).

A user must link their own LINE account, add the Official Account as a friend, and explicitly enable notifications in the app. The service then sends alerts only for HIGH-risk results the user chooses to save. `LINE_OFFICIAL_ACCOUNT_ID` supplies the add-friend link. Login alone is not notification consent. Messages contain the score, level, timestamp, and limitations, without the original input, URL, or identifier. Missing credentials prevent real messages from being sent. Check the Official Account's quota and sending permissions before activation; provider acceptance does not prove delivery or that a recipient read the message. See the [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/#send-push-message).

Real Google/LINE consent flows and messages to real LINE users have not been tested with live credentials in this environment. Mock-provider checks are contract/security tests, not verified external integrations.

### Native Incoming-Call Identification

`app/modules/scamgraph-caller` and `app/plugins/withScamGraphCaller.js` cache non-sample phone records with reviewed evidence. Demo data never enters the caller cache. An absent or expired record does not establish safety. Lookup results without sufficient evidence are inconclusive; iOS identification labels only numbers loaded in its directory. Calls are not blocked automatically. The verified caller directory currently contains **0 real records**; sample or pending records are excluded.

`CALLER_DIRECTORY_TTL_HOURS` defaults to 6 hours and `CALLER_DIRECTORY_MAX_AGE_DAYS` to 90 days, limiting cache/evidence freshness. The app refreshes only while the user has enabled the feature and clears the cache when it is disabled. Experimental text/URL models do not provide a caller-identification accuracy percentage.

On iOS, expiry is checked when the extension reloads its directory. Previously loaded OS labels may remain until a reload/refresh when the user returns to the app. TTL is not a guarantee that iOS removes a label immediately at expiry. Labels include the source and date to expose the evidence's age.

| Platform | Supported behavior |
|---|---|
| Android 10+ | The user enables `ROLE_CALL_SCREENING`. The service immediately allows the call, then looks up the offline cache and notifies based on available evidence. Android 13+ requires separate notification permission. |
| iOS | A Call Directory `.appex` extension and App Group identify reviewed E.164 numbers. The user enables the extension in Settings; JavaScript does not receive live incoming-call events or phone numbers. |
| Web / Expo Go | Unavailable. Calls are not intercepted, and the UI does not claim that protection is enabled. |

Android code does not request READ_CALL_LOG/READ_PHONE_STATE/READ_CONTACTS/overlay access and does not read call history or conversations. The OS may withhold some call types/hidden numbers from the service, so coverage is not universal. See [Android CallScreeningService](https://developer.android.com/reference/android/telecom/CallScreeningService). iOS follows Call Directory restrictions and does not create React Native incoming-call popups; see [Apple caller identification](https://developer.apple.com/documentation/callkit/identifying-and-blocking-calls).

Install Android Studio/SDK/JDK for Android, or Xcode/CocoaPods for iOS, then build the app with the native module. With the shared `npm run dev` server running, use `npm run android -- --device` or `npm run ios -- --device` from the root; these commands avoid starting a second Metro server. The following standalone alternative starts its own bundler:

```bash
source scripts/env.sh
cd app
npx expo run:android --device
# Alternatively, on macOS with Xcode and signing configured:
npx expo run:ios --device
```

These commands prebuild when a native project is absent. The config plugin uses bundle ID `ai.scamgraph.app`, App Group `group.ai.scamgraph.app`, and the `ScamGraphCallerDirectory` target. Provision/sign both the host and extension consistently, then enable permissions in device Settings. Regenerate native projects after native dependency/configuration changes; see the [Expo development-build guide](https://docs.expo.dev/develop/development-builds/introduction/).

A full iOS Simulator Debug host with the embedded Call Directory extension was built, installed, and launched on iPhone 17 Simulator (iOS 26.5), using local ad-hoc signing and the shared Metro server. The initial unsigned build lacked application entitlements and could not read SecureStore/Keychain. A normal Simulator build restored those entitlements; login-screen startup, Dashboard access, and text analysis through the shared API were verified without the Keychain error. Physical-device signing/installation, release IPA packaging, and real incoming calls remain unverified.

### LLM Explanations and Intelligence Sources

Without an LLM key, the app uses working explanation templates grounded in structured evidence. Setting `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` enables an optional `/chat/completions`-compatible endpoint, constrained to existing evidence IDs. Timeout or invalid output falls back to the template and displays the state. Provider prose does not create new history or unsupported source references.

Known intelligence uses internal records and CSV/JSON imports with source, `retrieved_at`, evidence, and verification status. No integration is fabricated for websites without an API. No live domain-age/reputation provider is included; external sources require authorization and credentials/configuration.

Intelligence-source CSV uses `entity_type,value,status,evidence`, with `status` set to `reported` or `confirmed`; optional fields include `retrieved_at` and `related_entities` (a JSON array). This is separate from batch CSV (`text,kind`) and training CSV (label/source/campaign metadata).

### OCR and Media Availability

Docker uses Tesseract `tha+eng`. On macOS ARM64, bootstrap installs project-local Tesseract 5.5.0 under `.runtime/ocr` from conda-forge packages whose URLs/SHA256 hashes are pinned in `ocr-runtime.lock.json`, without system installation or package hooks. If Tesseract is absent, Apple Vision may provide a fallback when native OCR is available. When OCR/providers are unavailable, the UI reports that state and allows manual text entry. Native camera/QR use requires user permission. Unreadable images and “QR not found” are supported outcomes.

## Verification and Delivery

```bash
bash scripts/run_checks.sh
```

This checks dependencies/imports, runs backend/ML tests, validates/evaluates artifacts, exports OpenAPI, checks TypeScript, runs client-flow and service-worker tests, and builds the Expo web bundle. Executed results and environment limitations are documented in `QA_RESULTS.md`. Configuration files alone do not establish that Docker, physical native devices, or external providers were tested.

```bash
.venv/bin/python scripts/package_delivery.py
```

This creates `../scamgraph-ai.zip` containing source, lockfiles, safe demo assets, and small trained models. It excludes `.env`, `.venv`, `node_modules`, runtime databases, caches, logs, and large pretrained weights.

Before real-user deployment, prepare authorized and labeled datasets, calibration/evaluation on real data, licensed external-intelligence adapters, a production job queue and distributed rate limiting, moderation and personal-data retention processes, physical Android/iOS device tests, and a verified PostgreSQL deployment.

Additional client checks: `cd app && npm run test:flows` runs **26 checks** (8 OAuth, 14 App privacy/integrity, and 4 ReportsPage checks), using real source actions with mocked HTTP/platform/hooks. Logout clears private screen state immediately. Late responses from a previous account or replaced analysis/job do not reopen old results or trigger stale exports.
