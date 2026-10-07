# ScamGraph AI

**Predict Before It Gets Reported** — แอพตรวจความเสี่ยงข้อความ ลิงก์ รูปภาพ QR และ entity พร้อมเหตุผลที่อ้างอิงหลักฐานจริง ภาษาไทย/อังกฤษ สำหรับเดโม Hackathon

นี่คือ monorepo ที่เชื่อม Expo/React Native, FastAPI, ฐานข้อมูล และโมเดลที่ฝึกจริงเข้าด้วยกัน คะแนนใช้ inference ของ artifacts ร่วมกับ policy ประวัติที่เปิดเผยในผล ไม่ได้ hardcode ผลตามตัวอย่าง ข้อมูล train และกราฟที่แถมเป็น **ข้อมูลสังเคราะห์สำหรับสาธิต** ไม่ใช่ประวัติการโกงจริง

คะแนน 0–100 ยังไม่ calibrate จึงไม่ใช่เปอร์เซ็นต์โอกาสโกง “ไม่พบประวัติ” ไม่ได้หมายถึงปลอดภัย และความสัมพันธ์ในกราฟหรือความคล้ายของข้อความไม่ใช่การยืนยันว่าบุคคลใดโกง

Branding อิงภาพ `ScamGraph AI.png` ที่ผู้ใช้ให้ล่าสุด: สัญลักษณ์ S, network nodes และ shield/check พร้อม purple–blue–cyan gradient และโหมด light/dark แทน shield ชั่วคราว โลโก้เป็น reference-derived raster interpretation ที่สร้างด้วย ImageGen ไม่ใช่การตัดพิกเซลเดิมหรือ vector original; palette หลักใช้ pale blue/white และน้ำเงิน–ม่วง พร้อม midnight navy สำหรับ dark mode และคงสีความเสี่ยงตามความหมาย รายละเอียด masters, exports และ prompts อยู่ใน `app/assets/BRAND.md`

## UI และ Webapp เวอร์ชันล่าสุด

ปรับตามภาพหน้าจอมือถือ/เว็บที่ผู้ใช้ให้: หน้าเปิดเป็นโลโก้และตัวเลือกล็อกอิน Google, LINE, อีเมล และสมัครบัญชี หน้า Dashboard มีการ์ดสแกน 4 หมวด มือถือใช้เมนูด้านล่าง เว็บใช้เมนูด้านซ้าย โทนเริ่มต้นเป็นขาว–ฟ้า ปุ่มไล่สีน้ำเงิน–ม่วง และสลับ dark mode/ภาษาได้ เอฟเฟกต์เข้าแสดงผลจบในช่วงสั้นและเคารพ reduced-motion ของระบบ ปุ่มมี hover/focus glow โดยไม่ซ่อนตัวเลือกเข้าสู่ระบบ

Dashboard/กราฟ 7 วันคำนวณจากประวัติส่วนตัวที่บันทึกจริงสูงสุด 300 รายการ หน้าแจ้งเตือนเปิดผล HIGH ที่บันทึกไว้ และศูนย์ช่วยเหลือค้นหาคำถามได้ Webapp มี manifest/ไอคอน/service worker สำหรับ browser ที่รองรับ การอัปเดตรอผู้ใช้กดก่อนโหลดหน้าใหม่ แคชเฉพาะไฟล์แอพสาธารณะ ไม่แคช API/ผลตรวจ/รูปอัปโหลด การวิเคราะห์และข้อมูลส่วนตัวยังต้องออนไลน์

ผู้ใช้ยืนยันว่ายังไม่มีโครงการ Google Cloud/LINE จึงยังไม่ได้เปิด provider จริง อ่าน [คู่มือเปิดการเชื่อมต่อ](ACTIVATION.md), [Webapp](WEBAPP.md), [สถานะแต่ละฟังก์ชัน](FUNCTION_STATUS.md) และ [ผลทดสอบ](QA_RESULTS.md) ก่อนเปิดใช้งานจริง

## โค้ดร่วม App + Web และการอัปเดต

Repository หลักคือ `Hard2Coding/UHackathon` branch `DevTutor` ทั้งมือถือและเว็บใช้ `app/App.tsx`, `app/src` และ `shared` ร่วมกัน API/โมเดลอยู่ใน `backend`/`ml` ไม่ต้องคัดลอกหน้าจอไปสองโครงการ

