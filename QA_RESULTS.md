# ผลการตรวจที่รันจริง

ตรวจล่าสุด 7 ตุลาคม 2026 (Asia/Bangkok), macOS ARM64, Python 3.12.14, Expo 55/React Native 0.83. ข้อมูลเดโม/ข้อมูล train และโดเมนทดสอบเป็นข้อมูลสังเคราะห์ ไม่ใช่หลักฐานการโกงจริง

| การตรวจ | ผลและขอบเขต |
|---|---|
| Backend + ML | **52 passed** (37 backend + 15 ML), 2 dependency warnings, 12.79s หลังแก้ UTC timestamp; provider HTTP ถูก mock แต่ RSA/JWT crypto ตรวจจริง |
| การแก้เวลา | SQLite คืน datetime ไม่มี timezone ทำให้ UI แสดง UTC เป็นเวลาท้องถิ่น; serialize UTC offset และ normalize imported offsets ก่อนบันทึก มี 2 regressions; ตรวจ API8009 และ UI แจ้งเตือนแสดง 13:45 ตามเวลาไทยตรงกันแล้ว |
| HTTP ฟังก์ชันจริง | 31 checks บน API8008: register/login/profile, URL inference, unknown phone/account/wallet → insufficient data, Thai OCR, QR image/payload, history/filter/share/export, pending report/feedback, batch completed/export, graph, LINE/caller status, account export/delete/session401; ใช้บัญชีตรวจชั่วคราวที่ลบแล้ว ไม่ส่ง LINE ภายนอก |
| Client flows | 8 OAuth checks + 4 actual-App privacy regressions ผ่าน (mock hooks/platform/HTTP); duplicate/cold callback, bounded retry, explicit link, logout และ late OCR/analysis/profile/history ไม่คืนข้อมูลเดิม |
| TypeScript / เว็บ | typecheck และ Expo web export --clear ผ่าน; frontend เชื่อม API8009 ใน local preview8081; source และ build เป็น login-first |
| UI browser จริง | ทดสอบ 320×740, 390×844, desktop1280×900, ภาษาไทย/อังกฤษ และ Light/Dark; login email, Google/LINE ที่ไม่มี config แสดงข้อความตรงตามจริง, session restore, 4 scan shortcuts, URL98.75/100, unknown phoneไม่มีคะแนน, save, actual overview, saved-HIGH alerts, FAQ search/expand, profile และ logout |
| การอัปเดต Webapp | ปุ่มอัปเดตปรากฏจาก waiting worker จริง; กดแล้ว reload/คืนเซสชันได้ และปุ่มอัปเดตหาย ไม่ได้ยืนยันว่าติดตั้ง standalone บนอุปกรณ์สำเร็จ |
| Worker tests / HTTP | ทดสอบ public allowlist, ไม่ดัก API/auth/OAuth query/Authorization/non-GET/foreign origin, cache-storage failure, redirected assets และ user-triggered update ผ่าน; manifest/icons192/512/180/HTML/SW ตอบ200 และ MIME ถูกต้อง |
| Native JavaScript | Expo Hermes export iOS/Android ผ่านหลัง UI หลัก/การปรับ header; ไม่ใช่ APK/IPA หรือ native device build |
| Native caller ก่อนหน้า | Android/iOS autolinking และ repeated prebuild/config-plugin checks ผ่าน; Swift Call Directory typecheck และ isolated unsigned simulator extension compile ผ่าน; full host/sign/device/call test ยังไม่ผ่านการยืนยัน |
| Activation checker | merged read-only/redacted config checker มี 12 assertions ผ่าน; production/required prerequisites ไม่ครบคืน exit1; ไม่เรียก OAuth และไม่ส่งข้อความ |
| Dependencies / models | pinned Python install/pip check ผ่าน; embeddings multilingual 384 dimensions โหลดจาก revisionจริง; SHAP/additivity/ML tests ผ่าน โมเดล sample-v1-6c6c58eff5 ฝึกจาก synthetic400แถว แยก connected campaign groups ไม่มี production accuracy claim |
| PostgreSQL / containers | SQLite + 5 Alembic migrations และ offline PostgreSQL migration SQL ผ่าน; Docker/PostgreSQL/Nginx runtime integration ยังไม่ได้ตรวจจริง |

## ภาพตรวจหน้าจอ

ภาพอยู่ใน outputs ข้างโครงการ: `scamgraph-dashboard-desktop.jpg`, `scamgraph-dashboard-mobile.jpg`, `scamgraph-login-desktop.jpg`, `scamgraph-login-mobile.jpg`. ใช้ Demo User และข้อมูลสังเคราะห์ ตัวเลข Dashboard มาจากประวัติที่บันทึกจริงของบัญชีเดโม ไม่เติมข้อมูลทะเบียน/เบอร์/เจ้าของบัญชีหรือสถิติสมมติ

