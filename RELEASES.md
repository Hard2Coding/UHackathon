# อัปเดตแอพและเว็บจาก Git เดียวกัน

มือถือ Android/iOS และ Webapp ใช้ `app/App.tsx`, `app/src/`, `shared/` และ assets ชุดเดียวกัน การแก้ UI หรือ business logic ใน source นี้จึงเข้า build ทั้งสาม platform จาก commit เดียวกัน ไม่ต้องคัดลอกโค้ดไปอีก repo ส่วน caller ID ที่ต้องใช้ความสามารถของระบบปฏิบัติการอยู่ใน local native module และมีข้อจำกัดต่างจากเว็บ

## ตรวจและ build ทุกครั้งที่ push

`.github/workflows/shared-app.yml` รันอัตโนมัติเมื่อ push ทุก branch หรือเปิด/อัปเดต pull request และสั่งรันเองได้ใน GitHub Actions:

1. ติดตั้ง frontend จาก `app/package-lock.json` แล้วตรวจ TypeScript, 12 login/privacy flows และพฤติกรรม service worker
2. ติดตั้ง backend จาก lockfile ด้วย CPU-only Torch และ Tesseract `tha+eng` แล้วตรวจ API/ML, validation และ evaluation ของโมเดลขนาดเล็กที่อยู่ใน repo
3. เมื่อ checks ผ่าน จึง export Web, Android และ iOS จาก source commit เดียวกัน และแนบ artifacts ไว้ใน workflow run เป็นเวลา 14 วัน

ผล tests และรายการที่ skip อยู่ใน artifact `api-model-tests-<SHA>` การตรวจ real multilingual embeddings จะ skip เมื่อไม่มี weights โดย workflow ไม่ดาวน์โหลด weights และตั้ง Hugging Face เป็น offline การทดสอบนี้จึงไม่ได้ยืนยัน credentials ของ Google/LINE, การส่ง LINE จริง, native device caller ID หรือความแม่นยำกับข้อมูลจริง

Build artifacts มีชื่อบอกชนิดโดยตรง:

| Artifact | ใช้ทำอะไร |
| --- | --- |
| `web-static-<SHA>` | ไฟล์ Webapp ที่ export แล้ว สำหรับตรวจและ deploy หลังตั้ง backend |
| `android-js-bundle-not-apk-<SHA>` | Android JavaScript/Hermes และ assets; ยังติดตั้งเป็น APK ไม่ได้ |
| `ios-js-bundle-not-ipa-<SHA>` | iOS JavaScript/Hermes และ assets; ยังติดตั้งเป็น IPA ไม่ได้ |

ทุก artifact มี `release-manifest.json` ที่บันทึก Git SHA และ SHA-256 ของ common source ชุดเดียวกัน ใช้ตรวจว่าเว็บและแอพมาจากโค้ดรุ่นเดียวกัน ค่า `published: false` หมายถึง workflow นี้สร้างไฟล์ตรวจเท่านั้น ไม่ได้ส่งไฟล์ไป Vercel, Expo หรือ app store

Repository Variables ที่กำหนดได้ใน GitHub Settings → Secrets and variables → Actions:

| Variable | ความหมาย |
| --- | --- |
| `WEB_API_URL` | URL backend HTTPS ที่รวม `/api`; ถ้าไม่ใส่ CI ใช้ `/api` ซึ่งต้องมี reverse proxy |
| `NATIVE_API_URL` | URL backend HTTPS ที่เข้าถึงได้จากมือถือและรวม `/api`; ถ้าไม่ใส่ CI ใช้โดเมน `.invalid` และ manifest จะแจ้งว่ายังไม่ตั้งค่า |

API URL เป็นค่าที่ฝังใน client และเปิดเผยต่อผู้ใช้ได้ ห้ามใส่ token, password, client secret หรือ query string ที่เป็นความลับ Workflow จะปฏิเสธ URL ลักษณะนั้นก่อนสร้าง manifest

## เว็บบน Vercel

เชื่อม Git repo นี้ใน Vercel แล้วเลือก production branch ที่ต้องการ เช่น `DevTutor` เมื่อ push branch นี้ Vercel Git Integration จะ build และ deploy เว็บจาก commit นั้นอัตโนมัติ ตั้ง `EXPO_PUBLIC_API_URL` เป็น backend HTTPS จริงตาม [VERCEL.md](VERCEL.md) ก่อนใช้งาน ฟังก์ชัน API/ML/OCR และฐานข้อมูลต้องรันบน backend host ที่รองรับ Python และ PostgreSQL; Vercel static web ไม่ได้รันบริการเหล่านี้แทน