หลังติดตั้ง dependencies แล้ว รัน `npm run dev` ที่ราก repo เพื่อเปิด API reload และ Expo Metro ตัวเดียวสำหรับเว็บและ native development client แก้ source แล้วทั้งสองฝั่งรับโค้ดเดียวกัน คำสั่ง `npm run ios` / `npm run android` build/install native โดยใช้ Metro ที่เปิดไว้ ดู [DEVELOPMENT.md](DEVELOPMENT.md) สำหรับ LAN IP และพอร์ต

เว็บรองรับ Vercel โดย Import repo ที่รากและตั้ง `EXPO_PUBLIC_API_URL` เป็น HTTPS backend จริง อ่าน [VERCEL.md](VERCEL.md) เมื่อเชื่อม Git แล้ว Vercel build/deploy จาก branch ที่ติดตามตามการตั้งค่าโครงการ GitHub Actions ตรวจและ export เว็บ/Android/iOS พร้อม Git SHA เดียวกัน ส่วน OTA ไปแอพที่ติดตั้งต้องตั้ง Expo project/updates/runtime ก่อน ดู [RELEASES.md](RELEASES.md)

## โครงสร้าง

```text
app/                 Expo + React Native + TypeScript, เว็บและโค้ด Android/iOS
backend/app/         FastAPI, auth, history, reports, graph, media, admin, jobs
backend/migrations/  Alembic database migrations
backend/tests/       API/security/integration tests
ml/                  import/validate/train/evaluate และ inference
ml/datasets/         ชุดข้อมูลสังเคราะห์ที่ติดป้าย sample
ml/artifacts/default/โมเดลที่ฝึกจริง, metadata และผล evaluation
ml/artifacts/embedding-model/ pretrained multilingual model (ดาวน์โหลดแยก)
shared/              OpenAPI snapshot และความหมายของ API contract
demo-assets/         รูป OCR, QR, รูปว่าง และ CSV สำหรับเดโมที่ปลอดภัย
scripts/             ติดตั้ง เริ่มเดโม ตรวจระบบ และสร้าง ZIP
```

Python dependency pins อยู่ใน `requirements.in`; dependencies ที่ resolve และติดตั้งจริงทั้งหมดอยู่ใน `requirements.lock` จาก Python 3.12/macOS ARM64 มี platform markers สำหรับ OCR ของ macOS และ CPU XGBoost บน Linux x86_64 Frontend ใช้ `app/package-lock.json` กับ `npm ci`

## เริ่มเดโมบนเครื่อง

ต้องมี Python **3.12**, Node.js **22 LTS ขึ้นไป** และ npm (เครื่องทดสอบใช้ Node 24.18.0/npm 11.16.0) การติดตั้งครั้งแรกใช้อินเทอร์เน็ตสำหรับ dependencies และ pretrained SentenceTransformer ประมาณ 449 MB บน macOS ARM64 จะดาวน์โหลด portable OCR runtime อีกประมาณ 186 MB ไม่ต้องมี API key

จากโฟลเดอร์ `scamgraph-ai`:

```bash
cp .env.example .env
bash scripts/bootstrap.sh
```

หาก Python 3.12 อยู่คนละตำแหน่ง ให้กำหนด `PYTHON_BIN=/absolute/path/python3.12` ก่อนคำสั่ง bootstrap ถ้าไม่ต้องการโหลด SentenceTransformer ตอนติดตั้ง ให้ใช้ `DOWNLOAD_EMBEDDINGS=0 bash scripts/bootstrap.sh`; baseline ยังทำงาน แต่ similarity จะระบุว่าใช้ lexical fallback ใช้ `INSTALL_LOCAL_OCR=0` เพื่อข้าม portable OCR บน macOS และโหลดทีหลังด้วย `.venv/bin/python scripts/install_local_ocr.py`

เปิด terminal ที่ 1:

```bash
bash scripts/local_demo.sh
```

คำสั่งนี้เลือก **SQLite สำหรับ local demo อย่างชัดเจน** ที่ `.runtime/scamgraph-demo.db`, รัน migration/seed และเปิด API ที่ `http://localhost:8000` เอกสาร API อยู่ที่ `http://localhost:8000/docs` หาก artifacts ยังไม่มี จะฝึกจาก sample dataset ก่อนเริ่มเซิร์ฟเวอร์

เปิด terminal ที่ 2:

```bash
source scripts/env.sh
cd app
npm run web -- --port 8081
```