## ข้อจำกัดที่ยังมีผล

Google/LINE ยังไม่มีโครงการ/credentials ตามคำตอบผู้ใช้ ไม่มีการ login ด้วย provider จริงหรือส่ง LINE จริง ต้องตั้งค่าตาม ACTIVATION.md และตรวจด้วยบัญชีเจ้าของที่ยินยอม iOS installed-PWA OAuth ยังต้องทดสอบจริงเพราะ browser-context/PKCE storage อาจต่างกัน ดู WEBAPP.md

Caller directory มีข้อมูลจริงที่ยืนยัน 0 รายการ Android ต้องมี JDK/Android SDK/native build และเลือก Call Screening role; iOS ต้อง signed host/extension/App Group และเปิด Call Directory ใน Settings เว็บและ Expo Go ไม่ตรวจสายเรียกเข้า iOS แสดง labels สำหรับรายการที่ sync เท่านั้น ไม่แสดง unknown-call app notification การปลอมเบอร์ยังเป็นข้อจำกัด

ยังไม่มี reputation/domain-age/ทะเบียนผู้ถือบัญชี/เครือข่ายมือถือ/บริการ deepfake ภายนอก ผลตัวอย่างที่ดูปลอดภัยในภาพ reference ไม่ถูกสร้างแทนข้อมูลที่ไม่มี โมเดลยังฝึกจาก synthetic data ต้องประเมินกับข้อมูลจริงที่มีสิทธิ์ใช้ก่อนรับรองความแม่นยำ

ระบบอนุมัติการควบคุมเบราว์เซอร์ปฏิเสธ `fileChooser.setFiles` ไป localhost8081 โดยระบุว่าผู้ใช้ไม่ได้ให้สิทธิ์ จึงไม่ได้ทำ UI-upload OCR ในรอบนี้ และไม่ใช้วิธีอื่นเลี่ยงการปฏิเสธ การทดสอบ OCR/QR ทาง API สำเร็จก่อนเหตุการณ์นี้ รอบก่อนเคยตรวจ OCR editable UI แล้ว

ไม่มีการ deploy/public publish, provider-account creation, cloud signing หรือยอมรับข้อตกลงแทนผู้ใช้ ไฟล์ source ZIP ไม่รวม dependencies/cache/ฐานข้อมูล/credentials/weights embedding ขนาดใหญ่

## การรวม Git และ Vercel

ตรวจจาก Git จริง `Desktop/UHackathon` แล้ว: install Python/Expo ตาม lockfilesผ่าน, backend/ML52passed+2warnings, client12flows, dev-supervisor6tests, PWAworkerและVercelroute/public-env checksผ่าน. Vercelconfigผ่าน official schema instance checksและ routing-utils แปลง routingได้ ไม่มีAPI/OAuth/assetsถูกrewriteเป็นหน้าlogin. GitHub Actionsผ่าน actionlint แต่ยังไม่ถือว่าjobบนGitHubสำเร็จจนเห็นrunจริง. SharedMetro8091/API8011รันจากGitproject; nativeJSและwebใช้ APIURL เดียวกัน.

โปรเจกต์ iOS ที่มีอยู่และภาพอ้างอิงของผู้ใช้ถูกเก็บไว้ Secrets, ฐานข้อมูล, dependencies, weightsembeddingและruntimeถูกignore. Rootpackage-lockเดิมของผู้ใช้ไม่ได้เขียนทับ; frontendใช้app/package-lock.json. Vercelบัญชียังไม่เชื่อม ไม่มีการอ้างว่าclouddeployหรือOTAส่งถึงเครื่องแล้ว.

ตรวจ sync จริง: เปลี่ยนข้อความใน shared LoginScreen ชั่วคราว เว็บ8091รับการแก้ผ่าน Fast Refresh โดยไม่ reload และ iOS dev bundleมีข้อความเดียวกัน/ชี้API8011 จากนั้นคืน sourceเดิมและยืนยันหน้าเว็บแล้ว. WebproductionexportจากGitrepoผ่าน. iOS Debug unsigned arm64 Simulator **host + embedded Call Directory extension buildผ่าน** ด้วย Xcode27.0/CocoaPods1.17.0 หลังแก้Podminimum12.4ให้ไม่น้อยกว่าhostminimum15.1ผ่านpost_install/pluginที่idempotent. ไม่แก้signing/team/hostminimum/extensionminimum ไม่ติดตั้งบนเครื่องจริงหรือทดสอบสายโทรเข้า.
