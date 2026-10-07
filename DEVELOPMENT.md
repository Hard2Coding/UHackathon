# พัฒนาแอพและเว็บจากโค้ดชุดเดียว

มือถือ Android/iOS และ Webapp ใช้ `app/App.tsx`, `app/src/` และ assets ชุดเดียวกันใน Git repository นี้ API และโมเดลอยู่ที่ `backend/` และ `ml/` ทั้งสองหน้าจอจึงใช้ข้อมูลผู้ใช้ ประวัติ และผลตรวจจาก API เดียวกัน เมื่อแก้หน้าจอร่วมและบันทึกไฟล์ระหว่างพัฒนา Expo Fast Refresh จะอัปเดตทั้งเว็บและแอพที่เปิด development build อยู่

## เริ่มพร้อมกัน

ต้องใช้ Node.js 22 ขึ้นไป และ Python 3.12 ติดตั้ง dependencies ครั้งแรกด้วยคำสั่งนี้จากโฟลเดอร์ repository:

```bash
bash scripts/bootstrap.sh
npm run dev
```

`npm run dev` เปิด API พร้อม reload ที่พอร์ต 8000 และ Expo Metro **เพียงตัวเดียว** ที่พอร์ต 8081 เว็บเปิดที่ `http://localhost:8081/` ส่วนแอพมือถือเชื่อมต่อ Metro ตัวเดียวกัน API ใช้ SQLite local demo อย่างชัดเจน พร้อม migrations และข้อมูลตัวอย่าง ไม่ใช่ฐานข้อมูล production

Runner เลือก IPv4 ของเครื่องบนเครือข่าย LAN ให้ API ของทั้งสองหน้าจอโดยอัตโนมัติ โทรศัพท์ต้องอยู่ Wi-Fi เดียวกับเครื่องพัฒนาและต้องเชื่อมถึงพอร์ตเหล่านี้ หากมี VPN หรือหลาย network interface ให้ระบุ IP เอง:

```bash
DEV_HOST=192.168.1.25 npm run dev
```

หากพอร์ตถูกใช้งานอยู่ ระบบจะแจ้งและไม่หยุดเซิร์ฟเวอร์เดิม เลือกพอร์ตใหม่ได้:

```bash
API_PORT=8011 EXPO_PORT=8091 DEV_HOST=192.168.1.25 npm run dev
```

กด Ctrl+C เพื่อหยุดเฉพาะ API และ Expo ที่คำสั่งนี้สร้าง ตรวจแผนโดยไม่เปิดเซิร์ฟเวอร์ได้ด้วย `npm run dev -- --dry-run` และดู options ด้วย `npm run dev -- --help`

## ใช้ URL ที่กำหนดเอง

`EXPO_PUBLIC_API_URL` จาก environment หรือ `.env` ที่ root มีความสำคัญเหนือ URL ที่ runner สร้าง และต้องเป็น URL เต็มที่ลงท้าย `/api` ค่านี้เป็นข้อมูลสาธารณะ ห้ามใส่ token หรือ secret:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.25:8011/api API_PORT=8011 npm run dev
```

`localhost` บนโทรศัพท์หมายถึงโทรศัพท์เอง จึงใช้เรียก API ของคอมพิวเตอร์ไม่ได้ Android emulator อาจใช้ `http://10.0.2.2:8000/api` ส่วน iOS simulator ใช้ localhost ของเครื่อง Mac ได้ หาก API อยู่บนเซิร์ฟเวอร์ที่เปิดใช้งานแล้ว ให้ข้ามการเปิด API ในเครื่อง:

```bash
EXPO_PUBLIC_API_URL=https://api.your-domain.example/api npm run dev -- --remote-api
```

ค่า `CORS_ORIGINS` และ `OAUTH_REDIRECT_ALLOWLIST` สำหรับเว็บพัฒนาในเครื่องจะเพิ่ม origin ของ localhost และ LAN ตามพอร์ตที่เลือก โดยคงค่าที่ตั้งไว้เดิม การตั้งค่านี้ทำเฉพาะ subprocess ในโหมด development ไม่แก้ `.env` และไม่เปลี่ยนค่า production Google/LINE ต้องลงทะเบียน callback และมี credentials จริงก่อนใช้งานตาม `ACTIVATION.md`

## รันแต่ละช่องทาง

