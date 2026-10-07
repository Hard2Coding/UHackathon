# เปิดการเชื่อมต่อจริง

ระบบมีขั้นตอน OAuth, LINE Messaging API และ native caller directory แล้ว การเปิดใช้งานจริงต้องมีบัญชีผู้ให้บริการ โดเมน/backend ที่เข้าถึงได้ และสิทธิ์บนเครื่องผู้ใช้ ไม่สามารถใช้ค่าตัวอย่างแทน credentials จริงได้

## ตรวจสถานะโดยไม่เปิดเผย secret

```sh
.venv/bin/python scripts/check_activation.py
.venv/bin/python scripts/check_activation.py --production
```

คำสั่งแรกอ่าน `.env` และ environment ของ process แล้วแสดงเฉพาะสถานะ/ชื่อค่าที่ขาด ไม่แสดงค่าของ client secret, token, URI ฐานข้อมูล หรือ user ID ไม่เรียก provider และไม่ส่งข้อความ `--production` คืน exit code 1 เมื่อการตั้งค่าสำหรับ production ยังไม่ครบ การตรวจ local config ไม่ยืนยันว่า credentials ถูกต้อง login สำเร็จ webhook เข้าถึงได้ หรือ LINE ส่งถึงผู้รับจริง หลังแก้ `.env` ต้องเริ่ม backend process ใหม่ด้วย environment ใหม่ และ build frontend ใหม่เมื่อเปลี่ยน `EXPO_PUBLIC_API_URL`

หากต้องการตรวจ backend ที่กำลังทำงาน ให้เพิ่ม `--api-url http://localhost:8000/api` (เปลี่ยน port/HTTPS domain ให้ตรงกับระบบ) จะอ่านเฉพาะ public health/providers/caller directory แล้วคืนสถานะที่ปกปิดตัวระบุ ไม่เรียก auth หรือส่งข้อความ `--web-origin http://localhost:8081` ตรวจว่า URL กลับหน้าเว็บอยู่ใน allowlist และ `--require google --require line_messaging` คืน exit code 1 ถ้า prerequisites ที่ระบุยังไม่ครบ คำสั่งเหล่านี้ไม่ทดแทนการ login หรือการรับ webhook จริง

ยังไม่มี `.env` ที่มี credentials จริงในการตรวจครั้งนี้ ปุ่มที่ผู้ให้บริการยังไม่พร้อมแสดงสถานะตาม `/api/auth/providers` และไม่จำลองการเข้าสู่ระบบ

## Google Login

1. สร้าง OAuth client แบบ **Web application** ใน Google Cloud/Google Auth Platform สำหรับ backend flow นี้ ตั้งหน้าความยินยอมและบัญชีผู้ทดสอบตามสถานะโครงการ
2. ลงทะเบียน Authorized redirect URI ให้ตรงกับ `https://<API-domain>/api/auth/oauth/google/callback` ทุกตัวอักษร URI นี้เป็น backend callback; ไม่ใช่หน้าเว็บของแอพและไม่ใช่ `scamgraph://oauth`
3. เก็บ `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` ใน backend `.env` หรือ secret manager ของ host โดยตรง ห้ามส่ง secret ในแชท ห้ามใช้ชื่อ `EXPO_PUBLIC_*` กับ secret
4. ตั้ง `OAUTH_REDIRECT_ALLOWLIST` เป็นปลายทาง frontend จริงพร้อม `/` ท้าย origin และ `scamgraph://oauth` สำหรับ native เช่น `https://<web-domain>/,scamgraph://oauth` ตั้ง `CORS_ORIGINS` เป็น origin ของเว็บโดยไม่มี path
5. ทดสอบจากหน้า login จริง ตรวจ session restore/logout และ account-link flow บัญชีเดิมที่อีเมลตรงกันต้อง sign in แล้วกดเชื่อม Google อย่างชัดเจน ระบบไม่รวมบัญชีจากอีเมลโดยอัตโนมัติ

Google อนุญาต localhost สำหรับ development ตามกฎ redirect ของ provider; production ใช้ HTTPS และโดเมนจริง [Google: web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)

## LINE Login และแจ้งเตือน