เปิด `http://localhost:8081` แอพเว็บเรียก API จริงที่พอร์ต 8000 กล้องบนเว็บต้องอยู่บน localhost หรือ HTTPS และจะขอสิทธิ์เมื่อผู้ใช้เลือกฟังก์ชันเท่านั้น

บัญชีเดโมที่ seed สร้างใน development:

| สิทธิ์ | อีเมล | รหัสผ่าน |
|---|---|---|
| ผู้ใช้ | `demo@scamgraph.demo` | `DemoUser!2026` |
| ผู้ดูแล | `admin@scamgraph.demo` | `DemoAdmin!2026` |

Guest ตรวจสอบได้โดยไม่สมัคร การบันทึกประวัติ งาน batch และแจ้งเบาะแสใช้บัญชีผู้ใช้

บนโทรศัพท์ ให้ตั้ง `EXPO_PUBLIC_API_URL=http://<IP ของเครื่องที่รัน API>:8000/api` ก่อนเริ่ม development server สำหรับ Android emulator ใช้ `http://10.0.2.2:8000/api` ไม่ใช่ localhost ของโทรศัพท์ ฟังก์ชัน caller identification และ OAuth app deep link ต้องใช้ development/production build ที่รวม native module ของแอพ Expo Go และเว็บแสดงสถานะ unavailable สำหรับสายเรียกเข้า โค้ด native มีอยู่ แต่การติดตั้งบนอุปกรณ์ Android/iOS จริงยังไม่ได้ทดสอบในเครื่องส่งมอบนี้

## PostgreSQL + Docker Compose

เส้นทางหลักสำหรับ deployment ใช้ **PostgreSQL 16** พร้อม Alembic migrations, Tesseract ภาษาไทย/อังกฤษ, API และเว็บที่ build แล้ว:

```bash
cp .env.example .env
docker compose build
docker compose run --rm backend python scripts/download_embeddings.py
docker compose up -d
docker compose logs -f backend
```

เปิดเว็บ `http://localhost:8080` และ API docs `http://localhost:8000/docs` Nginx ส่ง `/api/` ไป backend ใช้ `docker compose down` เพื่อหยุดระบบ volume ฐานข้อมูลยังคงอยู่

หากข้าม download command โมเดลข้อความ/URL/Anomaly ยังทำงานจาก artifacts แต่ sentence embeddings จะไม่พร้อมและ API จะแสดงสถานะนั้น `.env` ไม่ถูก copy เข้า image และไม่อยู่ใน ZIP อย่าเก็บ API keys ลง Git

**สถานะที่ตรวจได้ใน environment นี้:** ตรวจ Compose YAML, service references, build paths และ shell scripts แล้ว แต่ไม่มี Docker และ PostgreSQL server ที่ใช้งานได้ จึงยังไม่ได้รัน container build หรือ integration กับ PostgreSQL จริง มีการทดลอง PostgreSQL binaries ใน project แล้ว แต่ sandbox ปฏิเสธ shared-memory syscall (`shmget`) ส่วน local demo ใช้ SQLite เพื่อทดสอบ flow ที่รันได้

ก่อนใช้งาน production ให้กำหนด `APP_ENV=production` และ `ENABLE_DEMO_SEED=false`, ใช้ credential ของตนเองและ provision admin ที่เชื่อถือได้ เพิ่ม HTTPS, backup, secrets manager และงาน background/จำกัดความถี่ที่รองรับหลาย worker โค้ดเดโมไม่ได้มีระบบจัดการ production infrastructure ให้อัตโนมัติ

## เดโม Hackathon 5–7 นาที

