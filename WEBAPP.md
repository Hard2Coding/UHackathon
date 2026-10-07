# ScamGraph AI Webapp

Webapp ใช้หน้าจอและ API จริงชุดเดียวกับแอพมือถือ รองรับจอมือถือ แท็บเล็ต และเดสก์ท็อป เปิดมาที่หน้าโลโก้และตัวเลือกเข้าสู่ระบบก่อน การตรวจข้อความ ลิงก์ OCR/QR ประวัติ กราฟ รายงาน และการจัดการข้อมูลยังต้องเชื่อมต่อ backend

## สร้างและเปิด

หลังติดตั้ง dependencies ตาม README ให้ตั้ง `EXPO_PUBLIC_API_URL` เป็น API ที่ browser เข้าถึงได้ ก่อน build ค่า `EXPO_PUBLIC_*` จะฝังใน JavaScript จึงห้ามใส่ client secret, LINE access token หรือข้อมูลส่วนตัว

```sh
source scripts/env.sh
cd app
EXPO_PUBLIC_API_URL=https://api.your-domain.example/api npm run build
```

ตัวอย่างโดเมนข้างบนต้องเปลี่ยนเป็นโดเมนจริง การ build เรียก `scripts/export_webapp.cjs` หลัง Expo export เพื่อสร้าง manifest, ไอคอน, service worker และข้อมูลรุ่น public shell ใน `app/dist/webapp-build.json` อัปโหลด `app/dist` ไป static host และให้ `/api` ไป FastAPI ตาม `app/nginx.conf` หรือใช้ backend HTTPS แยกโดเมนพร้อม CORS ที่ระบุ origin จริง ไม่มีการ deploy ไปบัญชีภายนอกอัตโนมัติ

สำหรับทดสอบ production export บนเครื่อง:

```sh
.venv/bin/python -m http.server 8081 --bind 127.0.0.1 --directory app/dist
```

Service worker ใช้ HTTPS หรือ localhost เท่านั้น การเปิดผ่าน IP ใน LAN แบบ HTTP จะไม่รองรับ PWA/กล้องในหลาย browser ต้องให้ API และหน้าต่างเว็บเข้าถึงกันได้จริงด้วย [Expo: progressive web apps](https://docs.expo.dev/guides/progressive-web-apps/)

## การติดตั้ง

Chrome/Edge ที่รองรับจะแสดงตัวเลือกติดตั้งเมื่อ browser อนุญาต `beforeinstallprompt` ปุ่มในแอพเรียก prompt จริงและไม่รายงานว่าติดตั้งสำเร็จจนได้รับ `appinstalled` หรือเปิดในโหมด standalone หากไม่มี prompt ให้ใช้เมนูติดตั้งของ browser ตามที่ browser รองรับ บน iPhone/iPad เปิดผ่าน Safari แล้วใช้ Share → Add to Home Screen การมี manifest ไม่รับประกันว่า browser ทุกตัวจะมีปุ่มติดตั้ง [MDN: installation prompt](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt)

Webapp ที่ติดตั้งยังเป็นเว็บ จึงไม่มีสิทธิ์ตรวจสายโทรศัพท์เข้าแบบ native ให้ใช้แอพ Android/iOS สำหรับคุณสมบัตินั้น

Google/LINE Login บน **Webapp ที่ติดตั้งใน iOS** ยังต้องทดสอบด้วยบัญชีและเครื่องจริง WebKit แยก storage ของ Home Screen app ออกจาก browser และการนำทางออกนอก scope อาจเปิด browser อีก context ขณะที่ flow นี้เก็บ pending PKCE ใน sessionStorage จึงมีข้อสันนิษฐานว่าบางรูปแบบการกลับจาก provider อาจอ่าน verifier เดิมไม่ได้ ยังไม่ได้ยืนยันว่าเกิดกับ flow นี้บนเครื่องจริง ห้ามแก้ด้วยการใส่ verifier ใน URL หรือข้าม PKCE การเข้าสู่ระบบโดยตรงในแอพอยู่ใน origin เดิม [web.dev: PWA windows and authentication](https://web.dev/learn/pwa/windows?hl=en), [WebKit: Home Screen app storage](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)

## ออฟไลน์และความเป็นส่วนตัว

Service worker เก็บเฉพาะ HTML shell, JavaScript/CSS ที่ build, ฟอนต์ ไอคอน และภาพประกอบที่มากับแอพ รายการไฟล์ถูกกำหนดจาก build และไม่เพิ่ม response ตอนใช้งานจริง ไม่มีการ cache API, token, ประวัติ, ผลวิเคราะห์, รูปที่ผู้ใช้อัปโหลด หรือ CSV; ไม่ดัก request แบบ non-GET, Authorization, query string รวมถึง OAuth callback หรือ origin อื่น

เมื่อเปิด shell ที่เคยโหลดแล้วขณะออฟไลน์ แอพอาจแสดงหน้า UI ได้ แต่การวิเคราะห์และข้อมูลส่วนตัวยังต้องเชื่อมต่อ backend ไม่มีผลตรวจจำลองหรือการนำผลเก่ามาแสดงเป็นผลใหม่ `useWebapp().online` เป็นเพียงสถานะเครือข่ายที่ browser แจ้ง ไม่ยืนยันว่า API พร้อมใช้งาน การเก็บ session ของบัญชีเป็นหน้าที่ของ account storage เดิม และล้างตามกระบวนการออกจากระบบ ไม่ใช่ service worker cache

OAuth query string ผ่านไปยัง network โดยตรง และหน้า HTML กำหนด no-referrer การกลับจาก provider ขณะไม่มีเครือข่ายอาจเปิดไม่สำเร็จ ต้องเชื่อมต่อแล้วเริ่ม flow ใหม่เมื่อ code หมดอายุ ไม่มี app session token ใน URL

เมื่อมี build ใหม่ แอพแสดงสถานะอัปเดตและรอผู้ใช้กดก่อน activate/reload เพื่อไม่ตัดการแก้ไขข้อความ/หลักฐานกลางทาง เมื่อ activate แล้วล้างเฉพาะ cache รุ่นเก่าที่ใช้ prefix ของ ScamGraph จัดส่ง `service-worker.js` ด้วย `Cache-Control: no-cache` และ manifest ด้วย MIME `application/manifest+json` [MDN: service worker lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)

## ตรวจสอบ

```sh
node scripts/test_webapp.cjs
.venv/bin/python scripts/check_activation.py
```

Worker checks ทดสอบการไม่ดักข้อมูลส่วนตัว/OAuth/API, offline shell, การล้าง cache รุ่นเก่า และอัปเดตเมื่อผู้ใช้ร้องขอ เป็นการทดสอบ JavaScript ของ worker ไม่ใช่หลักฐานว่าติดตั้งบน browser หรืออุปกรณ์จริงสำเร็จ ต้องตรวจการติดตั้ง ออฟไลน์ และอัปเดตบน browser ที่จะให้ผู้ใช้ใช้งานก่อนเผยแพร่

`useWebapp()` ใน `app/src/webapp.ts` ส่งสถานะ online/installed/canInstall/installHint/workerState/updateReady และคำสั่ง `install()`/`applyUpdate()` โดยไม่อ่านข้อมูลบัญชีหรือผลตรวจ
