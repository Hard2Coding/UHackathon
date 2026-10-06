# ผลการตรวจที่รันจริง

Environment ส่งมอบ: macOS ARM64, Python 3.12.14; วันที่ 6 ตุลาคม 2026 (Asia/Bangkok)

| การตรวจ | ผลที่รันจริง |
|---|---|
| ติดตั้ง Python dependencies ที่ pin | สำเร็จ; frozen ใน `requirements.lock` |
| `pip check` | ผ่าน — No broken requirements found |
| คำสั่ง bootstrap ตาม README | EXIT 0: `PYTHON_BIN=<bundled Python 3.12> bash scripts/bootstrap.sh`; ตรวจจาก environment เดิมและ cache/artifacts ที่มีอยู่ ไม่ใช่ clean-install test; npm ci ติดตั้ง dependencies จาก lockfile สำเร็จ |
| Final frontend lockfile install | `npm ci` EXIT 0 หลังเพิ่ม SafeArea dependency: 627 packages, audit 628 packages, 11s; ใช้ project cache |
| Runtime imports | ผ่าน: FastAPI, SQLAlchemy/Alembic/psycopg, scikit-learn, XGBoost, SHAP, SentenceTransformers/Torch, NetworkX, OpenCV, Pillow, pytesseract และ Apple Vision |
| Pretrained multilingual embeddings | ดาวน์โหลดจริงจาก revision `e8f8c211226b894fcb81acc59f3b34ba3efd5f42`, encode ไทย/อังกฤษได้ 384 dimensions |
| Train/evaluate artifacts | มี artifacts ที่ฝึกและ evaluate จริงรุ่น `sample-v1-6c6c58eff5`; รายละเอียดใน `ml/artifacts/default/metadata.json` และ `evaluation.json` |
| ML tests | 15 passed; รวม actual local SentenceTransformer และ SHAP |
| Combined backend/ML tests ชุดส่งมอบล่าสุด | 50 passed (35 backend + 15 ML), 2 dependency warnings, 20.12s จาก root canonical run; มี OAuth/LINE/caller directory tests โดย provider HTTP mocked และตรวจ RSA JWT ด้วย crypto จริง |
| TypeScript + Expo web build | TypeScript EXIT 0, Expo web build `--clear` EXIT 0; ตรวจ API URL ที่ build แล้วเป็น `http://localhost:8007/api` |
| Reference branding assets | `app/assets/BRAND.md` และ assets เป็น S/network/shield อิงภาพ reference ล่าสุด มี light/dark icon และ UI symbol; ImageGen interpretation ไม่ใช่ exact pixel extraction — frontend build/UI verification หลังเปลี่ยน branding จะอัปเดตจาก root |
| README local startup | ผ่านจริง: Alembic SQLite migration, demo seed, API health และ demo login |
| Request logging | startup ที่ส่งมอบใช้ `--no-access-log` เพื่อไม่ให้ history/graph query identifiers ปรากฏใน Uvicorn default access logs; คำขอเดโมที่ทดสอบใช้ข้อมูลสังเคราะห์ |
| Text/URL inference over HTTP | ไทย/อังกฤษทำงานจริง; embeddings ready, URL SHAP ready, ไม่มี LLM key ใช้ template |
| QR over HTTP | รูป QR reserved URL decode สำเร็จและต้อง confirm payload; รูปว่างได้ not_found |
| OCR over HTTP | Tesseract 5.5.0 portable + eng/tha ใช้งานจริง; screenshot ไทยและอังกฤษสำเร็จ, รูปว่างได้ unreadable |
| Shell scripts | `bash -n` ผ่าน |
| Docker Compose configuration | YAML/service references/build paths ผ่าน static checks |
| Nginx asset compression | gzip JS/CSS/JSON/SVG/TTF/OTF และ HTML พร้อม Vary ตั้งไว้; /api proxy ยังคงเดิม ใช้ no-store และไม่ gzip response API ส่วนบุคคล ตรวจ configuration แบบ static เท่านั้น ยังไม่มี Nginx/container runtime test |
| PostgreSQL ที่รันจริง | ยังไม่ผ่าน: ไม่มี Docker/server; isolated `initdb` ถูก sandbox ปฏิเสธ `shmget` |
| PostgreSQL migration SQL | สร้าง SQL แบบ offline ได้; SQLite ทั้ง 5 migrations upgrade head `fec7a430a529` สำเร็จจริง แต่ไม่ใช่ PostgreSQL integration test |
| Docker image build/up | ยังไม่รัน: Docker ไม่พร้อมใน environment |
| Native Android/iOS device | ยังไม่รันบนอุปกรณ์จริง |
| iOS Call Directory extension | Swift typecheck และ isolated unsigned iOS Simulator `.appex` compile ผ่านจริงด้วย Xcode 26.6 SDK; full host app/CocoaPods, signing และ real-device calls ยังไม่ได้ทดสอบ |
| Native config/plugin | Android+iOS prebuild repeated EXIT 0, extension embedding/host dependency/source path/permission assertions ผ่าน และ autolinking ตรวจแล้ว; ไม่ใช่ full Android/iOS app build |
| Android caller service compile | ยังไม่รัน: ไม่มี Java/Android toolchain ที่พร้อมในเครื่องนี้ |
| Google/LINE credentials | ยังไม่ได้ทดสอบ consent/callback ด้วย client/channel จริง; .env.example เป็น placeholders และ secrets ว่าง |
| LINE message delivery | ยังไม่ได้ส่ง LINE push จริง; provider mock tests ไม่ใช่ผลการส่งภายนอก |
| OAuth verification dependency | PyJWT 2.10.1 + cryptography 50.0.2/cffi 2.1.1 ติดตั้ง/import จริง; `pip check` ผ่าน |
| Final API provider status | health HTTP 200, inference/OCR/QR ready; providers not configured, identities `[]`, LINE configured=false/enabled=false/linked=false ไม่มี credential หรือ notification จริงถูกสร้างขึ้น |
| Mobile web login flow | ตรวจ viewport 390px: login-first, Google/LINE/อีเมล/สมัคร/Guest; Google unavailable เป็นข้อความชัดเจน เข้าบัญชีเดโมอีเมลและเปิด Settings สำเร็จ |
| External intelligence API | ไม่มี integration credentials/provider ที่กำหนด จึงไม่มีผล integration จริง |
| Frontend dependency audit | npm ci รายงาน 28 รายการ (7 moderate / 21 high) โดยนับ dependency chains; รวม braces และ node-forge ซึ่ง registry ยังไม่มีรุ่นแก้ไขที่ติดตั้งได้ในวันที่ตรวจ ไม่อ้างว่า dependency audit ผ่านหรือไม่มีช่องโหว่ |