| คำสั่งจาก root | สิ่งที่เปิด |
| --- | --- |
| `npm run dev` | API reload + เว็บ + Metro สำหรับ development build มือถือ |
| `npm run web` | API reload + เปิดเว็บ; ใช้ shared source เดิม |
| `npm run mobile` | API reload + Metro สำหรับมือถือ โดยไม่สั่งเปิดเว็บ |
| `npm run api` | API local demo อย่างเดียว |
| `npm run dev:go` | API + เว็บ + Expo Go สำหรับฟังก์ชันหลัก |
| `npm run android` | สร้างและติดตั้ง development build บน Android/emulator โดยไม่เปิด Metro ซ้ำ |
| `npm run ios` | สร้างและติดตั้ง development build บน iOS simulator/device ผ่าน Xcode โดยไม่เปิด Metro ซ้ำ |
| `npm run build:web` | export เว็บที่ `app/dist/` |
| `npm run typecheck` | ตรวจ TypeScript ของ shared app |
| `npm run test:dev` | ตรวจ URL/พอร์ตและการจัดการ process ของ runner |

ค่าเริ่มต้นใช้ `--dev-client` เพราะฟังก์ชันตรวจสายเรียกเข้าใช้ native module ที่ Expo Go ไม่มี Android ต้องมี JDK/Android SDK และ iOS ต้องมี macOS/Xcode/CocoaPods พร้อม signing ตามอุปกรณ์ที่เลือก การตรวจสายต้องให้สิทธิ์และเปิด role/extension บนเครื่องจริง เว็บและ Expo Go แสดงข้อจำกัดอย่างตรงไปตรงมา

คำสั่ง `android`/`ios` ใช้ `--no-bundler` เพื่อไม่สร้าง Metro อีกตัว ให้เปิด `npm run dev` ใน terminal อีกหน้าต่างและเชื่อม development client กับ Metro ที่ runner แสดง

ตรวจ iPhone 17 Simulator (iOS 26.5) กับ Metro8091/API8011 ผ่านแล้ว บน Xcode27 เครื่องมือหน้าจออุปกรณ์อยู่ที่ `Xcode.app/Contents/Applications/DeviceHub.app` ใช้ Debug build ที่มีการ sign สำหรับ Simulator ตามปกติ; การปิด signing ด้วย `CODE_SIGNING_ALLOWED=NO` ทำให้ application entitlements ขาดและ SecureStore อ่าน Keychain ไม่ได้ Local ad-hoc Simulator signing ไม่ใช่ provisioning สำหรับโทรศัพท์จริง

หากต้องการฐานข้อมูลที่ตั้งผ่าน `DATABASE_URL` แทน SQLite ให้ใช้ `npm run dev -- --configured-db` คำสั่งพัฒนานี้ตั้ง `APP_ENV=development` เสมอ จึงควรชี้ไปฐานข้อมูลพัฒนาเท่านั้น

## อัปเดตพร้อมกันอย่างไร

แก้ UI หรือ logic ร่วมใน `app/` เพียงครั้งเดียว แล้ว commit เข้า repository เดียว ทั้ง mobile และ web ใช้ commit เดียวกัน ระหว่างพัฒนา Fast Refresh ทำงานกับทั้งสองช่องทาง; การแก้ environment ต้องเริ่ม dev server ใหม่ และการแก้ native module/permission/plugin ต้องสร้างแอพ native ใหม่

สำหรับผู้ใช้งานจริง Git push อย่างเดียวไม่ได้ติดตั้งแอพเวอร์ชันใหม่ให้โทรศัพท์ เว็บต้อง build/deploy ส่วนแอพ native ต้องผ่านการอัปเดตจากช่องทางที่ติดตั้ง หรือ OTA ที่ตั้งค่าและลงนามไว้แล้ว OTA อัปเดตได้เฉพาะ JavaScript/assets ที่เข้ากันกับ native runtime และไม่แทนการสร้างใหม่เมื่อมี native code เปลี่ยน จึงควรเผยแพร่เว็บและแอพจาก tag/version เดียวกันเพื่อควบคุมความเข้ากันได้

OAuth secrets, LINE token, signing credentials และ `.env` ต้องอยู่นอก Git เสมอ Root package ไม่เพิ่ม dependencies ซ้ำ; lockfile ของแอพอยู่ที่ `app/package-lock.json` และ bootstrap ติดตั้งจาก lockfile นั้น