1. สร้าง LINE Login channel และ LINE Official Account/Messaging API channel ภายใต้ **LINE Provider เดียวกัน** เพราะ LINE user ID ของ flow login ต้องตรงกับผู้ติดตาม Official Account
2. ลงทะเบียน LINE Login callback `https://<API-domain>/api/auth/oauth/line/callback` และเก็บ `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET`, `LINE_REDIRECT_URI` ใน backend environment
3. เก็บ `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET` ของ Messaging API channel และ `LINE_OFFICIAL_ACCOUNT_ID` รูปแบบ `@...` ใน backend environment ตั้ง `LINE_MESSAGING_SAME_PROVIDER=true` หลังตรวจว่าทั้งสอง channel อยู่ Provider เดียวกันจริง
4. ตั้ง webhook URL เป็น `https://<API-domain>/api/notifications/line/webhook`, เปิดใช้ webhook และทดสอบการเชื่อมต่อ ระบบตรวจลายเซ็นด้วย raw body จึงห้าม proxy เปลี่ยน JSON/body ก่อนถึง backend
5. ผู้ใช้ sign in/เชื่อม LINE ของตนเอง แล้วเพิ่มเพื่อน Official Account ให้ backend รับ signed `follow` webhook หลังจากนั้นจึงเปิดความยินยอมแจ้งเตือนในหน้า settings
6. ทดสอบด้วยบัญชีของผู้ใช้ที่ยินยอม: บันทึกผล HIGH แล้วตรวจสถานะการส่ง ข้อความส่งเฉพาะผลที่บันทึกและปกปิด input/ตัวระบุส่วนบุคคล `sent` หมายถึง LINE ยอมรับคำขอ ไม่ยืนยันว่าผู้รับอ่านข้อความแล้ว ไม่ส่งไป arbitrary recipient ID

ใช้ LINE Messaging API แทน LINE Notify ไม่ควรเปิด toggle ด้วย token ปลอม หรือ bypass การเชื่อมบัญชี/เพื่อนเพื่อทำให้หน้าจอดูพร้อม [LINE Login](https://developers.line.biz/en/docs/line-login/integrate-line-login/), [LINE webhook](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)

## ตรวจสายเรียกเข้า

Android ต้องเป็น native build ที่มีโมดูล `scamgraph-caller` ให้ผู้ใช้เลือกแอพเป็น Call Screening app (Android 10+) และให้สิทธิ์ notification เมื่อระบบร้องขอ การตรวจใช้ verified directory ที่ sync ไว้ในเครื่อง ไม่เปิดเสียงสาย ไม่ส่งเบอร์ที่โทรเข้าไป backend เบอร์ที่ไม่มีหลักฐานรายงานว่าข้อมูลไม่เพียงพอ ไม่รายงานว่าปลอดภัย [Android CallScreeningService](https://developer.android.com/reference/android/telecom/CallScreeningService)

iPhone ต้อง build/sign host และ Call Directory extension พร้อม App Group entitlement ที่ตรงกัน แล้วเปิด extension ใน Settings ของระบบ รายการที่ sync สามารถแสดง label สำหรับเบอร์ที่อยู่ใน directory ส่วนเบอร์อื่นไม่ส่ง incoming number ให้ JavaScript และไม่สร้างแจ้งเตือนของแอพแบบ Android รายการที่ระบบ import อาจคงอยู่จน reload Live Caller ID Lookup เป็นอีกบริการหนึ่งที่ต้องจัดเตรียมตามข้อกำหนด Apple และยังไม่ได้เชื่อมในโครงการนี้ [Apple Call Directory](https://developer.apple.com/documentation/callkit/identifying-and-blocking-calls)

Expo Go และ Webapp ไม่มีระบบ caller screening นี้ ต้องติดตั้ง native build บนอุปกรณ์จริงเพื่อทดสอบสายเข้า Directory รับเฉพาะหลักฐาน confirmed/reviewed ที่ไม่ใช่ข้อมูล sample; ชุดตัวอย่างไม่ทำให้มีรายชื่อเบอร์จริงขึ้นมา ต้องนำเข้าแหล่งข้อมูลที่มีสิทธิ์ใช้งานและตรวจหลักฐานก่อนเผยแพร่

## ก่อนให้สังคมใช้งานจริง

ตั้ง `APP_ENV=production`, `ENABLE_DEMO_SEED=false`, PostgreSQL, HTTPS, CORS/redirect ที่จำกัด และ model/artifact ที่ผ่านการประเมินกับข้อมูลจริง แยก secrets ออกจาก source/ZIP โมเดล sample ที่แนบเป็นข้อมูลสังเคราะห์ จึงไม่ควรใช้ metrics ของ sample เป็นคำรับรองความแม่นยำในโลกจริง ทดสอบ Google/LINE ด้วยบัญชีจริงที่ได้รับอนุญาต, signed follow/unfollow, session/logout, browser installation/update, database migration และ caller directory บนรุ่นอุปกรณ์เป้าหมาย