อัปเดตจำนวน tests/flow checks จากการรันสุดท้ายก่อนส่งมอบ โดยไม่ถือว่ารายการที่ยังไม่รันผ่านแล้ว

คะแนนหรือ metrics ของ dataset สังเคราะห์ไม่ใช่ production accuracy และไม่ได้ calibrate เป็น scam probability

Preview ล่าสุดใช้ API `http://localhost:8007` และเว็บ `http://localhost:8081` ส่วนคำสั่ง README สำหรับผู้เริ่มระบบเองใช้ API พอร์ต 8000 เป็นค่าเริ่มต้น

Automatic approval review ปฏิเสธการส่ง Ctrl+C เพื่อหยุด test server บาง session เพราะ `sandbox_approval` ถูกปิด และคำสั่งส่ง signal ถูก sandbox ปฏิเสธ อาจมี test servers เก่าบนพอร์ต 8000/8001/8003/8004/8005/8006 ค้างอยู่; พอร์ตส่งมอบที่ตรวจล่าสุดคือ 8007/8081 ผู้ใช้สามารถหยุด terminal เหล่านั้นเองเมื่อไม่ต้องการ

ตรวจเพิ่มเติมหลังแก้ client และรับภาพอ้างอิง: `npm run test:flows` ผ่าน 8 OAuth flow checks และ 4 actual-App privacy regressions (mock platform/hooks/HTTP ไม่ใช่ provider/device tests); ครอบคลุม native cold-start, duplicate callbacks, bounded retry, explicit link, stale OCR/analysis/profile/history หลัง logout. Branding ใช้ S/network/shield อิงภาพของผู้ใช้, โทนม่วง–ฟ้า–ไซแอน, light/dark icons; built-in ImageGen prompt และ asset paths อยู่ใน `app/assets/BRAND.md`. UI asset 384px 93,728 bytes; native icons 1024px opaque/transparent ตามประเภท.

รอบส่งมอบหลังรับภาพจริง: TypeScript และ Expo web export ผ่าน; Expo iOS/Android Hermes JS bundles export ผ่าน (ไม่ใช่ full native app build). ตรวจเว็บจริง 390×844 ทั้ง Dark/Light และ desktop1280×900: โลโก้ S/graph/shield, login choices, กลับหน้าloginหลังlogout; Guest inputว่างหลังlogout. OCRภาพเดโมไทยอ่านได้และข้อความแก้ไขได้บนUI. ไฟล์ภาพตรวจอยู่ใน outputs: scamgraph-welcome-mobile.jpg, scamgraph-welcome-light.jpg, scamgraph-welcome-desktop.jpg. Backend8007ยังตอบhealth200และauth_providersมีสถานะnot_configured; network permission รอบนี้ได้รับแล้ว. ตรวจพอร์ตเก่าล่าสุด8000/8003/8004/8005/8006ยังตอบhealth ส่วน8001ไม่เปิด.