1. เริ่มจากหน้าต้อนรับ เลือกเข้าบัญชีอีเมลเดโมหรือกด Guest เอง ปุ่ม Google/LINE แสดง not configured เมื่อยังไม่มี credentials จากนั้นเลือกตัวอย่างข้อความทั่วไปและข้อความเร่งให้ส่ง OTP เปรียบเทียบคะแนนจากโมเดลจริง เปิดปัจจัยเสี่ยงและหน้ารายละเอียดเพื่อดู model version/หน่วย SHAP
2. วางลิงก์ `https://bank-verify-demo.test/confirm` แสดงว่า HTTPS ไม่ได้ยืนยันความปลอดภัย และข้อมูลอายุโดเมน/ชื่อเสียงภายนอกยังไม่มี
3. อัปโหลด `demo-assets/screenshot-thai-demo.png` หรือ `screenshot-demo.png` อ่าน OCR ตรวจ/แก้ข้อความ แล้วค่อยวิเคราะห์ ใช้ `blank.png` สาธิตภาพอ่านไม่ออก
4. อัปโหลด `demo-assets/qr-demo.png` ดู payload ก่อนกดวิเคราะห์ แอพไม่เปิดลิงก์และไม่ทำธุรกรรม ใช้รูปว่างสาธิต QR ไม่พบ
5. วิเคราะห์ `https://reward-support.example/claim` แล้วเปิดกราฟ กราฟต้องติดป้าย SAMPLE กด node/edge ดูที่มาและเวลา ความเชื่อมโยงไม่ใช่ข้อกล่าวหา
6. เข้าบัญชี demo บันทึกผล ค้นหา/กรองประวัติ แชร์หรือส่งออกรายงานแบบปกปิดข้อมูล และแจ้งเบาะแสใหม่ ดูสถานะ pending ซึ่งยังไม่ทำให้ entity เป็น scam ที่ยืนยันแล้ว
7. นำเข้า `demo-assets/batch-demo.csv` ติดตาม job และผลรายรายการ เข้าบัญชี admin ดูสถิติจริงจากการใช้งาน ตัดสินรายงานพร้อมเหตุผล และดู model metrics/training jobs/configuration

URL ทั้งหมดที่ใช้เดโมเป็น `.test`/`.example` ซึ่งสงวนไว้ ไม่ใช่ลิงก์อันตรายจริง กราฟและ source ที่ seed เป็นข้อมูลแต่งสำหรับเดโมและใช้ placeholder แทนบุคคลจริง

## ฝึกและประเมินโมเดล

จาก monorepo root:

```bash
source scripts/env.sh
.venv/bin/python -m ml sample --output ml/datasets/sample.jsonl
.venv/bin/python -m ml validate ml/datasets/sample.jsonl
.venv/bin/python -m ml train ml/datasets/sample.jsonl --artifacts ml/artifacts/default
.venv/bin/python -m ml evaluate ml/datasets/sample.jsonl --artifacts ml/artifacts/default
```

`env.sh` ตั้ง OpenMP library path สำหรับ macOS จาก PyTorch ที่ติดตั้งแล้ว และเก็บ Expo/npm/cache ใน `.runtime` ของโปรเจกต์ (`__UNSAFE_EXPO_HOME_DIRECTORY`, `NPM_CONFIG_CACHE`, `EXPO_NO_TELEMETRY=1`) จึงไม่ต้องแก้ไฟล์ระบบหรือเขียน cache ลง home directory เพื่อรันเดโมนี้

ข้อมูลจริงรองรับ CSV/JSON/JSONL ต้องมี `label` เป็น `normal`/`scam`, `source`, `campaign_id`, และ `text` หรือ `urls` (list หรือ URL string ใน CSV); ตั้ง `is_sample=false` เฉพาะเมื่อมีข้อมูลจริงที่ใช้ได้ตามสิทธิ์และตรวจสอบ labels แล้ว:

```bash
.venv/bin/python -m ml import /path/to/verified.csv --output ml/datasets/verified.jsonl
.venv/bin/python -m ml validate ml/datasets/verified.jsonl
.venv/bin/python -m ml train ml/datasets/verified.jsonl --artifacts ml/artifacts/verified-v1
.venv/bin/python -m ml evaluate ml/datasets/verified.jsonl --artifacts ml/artifacts/verified-v1
```

ตัวอย่างหนึ่งแถว:

```json
{"id":"source-row-001","text":"ข้อความที่ผ่านการติดป้ายแล้ว","urls":[],"label":"normal","campaign_id":"campaign-001","source":"ชื่อแหล่งข้อมูลและสิทธิ์ใช้งาน","is_sample":false}
```

Pipeline deduplicate, ตรวจ label ขัดแย้ง และแยก campaign/domain/exact text ที่เชื่อมกันเป็นกลุ่มก่อน train/validation/test เลือก classifier threshold จาก validation และล็อก test split ไว้ โมเดลไม่ได้ stack ผลของ classifier อื่นเป็น feature จึงไม่มี training feature ที่ต้องทำ out-of-fold ข้อมูล community ที่ยังไม่ได้ verify ไม่เข้าสู่ retraining อัตโนมัติ

