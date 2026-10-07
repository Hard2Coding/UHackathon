# เว็บบน Vercel และโค้ดร่วมกับแอพ

ใช้ repository เดียวกันทั้งหมด: `app/App.tsx`/`app/src` เป็นหน้าจอร่วมมือถือและเว็บ, `shared` เป็นสัญญา API และ `backend`/`ml` เป็นบริการกลางที่ทั้งสองฝั่งเรียกใช้ ไม่แยกสำเนา UI เพื่อแก้สองครั้ง

## การตั้งค่าโครงการ Vercel

Import repository `Hard2Coding/UHackathon` ในบัญชี Vercel ของเจ้าของ แล้วตั้ง **Root Directory เป็นราก repo** (เว้นว่าง/`.`), Framework Preset **Other** และเลือก production branch ที่ต้องการ ปัจจุบันงานของแอพอยู่บน `DevTutor`; branch `main` ยังเป็นโครงการเริ่มต้น

`vercel.json` ที่รากกำหนดไว้แล้ว:

| รายการ | ค่า |
|---|---|
| Install | `npm ci --prefix app` |
| Build | `node scripts/check_web_env.cjs --production && npm run build:web` |
| Output | `app/dist` |
| Frontend | Expo web export แบบ SPA + PWA |
| Backend | FastAPI/ML บน HTTPS host ของคุณ |

ใน Environment Variables ของ Vercel ให้ใส่ **`EXPO_PUBLIC_API_URL`** เป็น URL จริงของ backend ที่ลงท้าย `/api` เช่น `https://<โดเมน-backend>/api` และเลือก environment ที่ต้องใช้ ต้องเปลี่ยน placeholder เป็นโดเมนจริงก่อน deploy ตัวแปรนี้เป็น URL สาธารณะที่ฝังใน frontend ไม่ใช่ secret

ห้ามใส่ Google client secret, LINE access token, database password หรือ LLM key ใน `EXPO_PUBLIC_*` ค่าเหล่านี้อยู่เฉพาะ backend การ build สำหรับ deployment จะไม่ผ่านเมื่อ URL ยังเป็น localhost, IP เครือข่ายภายใน, HTTP หรือโดเมนตัวอย่าง และจะไม่พิมพ์ค่าของ secret ออก log

การตั้งค่าใน repo นี้ให้บริการเว็บ static และเชื่อม API ภายนอก Vercel รองรับ FastAPI/Functions/Services และโมเดลขนาดใหญ่ได้ด้วย แต่การย้าย backend ที่มี OCR, upload และ durable jobs ต้องจัด persistence/runtime ให้เหมาะสม การตั้งค่านี้ยังไม่ย้าย backend ไป Vercel และไม่ rewrite `/api` เป็นหน้า login ต้องมี backend ที่รันจริงและเข้าถึงได้ก่อนใช้งานตรวจสอบออนไลน์

## อัปเดตจาก Git

หลังเชื่อม Vercel กับ repository การ push ไป branch ที่ติดตามจะทำให้ Vercel build/deploy ตาม Git integration เว็บและ mobile build ใช้ source commit เดียวกัน GitHub Actions ตรวจและสร้าง artifacts ทั้งสองแพลตฟอร์มพร้อม release manifest ที่ระบุ Git SHA แต่ไม่ได้หมายความว่าแอพที่ติดตั้งในโทรศัพท์ได้รับ OTA แล้ว

เปิด EAS Update เพิ่มภายหลังเมื่อมี Expo project และ release build ที่ติดตั้ง `expo-updates`/runtime/channel ถูกต้อง ดู `RELEASES.md` การแก้ native module, permission หรือ SDK ต้องสร้าง binary ใหม่ การอัปเดตเว็บไม่สามารถติดตั้ง native code ให้โทรศัพท์เองได้

## เชื่อม backend และล็อกอิน

ตั้ง `CORS_ORIGINS` ที่ backend ให้มี origin ของเว็บ Vercel จริง เช่น `https://<project>.vercel.app` และตั้ง `OAUTH_REDIRECT_ALLOWLIST` ให้มี URL นั้นพร้อม `/` ท้าย เช่น `https://<project>.vercel.app/,scamgraph://oauth` Google/LINE provider callback ยังคงเป็น HTTPS callback ของ **backend** ตาม `ACTIVATION.md`

Preview deployment แต่ละ URL ต้องได้รับอนุญาตแบบ explicit หากต้องการทดสอบ login/API จาก URL นั้น ไม่เพิ่ม wildcard ครอบคลุมทุก Vercel project Google/LINE ยังไม่พร้อมจนกว่าจะสร้างโครงการและตั้ง credentials จริง

## ตรวจบนเครื่อง

```sh
node scripts/test_vercel.cjs
EXPO_PUBLIC_API_URL=https://<backend-จริง>/api node scripts/check_web_env.cjs --production
npm run build:web
```

Header ของ service worker/manifest ไม่ cache เวอร์ชันเก่า หน้า static ไม่แทนที่ API/assets ที่ไม่มีอยู่ การอัปเดต PWA ยังรอผู้ใช้เลือกอัปเดตเพื่อไม่ทิ้งงานที่กำลังแก้ไข ไม่เก็บผลตรวจ/API/OAuth ใน service-worker cache

ตรวจ schema/config และ build บนเครื่องไม่ยืนยันว่า deploy บนบัญชี Vercel สำเร็จหรือ backend พร้อมใช้งานจริง ต้องเชื่อมบัญชี/import repo และยืนยันโดเมนกับ API หลัง deploy

อ้างอิง: [Expo: publish to Vercel](https://docs.expo.dev/guides/publishing-websites/#vercel), [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json), [Vercel Git builds](https://vercel.com/docs/builds)
