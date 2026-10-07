# สถานะฟังก์ชัน ScamGraph AI

ตรวจวันที่ 7 ตุลาคม 2026 (Asia/Bangkok) บน API รุ่นล่าสุดที่พอร์ต 8008 พร้อม SQLite สำหรับ local demo ตารางนี้แยกผลที่รันจริงออกจากสิ่งที่ต้องเชื่อมบัญชีหรือทดสอบบนโทรศัพท์ก่อนเปิดใช้จริง

Backend + ML tests ล่าสุดหลังแก้ UTC serialization ผ่าน **52 tests** (37 backend + 15 ML), 2 dependency warnings, 12.79 วินาที ตรวจ HTTP จริงเพิ่มเติม **31 checks** ในรอบก่อนแก้ timestamp โดยใช้ข้อมูลสังเคราะห์/โดเมน reserved และบัญชีตรวจชั่วคราวซึ่งลบแล้ว ไม่มีการส่งข้อความ LINE จริง

| ฟังก์ชัน | สถานะที่ตรวจจริง | ขอบเขต |
|---|---|---|
| สมัคร/เข้าสู่ระบบด้วยอีเมล | ใช้งานผ่าน HTTP จริง | เข้าบัญชี ดู/แก้ชื่อ ออกจากระบบ export และลบบัญชี; session ถูกปฏิเสธหลังลบบัญชี |
| ตรวจข้อความไทย/อังกฤษและ URL | ใช้งานผ่านโมเดลจริง | TF-IDF/Logistic Regression และ XGBoost; ไม่มีการเปิด URL ที่ส่งมาตรวจ |
| ตรวจเบอร์ บัญชี/PromptPay และ wallet | ใช้งานจริง | อ่านหลักฐานที่มี; identifier ที่ไม่พบข้อมูลให้ `INSUFFICIENT DATA` ไม่ใช่ “ปลอดภัย” |
| OCR รูปภาพ | ใช้งานผ่าน HTTP จริง | Tesseract ภาษาไทย/อังกฤษ; คืนข้อความสำหรับตรวจและแก้ก่อนวิเคราะห์ |
| อ่าน QR / PromptPay | ใช้งานผ่าน HTTP จริง + backend tests | แสดง payload ก่อนวิเคราะห์ ตรวจ EMV CRC/receiver ที่รองรับ; ไม่เปิด URL หรือทำธุรกรรม |
| CSV batch | ใช้งานผ่าน HTTP จริง | งานประมวลผล 1–200 แถว ติดตามสถานะ แสดงผล export แบบปกปิดข้อมูล และลบงานที่เสร็จแล้ว |
| บันทึก/ค้นหา/กรอง/เปิด/ลบประวัติ | ใช้งานผ่าน HTTP จริง | จำกัดเฉพาะเจ้าของบัญชี; เปิดผล snapshot ที่บันทึกไว้ได้ |
| วันเวลาในประวัติ/รายงาน/งาน/ที่มา | แก้และผ่าน regression tests | ตอบ ISO พร้อม UTC offset แม้ SQLite คืน datetime แบบไม่มี timezone; timestamp ที่นำเข้าแบบ +07:00 แปลงเป็น UTC ก่อนเก็บเพื่อรักษาเวลาเดียวกัน |
| แชร์และ export JSON/CSV | ใช้งานผ่าน HTTP จริง | ปกปิดข้อมูลเป็นค่าเริ่มต้น และป้องกันสูตรใน CSV |
| กราฟความเชื่อมโยง | API ทำงานจริง | มี provenance/วันที่/SAMPLE; ความสัมพันธ์ไม่ยืนยันว่าบุคคลใดโกง |
| Dashboard | ผูกข้อมูลประวัติส่วนตัวจริง | สรุปประวัติล่าสุดสูงสุด 300 รายการและกราฟรายการที่บันทึกใน 7 วัน; ไม่ใช้ตัวเลขสถิติสมมติ |
| หน้าการแจ้งเตือนในแอพ | ผูกผล HIGH ที่เจ้าของบันทึกจริง | เป็นรายการผลที่ต้องทบทวนภายในแอพ ไม่ใช่หลักฐานว่า LINE/system notification ถูกส่งแล้ว |
| คำถามที่พบบ่อย/ช่วยเหลือ | เนื้อหาค้นหาได้ | อธิบายการใช้งานและข้อจำกัด เป็นเนื้อหาช่วยเหลือคงที่ ไม่แสดงเป็นคำตอบจาก LLM |
| Webapp / PWA install/update | manifest/worker/HTTP checks ผ่าน และอัปเดตผ่าน UI จริงได้ | ใช้ localhost/HTTPS; cache เฉพาะ app assets ไม่ cache API/ข้อมูลส่วนตัว; offline ยังวิเคราะห์หรือเข้าสู่ระบบไม่ได้ |
| แจ้งเบาะแส/หลักฐาน/feedback | HTTP จริง + backend tests | เบาะแสใหม่เป็น pending; ไม่เปลี่ยนเป็นภัยหรือ label train อัตโนมัติ; ไฟล์หลักฐานจำกัดสิทธิ์และลบ EXIF/GPS |
| Admin รายงาน/แหล่งข้อมูล/threshold/audit | ผ่าน backend tests | ต้องมีสิทธิ์ admin; การยืนยันรายงานบันทึกเหตุผลและ audit |
| Admin import/validate/train/evaluate | ผ่าน backend/ML tests | ฝึก artifacts จริงจาก dataset ที่ตรวจรูปแบบ; metrics ในชุดที่ส่งมอบเป็นข้อมูลสังเคราะห์ |
| Google Login | โค้ดและ crypto/flow tests ผ่าน; ยังไม่เชื่อมบัญชีจริง | ยังไม่มี `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| LINE Login | โค้ดและ flow tests ผ่าน; ยังไม่เชื่อม channel จริง | ยังไม่มี LINE Login channel ID/secret/callback |
| LINE แจ้งเตือน | มี Messaging API, webhook/consent/idempotency tests; ยังไม่มีการส่งจริง | ต้องมี Messaging channel และ Login channel ภายใต้ Provider เดียวกัน ผู้ใช้ผูก LINE เพิ่มเพื่อน OA แล้ว opt in |
| Android สายเรียกเข้า | มี CallScreeningService และ offline lookup | ยังไม่มี JDK/Android SDK พร้อมบนเครื่องที่ตรวจ และยังไม่ติดตั้ง/ทดสอบสายจริง ต้องใช้ native build + ผู้ใช้ให้ system role/notification permission |
| iPhone สายเรียกเข้า | Call Directory extension compile ผ่านในรอบก่อน | Debug unsigned arm64 Simulator host + extension compile ผ่านด้วย Xcode 27.0/CocoaPods 1.17.0; ยังไม่ sign/install บนเครื่องจริงหรือทดสอบสายจริง; iOS แสดง label สำหรับเบอร์ที่ sync ไว้ ไม่ส่ง unknown-call app alert |
| Verified caller directory | Endpoint ใช้งานจริง | รายการจริงที่ผ่านตรวจ **0 รายการ**; sample/pending/หมดอายุไม่เข้ารายการ ไม่เติมเบอร์สมมติเพื่อทำให้ดูเปิดใช้งานแล้ว |
| LLM อธิบายผล | Template อ้างอิงหลักฐานทำงาน | ไม่มี LLM key; optional LLM adapter ต้องตั้งค่าเอง แต่การวิเคราะห์หลักไม่ต้องใช้ key |
| Reputation/domain age/เจ้าของบัญชี/เครือข่ายมือถือ | ยังไม่มีผู้ให้บริการข้อมูลภายนอกที่เชื่อมจริง | ไม่สร้างข้อมูลทะเบียนหรือผลความน่าเชื่อถือขึ้นเอง |
| PostgreSQL/Docker | มี schema/migrations/Compose | SQLite และ offline PostgreSQL migration SQL ผ่าน; ยังไม่มี integration กับ PostgreSQL/container จริงใน environment นี้ |

## ตรวจความพร้อมโดยไม่เปิดเผย secret

```bash
source scripts/env.sh
.venv/bin/python scripts/check_activation.py
.venv/bin/python scripts/check_activation.py --api-url http://localhost:8008 --web-origin http://localhost:8081
```

รายงานแสดงเฉพาะ presence booleans/สถานะ/ชื่อค่าที่ขาด ไม่แสดง credential values, เบอร์ใน caller directory, ข้อความผู้ใช้ หรือหลักฐาน และไม่เริ่ม OAuth consent/ส่ง LINE หากต้องการใช้ใน deployment check ให้เพิ่ม `--require google --require line_login --require line_messaging`; exit nonzero หมายถึง local prerequisites ยังไม่ครบ ไม่ใช่ผลตรวจบัญชีภายนอก

`--production` ตรวจโหมด production, ปิด demo seed, PostgreSQL config, HTTPS/CORS/redirect, OAuth และ LINE Messaging prerequisites แบบ local เท่านั้น สคริปต์ปฏิเสธค่าประเภท secret ที่ใส่ใน `EXPO_PUBLIC_*` และไม่ทำ network request เว้นแต่ระบุ `--api-url` ชัดเจน ตรวจ merged checker แล้ว 12 assertions สำหรับ redaction/callback/PWA semantics รวมถึง exit1เมื่อ configuration ยังไม่ครบ

## เปิด Google และ LINE ด้วยบัญชีของแอพ

1. คัดลอก `.env.example` เป็น `.env` และใส่ค่าจริง **บน backend**; อย่าใส่ secret ใน `EXPO_PUBLIC_*` หรือแชท ค่าที่เป็น `your-domain.example` ต้องเปลี่ยนเป็นโดเมน backend ของจริง
2. Google: สร้าง OAuth client ชนิด Web application ตั้ง consent/test users ตามสถานะโครงการ และลงทะเบียน backend callback ที่ตรงกับ `GOOGLE_REDIRECT_URI` ทุกตัวอักษร เช่น `https://api.<โดเมนของคุณ>/api/auth/oauth/google/callback` ดู [Google web-server OAuth documentation](https://developers.google.com/identity/protocols/oauth2/web-server)
3. LINE Login: สร้าง channel ตั้ง callback ให้ตรงกับ `LINE_REDIRECT_URI` เช่น `https://api.<โดเมนของคุณ>/api/auth/oauth/line/callback` และเปิดใช้งานให้กลุ่มผู้ใช้ที่ต้องการ ดู [LINE Login web integration](https://developers.line.biz/en/docs/line-login/integrate-line-login/)
4. LINE Official Account/Messaging API: ตั้ง `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `LINE_OFFICIAL_ACCOUNT_ID` และยืนยันสอง channels อยู่ Provider เดียวกันก่อนตั้ง `LINE_MESSAGING_SAME_PROVIDER=true` ตั้ง webhook `https://api.<โดเมนของคุณ>/api/notifications/line/webhook` และเปิด webhook ใน console ดู [LINE Messaging API setup](https://developers.line.biz/en/docs/messaging-api/building-bot/)
5. `OAUTH_REDIRECT_ALLOWLIST` เป็นที่กลับเข้า Webapp/native app หลัง backend ยืนยันตัวตน เช่น `https://<โดเมนเว็บของคุณ>/,scamgraph://oauth` ซึ่งเป็นคนละที่กับ provider callback ตั้ง CORS ให้ตรง origin เว็บ และ build เว็บด้วย API URL ของ deployment
6. เริ่ม backend ด้วย config ใหม่ รัน checker แล้วตรวจ consent/callback ด้วยบัญชีของตนเอง สำหรับ LINE ให้ผูกบัญชี เพิ่มเพื่อน Official Account เพื่อรับ signed follow webhook แล้วเปิดแจ้งเตือนในแอพ ข้อความแจ้งเตือนปกปิด input/identifier; สถานะ accepted ไม่ใช่หลักฐานว่าผู้รับอ่านแล้ว

Caller ID ต้องมีข้อมูลจริงที่มีสิทธิ์ใช้และผ่านตรวจ รวมถึง native build บนโทรศัพท์ ดู `app/modules/scamgraph-caller/README.md` คำสั่ง export เว็บหรือ JavaScript bundle ไม่ได้สร้าง APK/IPA

โมเดลรุ่นที่ส่งมอบฝึกบนข้อมูลสังเคราะห์ ยังไม่ใช่ production accuracy และคะแนน 0–100 ไม่ใช่เปอร์เซ็นต์โอกาสโกง การเปิด credentials ครบไม่ทดแทนการประเมินโมเดลด้วยข้อมูลจริงที่มีสิทธิ์ใช้