Artifacts ที่ส่งมอบรุ่น `sample-v1-6c6c58eff5` ฝึกจาก sample 400 แถว (normal 200/scam 200), 150 connected groups: train 230, validation 80, test 90 ผลจริงอยู่ใน `ml/artifacts/default/evaluation.json` และ `metadata.json` มี Precision/Recall/F1/PR-AUC และ confusion matrix แม้ sample นี้ได้ metrics สูง ก็ไม่ใช่หลักฐานความแม่นยำกับ scam ในโลกจริง ชุดข้อมูลนี้ง่ายและไม่เป็นตัวแทนข้อมูลใช้งานจริง

โมเดลที่ใช้งาน:

- ข้อความ: character 2–5 gram TF-IDF + Logistic Regression รองรับไทย/อังกฤษ
- URL: XGBoost บน feature ที่คำนวณจาก URL โดยไม่เปิด URL; Tree SHAP contributions มีหน่วย raw model margin/log-odds
- Anomaly: Isolation Forest อ้างอิง normal URL features จาก train เท่านั้น แสดง score แยกจากความเสี่ยง scam
- Similarity: SentenceTransformer pretrained multilingual MiniLM 384 dimensions เมื่อไฟล์พร้อม หรือ lexical cosine fallback ที่ติดป้ายชัดเจน
- ความสัมพันธ์: NetworkX และข้อมูล source/edge จริงในฐานข้อมูล; ยังไม่มี graph classifier ที่ฝึกด้วยข้อมูลจริง

Fusion ใช้ค่าสูงสุดของ text/URL model scores ×100 เพื่อหลีกเลี่ยงการนับสัญญาณเดิมซ้ำ แล้วใช้ **policy ประวัติซึ่งไม่ใช่ผล ML** เป็นคะแนนขั้นต่ำเฉพาะหลักฐานที่ไม่ใช่ sample: confirmed source 85, community ที่ผู้ดูแลตรวจแล้ว 65, source ที่ยังเป็น reported 50 แต่ละผลแสดงชนิดหลักฐานและ policy ที่ใช้ กราฟ/Anomaly/similarity ไม่ได้เพิ่มคะแนนเป็น scam probability

SentenceTransformer ถูก pin ที่ revision `e8f8c211226b894fcb81acc59f3b34ba3efd5f42` ของ `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` ZIP ไม่บรรจุ pretrained weights ขนาดใหญ่ ใช้ `python scripts/download_embeddings.py` เพื่อโหลดรุ่นเดียวกับที่ทดสอบ แหล่ง/รุ่นบันทึกใน `scamgraph_source.json` ภายในโฟลเดอร์ model

## Provider และข้อมูลภายนอก

### Google และ LINE Login

ไฟล์ `.env.example` มี configuration ที่ยังไม่เปิดใช้ provider จริง ใส่ client/channel credentials **เฉพาะ `.env` บน backend หรือ secrets manager** ไม่ส่ง secrets ในแชท และไม่ใช้ `EXPO_PUBLIC_*` สำหรับ client secret/channel token หากมี `.env` อยู่แล้ว ให้เพิ่ม fields ใหม่โดยรักษาค่าของตนเองแทนการ copy ทับ

| ค่า | ใช้ที่ไหน |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google OAuth Web client; callback ของ backend |
| `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET`, `LINE_REDIRECT_URI` | LINE Login channel; callback ของ backend |
| `OAUTH_REDIRECT_ALLOWLIST` | URL กลับเข้าเว็บ/แอพที่อนุญาตแบบ exact match |
| `OAUTH_HTTP_TIMEOUT_SECONDS` | timeout เมื่อเรียก provider; default 5 วินาที |

Google setup: สร้าง project และตั้ง audience/consent screen ใน Google Auth Platform จากนั้นสร้าง OAuth client ชนิด **Web application** ลงทะเบียน URI ที่ตรงกับ `GOOGLE_REDIRECT_URI` เช่น `https://api.<โดเมนของคุณ>/api/auth/oauth/google/callback` แบบตรงทุกตัว รวม scheme/path/trailing slash เก็บ secret ที่ backend และใช้ scopes สำหรับข้อมูลบัญชีเท่านั้น ตั้ง test users ตามสถานะของ project ก่อนทดสอบจริง [Google web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server)