เว็บ production ที่เปิดอยู่จะตรวจ service worker รุ่นใหม่และให้ผู้ใช้กดยืนยันอัปเดต เพื่อรักษาข้อความหรือหลักฐานที่กำลังกรอก การ deploy เว็บไม่ได้ทำให้งานที่กำลังเปิดอยู่ reload ทันที Backend ต้องตั้ง CORS และ OAuth redirect allowlist ให้ตรงกับ domain เว็บจริงด้วย

ขณะนี้ไม่ได้เชื่อมบัญชี Vercel หรือประกาศเว็บสู่สาธารณะจาก workflow นี้ GitHub CI build สำเร็จไม่ใช่หลักฐานว่าเว็บ production deploy สำเร็จ หลังเชื่อม Git Integration ให้ตรวจ deployment status และ commit SHA ใน Vercel ด้วย

## อัปเดตแอพที่ติดตั้งแล้ว

Source sync และการส่ง update ให้มือถือที่ติดตั้งแล้วเป็นคนละขั้นตอน โปรเจกต์ปัจจุบันยังไม่มี `expo-updates`, Expo project ID หรือ native release build ที่กำหนด update channel จึงยังส่ง OTA จริงไม่ได้ อย่าใช้ JS export artifact แทน APK/IPA หรือกล่าวว่าอัปเดตถึงเครื่องผู้ใช้แล้ว

เมื่อเจ้าของแอพมีบัญชี Expo ให้เตรียมครั้งแรกตาม [EAS Update setup](https://docs.expo.dev/eas-update/getting-started/):

```bash
cd app
npx expo install expo-updates
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest update:configure
```

คำสั่งนี้เป็นขั้นตอนให้เจ้าของโครงการทำหลังเลือกบัญชีจริง ไม่ได้ถูกเรียกโดย CI และไม่สร้าง project ID สมมติ หลัง configure ให้ตรวจ config ที่เปลี่ยนจริง, `runtimeVersion`, update URL และ channel แล้วสร้าง Android/iOS native release build ที่ติดตั้งได้ พร้อมทดสอบ caller module, permissions และ provisioning บนอุปกรณ์จริงก่อนเผยแพร่

เพื่อออกเว็บกับ OTA รุ่นเดียวกัน ให้เลือก commit SHA ที่ checks ผ่าน ทดสอบ preview build ที่มี native runtime เดียวกับ production แล้ว deploy เว็บจาก SHA นั้นและ publish OTA จาก checkout SHA เดียวกัน บันทึก Vercel deployment และ EAS update group ไว้คู่กับ SHA ควรใช้ release channel แยก `preview`/`production` และ [runtime version policy](https://docs.expo.dev/eas-update/runtime-versions/) ที่รองรับ local native code เช่น `fingerprint`

ถ้าภายหลังเปิด EAS Update workflow จริง ให้ใส่ `EXPO_TOKEN` ใน GitHub Environment secret, ใช้ project ID จริงใน config, จำกัด production publishing เฉพาะ branch ที่เลือก และให้ workflow fail เมื่อ config/secret ขาด ห้ามเปิด publish จาก pull request ปัจจุบันยังไม่มี publish workflow จึงไม่ต้องใส่ token ตอนรัน checks/builds

การเปลี่ยน native module, Expo SDK, Android manifest, iOS extension/entitlements หรือ native dependency ต้องสร้าง binary ใหม่ที่มี runtime ที่เข้ากันได้ OTA เปลี่ยน native code ไม่ได้ ตาม [Expo runtime compatibility](https://docs.expo.dev/eas-update/how-it-works/) การส่งสอง platform ไม่ใช่ธุรกรรมเดียวกัน ถ้า deployment ฝั่งหนึ่งล้มเหลว ให้คงรุ่นเดิมหรือ rollback และตรวจสถานะทั้ง Vercel/EAS ก่อนบอกว่าซิงก์ production แล้ว

## Backend และข้อมูลร่วมกัน

แอพและเว็บควรชี้ backend production เดียวกัน บัญชี ประวัติที่บันทึก รายงานและข้อมูลที่ดูแลผ่าน admin จึงใช้ฐานข้อมูลร่วมกัน การ sync source ไม่ย้ายฐานข้อมูลอัตโนมัติ เมื่อเปลี่ยน schema ให้รัน Alembic migrations ด้วยแผน backup และรักษา API compatibility สำหรับมือถือรุ่นเก่าที่ยังติดตั้งอยู่