LINE setup: สร้าง LINE Login channel สำหรับ web app ใน provider ของคุณ ลงทะเบียน `https://api.<โดเมนของคุณ>/api/auth/oauth/line/callback` ให้ตรงกับ `LINE_REDIRECT_URI` แล้วใส่ channel ID/secret ที่ backend LINE `openid` ใช้ระบุตัวตน; หากจะขอ `email` ต้องสมัคร email permission ของ channel ก่อน ไม่มี email ไม่ได้ทำให้ระบบมีสิทธิ์ผูกบัญชีอื่นจากชื่อแสดงผล [LINE Login guide](https://developers.line.biz/en/docs/line-login/integrate-line-login/)

แยก URL สองชนิดให้ชัดเจน: provider callback เป็น backend HTTPS endpoint ที่ลงทะเบียนข้างต้น ส่วน `http://localhost:8081/` และ `scamgraph://oauth` ใน allowlist เป็นปลายทาง **หลัง backend ตรวจ callback แล้ว** สำหรับกลับเข้าแอพ อย่าลงทะเบียน `scamgraph://oauth` เป็น Google Web-client redirect; Google ไม่รองรับ Android native custom-scheme OAuth flow รูปแบบเก่า [Google native-app redirect limitations](https://developers.google.com/identity/protocols/oauth2/native-app)

Login ใช้ browser ของระบบ, state/nonce/PKCE และการแลก handoff แบบใช้ครั้งเดียว Credentials ที่ขาดทำให้ปุ่ม/provider เป็น not configured; ไม่ได้สร้างบัญชี Google/LINE จำลอง เมื่อเปลี่ยน `.env` ต้อง restart API ภาค native ต้อง build scheme `scamgraph` เข้าตัวแอพก่อน deep link จึงทำงาน

### LINE Messaging API notifications

LINE Login channel กับ Messaging API channel เป็นคนละ channel สร้าง LINE Official Account ใน [Official Account Manager](https://manager.line.biz/) แล้วเปิด Messaging API เพื่อให้เกิด channel; ปัจจุบันไม่สร้าง Messaging API channel ด้วยปุ่ม Create channel ใน Developers Console แล้ว [LINE Messaging API setup](https://developers.line.biz/en/docs/messaging-api/getting-started/)

เลือก provider เดียวกับ LINE Login ตั้ง `LINE_CHANNEL_ACCESS_TOKEN` และ `LINE_CHANNEL_SECRET` จาก Messaging API channel บน backend เท่านั้น หลังตรวจใน console ว่าทั้งสอง channel อยู่ใต้ provider เดียวกันจึงตั้ง `LINE_MESSAGING_SAME_PROVIDER=true` เพราะ user IDs เหมือนกันเฉพาะภายใต้ provider เดียว ไม่ใช่ LINE ID ที่ผู้ใช้พิมพ์เอง [LINE user IDs](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/)

ตั้ง webhook เป็น `https://api.<โดเมนของคุณ>/api/notifications/line/webhook` ที่เข้าถึงจาก LINE ได้ เปิด Use webhook และใช้ Verify ใน console ระบบตรวจ `x-line-signature` ด้วย Messaging API channel secret จาก raw body ก่อนอ่าน event; ไม่เปลี่ยน body ก่อนตรวจ [Webhook signature verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)

ผู้ใช้ต้องเชื่อมบัญชี LINE ของตน, เพิ่ม Official Account เป็นเพื่อน และเลือกเปิด notifications ในแอพเอง ระบบจึงส่งเฉพาะผล HIGH ที่ผู้ใช้เลือกบันทึกโดยอัตโนมัติ `LINE_OFFICIAL_ACCOUNT_ID` ใช้สำหรับลิงก์เพิ่มเพื่อน การเปิด login ไม่ได้เท่ากับยินยอมรับข้อความ ข้อความมีคะแนน/ระดับ/เวลา/ข้อจำกัด โดยไม่ส่ง input, URL หรือ identifier เดิม หากไม่มี credentials จะไม่ส่งข้อความจริง ตรวจ quota/สิทธิ์ส่งของ Official Account ก่อนใช้งานจริง; provider ยอมรับคำขอไม่ได้ยืนยันว่าอ่านหรือได้รับข้อความแล้ว [Messaging API reference](https://developers.line.biz/en/reference/messaging-api/#send-push-message)

ยังไม่ได้ทดสอบ Google/LINE consent ด้วย credentials จริงหรือส่งข้อความไปยังผู้ใช้ LINE จริงในเครื่องนี้ การทดสอบ provider แบบ mock เป็น contract/security tests ไม่ใช่ external integration ที่ผ่านแล้ว

### สถานะสายเรียกเข้าบน native

โมดูล `app/modules/scamgraph-caller` และ config plugin `app/plugins/withScamGraphCaller.js` ใช้ cache เบอร์ที่มีหลักฐานตรวจแล้วและไม่ใช่ sample ชุดข้อมูล demo ไม่เข้าสู่ caller cache เบอร์ไม่พบ/ข้อมูลหมดอายุเป็น insufficient data และไม่แปลว่าปลอดภัย; ไม่มีการบล็อกสายอัตโนมัติ

`CALLER_DIRECTORY_TTL_HOURS` default 6 ชั่วโมง และ `CALLER_DIRECTORY_MAX_AGE_DAYS` default 90 วัน จำกัดความสดของ cache/หลักฐาน แอพ refresh เฉพาะเมื่อผู้ใช้เปิดฟังก์ชันและ clear cache เมื่อปิด รุ่นโมเดลทดลองข้อความ/URL ไม่ได้สร้างเปอร์เซ็นต์ความแม่นยำสำหรับ caller identification

บน iOS การตรวจ expiry เกิดเมื่อ extension โหลด directory ใหม่ ตาม flow นี้ label ที่ OS โหลดไว้ก่อนหน้าอาจค้างจนมี reload/refresh เมื่อกลับเข้าแอพ TTL จึงไม่ใช่คำรับรองว่า OS ถอน label ทันทีที่หมดอายุ Label แสดงแหล่งข้อมูลและวันที่เพื่อให้เห็นอายุหลักฐาน

| Platform | พฤติกรรมที่รองรับ |
|---|---|
| Android 10+ | ผู้ใช้เลือกเปิด `ROLE_CALL_SCREENING`; service อนุญาตสายทันที แล้ว lookup cache แบบ offline และแจ้งเตือนตามข้อมูลที่มี Android 13+ ต้องยินยอม notification แยก |
| iOS | Call Directory extension `.appex` + App Group แสดง identification จากรายการ E.164 ที่ตรวจแล้ว ผู้ใช้ต้องเปิด extension ใน Settings; JavaScript ไม่ได้รับเหตุการณ์โทรเข้าหรือเบอร์โทรแบบ live |
| เว็บ / Expo Go | unavailable; ไม่ดักสาย ไม่แสดงว่าเปิดระบบป้องกันแล้ว |

โค้ด Android ไม่ขอ READ_CALL_LOG/READ_PHONE_STATE/READ_CONTACTS/overlay ไม่อ่านประวัติหรือบทสนทนา OS อาจไม่ส่งสายบางประเภท/เบอร์ที่ปกปิดให้ service; จึงไม่ครอบคลุมทุกสาย [Android CallScreeningService](https://developer.android.com/reference/android/telecom/CallScreeningService) iOS ใช้ข้อจำกัดของ Call Directory ตามระบบ ไม่ทำ popup โทรเข้าจาก React Native [Apple caller identification](https://developer.apple.com/documentation/callkit/identifying-and-blocking-calls)

ต้องติดตั้ง Android Studio/SDK/JDK สำหรับ Android หรือ Xcode/CocoaPods สำหรับ iOS และ build แอพที่มี native module นี้ เช่น จาก monorepo root:

```bash
source scripts/env.sh
cd app
npx expo run:android --device
# หรือบน macOS ที่มี Xcode และ signing พร้อม
npx expo run:ios --device
```

คำสั่งจะทำ prebuild เมื่อยังไม่มี native project ใช้ bundle ID `ai.scamgraph.app` และ App Group `group.ai.scamgraph.app` กับ target `ScamGraphCallerDirectory` ตาม config plugin ต้องตั้ง provisioning/signing ให้ตรงทั้งแอพและ extension แล้วเปิดสิทธิ์ผ่าน Settings บนเครื่องจริง เมื่อเปลี่ยน native dependency/config ให้ regenerate ตาม [Expo development-build guide](https://docs.expo.dev/develop/development-builds/introduction/)

ตรวจ full iOS Simulator Debug host พร้อม embedded Call Directory extension ผ่านแล้ว และติดตั้ง/เปิดแอพบน iPhone 17 Simulator (iOS 26.5) ด้วย local ad-hoc signing โดยใช้ Metro ร่วมกับเว็บ การเปิดแบบ unsigned ทำให้ SecureStore อ่าน Keychain ไม่ได้ จึงต้องใช้ build ที่มี application entitlements ตามปกติ ตรวจหน้าล็อกอิน เข้า Dashboard และวิเคราะห์ข้อความผ่าน API ร่วมได้โดยไม่มีข้อผิดพลาด Keychain แล้ว ส่วน physical-device signing/installation, release IPA และสายโทรเข้าจริงยังไม่ได้ตรวจ

ไม่ตั้ง LLM key แอพใช้คำอธิบาย template จาก structured evidence และยังใช้งานได้ หากตั้ง `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` ผ่าน environment จะเรียก endpoint ที่เข้ากันกับ `/chat/completions` โดยให้เลือก evidence IDs ที่มีอยู่แล้วเท่านั้น ถ้า timeout/ตอบผิด format จะ fallback และแสดงสถานะ ไม่มีการนำ provider prose มาเพิ่มประวัติหรือแหล่งอ้างอิงที่ไม่อยู่ในระบบ

Known intelligence ใช้ข้อมูลภายในและ import CSV/JSON พร้อม source, retrieved_at, evidence, verification status ไม่มีการปลอม integration กับเว็บที่ไม่มี API ไม่มี domain age/reputation live provider ที่แถมมา แหล่งภายนอกต้องมีสิทธิ์และ credentials/configuration ก่อนใช้งาน

CSV สำหรับ intelligence source ใช้ `entity_type,value,status,evidence` โดย `status` เป็น `reported` หรือ `confirmed`; เพิ่ม `retrieved_at` และ `related_entities` (JSON array) ได้ แยกจาก CSV batch ซึ่งใช้ `text,kind` และ CSV training ซึ่งต้องมี label/source/campaign metadata

OCR บน Docker ใช้ Tesseract `tha+eng`; บน macOS ARM64 bootstrap ติดตั้ง Tesseract 5.5.0 แบบ project-local ที่ `.runtime/ocr` จาก conda-forge packages ที่ล็อก URL/SHA256 ใน `ocr-runtime.lock.json` โดยไม่ติดตั้งลงระบบหรือรัน package hooks เมื่อไม่มี Tesseract มี Apple Vision fallback หาก native OCR ใช้งานได้ หาก OCR/provider ไม่พร้อม UI ต้องแจ้งสถานะและให้วางข้อความเองได้ กล้อง/QR บน native ต้องได้รับสิทธิ์จากผู้ใช้ ภาพอ่านไม่ออกและ QR ไม่พบเป็นผลที่รองรับ

## ตรวจระบบและส่งมอบ

```bash
bash scripts/run_checks.sh
```

คำสั่งนี้ตรวจ dependencies/imports, รัน backend/ML tests, validate/evaluate artifacts, ส่งออก OpenAPI, TypeScript typecheck และ Expo web build ผลที่รันจริงและข้อจำกัดของ environment อยู่ใน `QA_RESULTS.md` ห้ามตีความว่ามีการทดสอบ Docker/native device/provider ภายนอกแล้วเพียงเพราะมี configuration

```bash
.venv/bin/python scripts/package_delivery.py
```

สร้าง `../scamgraph-ai.zip` เฉพาะ source, lockfiles, safe demo assets และโมเดลที่ฝึกขนาดเล็ก ไม่รวม `.env`, `.venv`, `node_modules`, runtime database, cache, logs หรือ pretrained weights

ข้อจำกัดที่ต้องจัดเตรียมก่อนใช้กับผู้ใช้จริง: dataset ที่มีสิทธิ์และตรวจ labels, calibration/evaluation กับข้อมูลจริง, external intelligence adapters ที่ได้รับอนุญาต, production job queue/การจำกัดความถี่แบบ distributed, กระบวนการ moderation และการเก็บรักษาข้อมูลส่วนบุคคล รวมถึงการทดสอบบนอุปกรณ์ Android/iOS และ PostgreSQL deployment จริง

ตรวจ client flows เพิ่มเติม: `cd app && npm run test:flows` (8 OAuth + 4 privacy checks ของ source จริง โดย mock HTTP/platform/hooks). การออกจากระบบล้างข้อมูลบนหน้าจอทันที และผลที่ตอบกลับช้าจากบัญชีเดิมจะไม่เปิดกลับมา.
