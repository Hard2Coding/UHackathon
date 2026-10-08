# ผลการตรวจที่รันจริง

ตรวจล่าสุด 7 ตุลาคม 2026 (Asia/Bangkok), macOS ARM64, Python 3.12.14, Expo 55/React Native 0.83. ข้อมูลเดโม/ข้อมูล train และโดเมนทดสอบเป็นข้อมูลสังเคราะห์ ไม่ใช่หลักฐานการโกงจริง

| การตรวจ | ผลและขอบเขต |
|---|---|
| Backend + ML | **52 passed** (37 backend + 15 ML), 2 dependency warnings, 12.79s หลังแก้ UTC timestamp; provider HTTP ถูก mock แต่ RSA/JWT crypto ตรวจจริง |
| การแก้เวลา | SQLite คืน datetime ไม่มี timezone ทำให้ UI แสดง UTC เป็นเวลาท้องถิ่น; serialize UTC offset และ normalize imported offsets ก่อนบันทึก มี 2 regressions; ตรวจ API8009 และ UI แจ้งเตือนแสดง 13:45 ตามเวลาไทยตรงกันแล้ว |
| HTTP ฟังก์ชันจริง | 31 checks บน API8008: register/login/profile, URL inference, unknown phone/account/wallet → insufficient data, Thai OCR, QR image/payload, history/filter/share/export, pending report/feedback, batch completed/export, graph, LINE/caller status, account export/delete/session401; ใช้บัญชีตรวจชั่วคราวที่ลบแล้ว ไม่ส่ง LINE ภายนอก |
| Client flows | **26 passed**: 8 OAuth + 14 actual-App privacy/integrity + 4 ReportsPage regressions (mock hooks/platform/HTTP); ครอบคลุมการแก้ draft, คำตอบสลับลำดับ, late save/export/batch, logout และการส่ง account/wallet ต่อด้วยชนิดเดิม |
| TypeScript / เว็บ | typecheck และ Expo web export --clear ผ่าน; frontend เชื่อม API8009 ใน local preview8081; source และ build เป็น login-first |
| UI browser จริง | ทดสอบ 320×740, 390×844, desktop1280×900, ภาษาไทย/อังกฤษ และ Light/Dark; login email, Google/LINE ที่ไม่มี config แสดงข้อความตรงตามจริง, session restore, 4 scan shortcuts, URL98.75/100, unknown phoneไม่มีคะแนน, save, actual overview, saved-HIGH alerts, FAQ search/expand, profile และ logout |
| การอัปเดต Webapp | ปุ่มอัปเดตปรากฏจาก waiting worker จริง; กดแล้ว reload/คืนเซสชันได้ และปุ่มอัปเดตหาย ไม่ได้ยืนยันว่าติดตั้ง standalone บนอุปกรณ์สำเร็จ |
| Worker tests / HTTP | ทดสอบ public allowlist, ไม่ดัก API/auth/OAuth query/Authorization/non-GET/foreign origin, cache-storage failure, redirected assets และ user-triggered update ผ่าน; manifest/icons192/512/180/HTML/SW ตอบ200 และ MIME ถูกต้อง |
| Native JavaScript | Expo Hermes export iOS/Android ผ่านหลัง UI หลัก/การปรับ header; ไม่ใช่ APK/IPA หรือ native device build |
| Native caller / Simulator | Android/iOS autolinking และ repeated prebuild/config-plugin checks ผ่าน; full arm64 iOS Simulator Debug host + embedded extension build ผ่านทั้ง unsigned compile และ normal local ad-hoc signing; ติดตั้ง/เปิดแอพและวิเคราะห์ข้อความผ่าน API8011 บน iPhone17/iOS26.5 ผ่าน UI จริง; physical-device signing/install และสายจริงยังไม่ได้ตรวจ |
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

## ตรวจต่อ: ผลตรวจตรงกับข้อมูล และ native app

ยืนยันปัญหาผ่านเว็บ8091: ตรวจข้อความ A แล้วกลับ Home แก้ draft เป็น B และเปิด Scan ยังเห็นผล A อยู่ แก้ให้ผลถือ input/kind snapshot ของตัวเอง การแก้ draft/type/เริ่มรายการใหม่ล้างผลเดิมและยกเลิก response เก่า Save/Share/Export/Report ใช้ข้อมูลของผลนั้น; export ตรวจ session/result/job ก่อน side effect แม้รอ native sharing อยู่ Report มีตัวเลือกประเภทและรักษา bare account/wallet เป็นชนิดเดิม

Browser retest: A66.20 → แก้ B → Scan แสดง input B โดยไม่มีผลเก่าหรือปุ่มบันทึกผลเก่า → ตรวจ B ได้23.78 → Report prefill เป็น B ถูกต้อง TypeScript, 26 client checks และ production web export ผ่านหลังแก้ shared code

Native UI จริงผ่าน DeviceHub ที่มากับ Xcode27: initial unsigned app อ่าน SecureStore ไม่ได้เพราะไม่มี application entitlements; normal local ad-hoc Simulator build แก้ได้โดยไม่แก้ทีม/signing ของโปรเจกต์หรือให้ permission เพิ่ม ติดตั้งโดยไม่ erase และเชื่อม Metro8091; login-first ไม่มี Keychain error, Guest Dashboard API connected และตรวจข้อความตัวอย่างได้66.20 ตรงกับเว็บ ภาพหลักฐานอยู่ใน outputs: `scamgraph-iphone-simulator.png`, `scamgraph-input-integrity.jpg`

## iOS startup recovery — 2026-10-08

- Reproduced the development setup on iPhone 17 Simulator, iOS 26.5. Current Expo 55.0.31 / React Native 0.83.10 / ExpoModulesCore 55.0.26 dependencies align. A fresh Metro session with `--clear` opened the installed app successfully without the reported `MessageQueue` startup error; no dependency downgrade or native rebuild was required. The exact cause in the previously served bundle remains unconfirmed.
- Updated standalone app start/web scripts to clear Metro cache and documented recovery in the English README. User dependency/Pod changes were preserved.
- Found a separate native rendering issue: after analysis, replacing the form with its result could leave the existing animated page container blank. Navigating away and back displayed the same result, confirming that the response and result content existed. Native MotionView now uses a static View; web entrance effects are retained.
- Verified normal development mode with Fast Refresh, login-first startup, guest Dashboard API connectivity, text analysis result rendering (66.20 for the existing synthetic demonstration input), and returning to a new analysis. This score is not real-world accuracy or a fraud probability. No result was saved to user history.
- TypeScript, 36 client flow/lifecycle checks, and diff whitespace validation passed. Native child-replacement regression covers mocked iOS and Android; the live device check used iOS Simulator only.
- Work remains on DevTutor. No commit, push, merge, or branch change was performed.
- Earlier iOS 27 check relied on a user-reported login screen and did not independently verify result interaction. The subsequent crash report confirmed a separate native scene-lifecycle failure; the verification below supersedes that limited observation. The freshly generated iOS development bundle contains the MessageQueue bridge declaration.


## iOS 27 scene lifecycle and npm workflow — 2026-10-08

- Read the supplied crash report: iPhone 18 Pro / iOS 27 terminated seven seconds after launch with EXC_BREAKPOINT in `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`. This occurs before app JavaScript startup. The installed Expo 55 host had no scene manifest and created its window in the legacy app delegate. [Apple's migration guide](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle) documents the iOS 27 scene requirement.
- Kept the pinned Expo 55 / React Native 0.83 dependencies. The host now declares one `UIWindowScene`; a manual SDK 55 scene adapter creates the scene window and starts the retained React Native factory. Cold/warm URLs, universal-link activities, and four foreground/background callbacks forward to the existing Expo app delegate. The caller extension and signing settings were preserved.
- Added the idempotent `withScamGraphScenes` config plugin, with original SDK 55 template and already-migrated-source regression fixtures. Prebuild regeneration preserves the adapter without requiring `--clean` or replacing the caller extension.
- Ran the root iOS npm launcher against the existing verified Metro8095/API8015 session. Xcode 27 Debug Simulator host/embedded extension build, install, and development-client link opening succeeded (zero errors, one existing build-script dependency warning).
- Independently verified the actual iPhone 18 Pro / iOS 27 UI: login-first screen → Guest → Dashboard with API connected → synthetic urgent-OTP text → visible result 66.20 with reasons. Pressed Simulator Home and reopened the app; the same process and result remained. The app stayed alive for several minutes, beyond the original seven-second failure. No result was saved to history.
- Screenshots: `scamgraph-ios27-login-fixed.png` and `scamgraph-ios27-result-fixed.png` in the task output folder. These are iOS 27 evidence; earlier screenshots above used iOS 26.5.
- Root `npm install` actually completed and verified/reused the locked frontend, Python API/OCR dependencies, and pinned 384-dimensional embedding model offline. `npm run dev` reused the verified paired session. The iOS launcher uses the checkout-local Expo CLI, supports Xcode 27 DeviceHub, starts/reuses shared API/Metro, and uses their actual ports; no manual venv activation or second API terminal is required.
- Fresh default startup: stopped only the previously created runner and the test app, then ran root `npm run ios` without port/device flags (QA disabled viewer activation only). The runner created API8000/Metro8081, waited for API/models, built/installed on the booted iPhone 18 Pro, and cold-opened the development-client URL. Independently verified native login → Guest/API connected → visible 66.20 result again. The web at localhost8081 used the same fresh API and returned 66.20 for the same sample.
- After the final launcher cancellation/config changes, verified real-session reuse with the current launcher and `npm run dev`; no duplicate servers were created. Explicit environment/.env conflicts are reported, and cancelling a newly started waiting runner stops only its owned services. Targeted regressions passed: installer 6, shared runner 16, iOS launcher 20, Xcode viewer 9, scene plugin 12 (63 total), plus TypeScript and whitespace validation.
- Fresh-session screenshots: `scamgraph-ios27-default-session.png` and `scamgraph-web-default-session.png` in the task output folder. No user history records were created by these guest analyses.
- Work remains uncommitted on DevTutor; no push, merge, or branch change was performed. Physical-device installation, real incoming calls, production provider credentials, Vercel deployment, and real-world model accuracy are outside these checks.


## Current launcher repair and stale-network recovery — 2026-10-08

- Reproduced a new startup blocker in the current working-tree `scripts/ios.cjs`: a missing opening brace left an extra closing brace, and a duplicate readiness-function body was pasted at top level. `node --check` failed before any native launch. Applied two focused syntax repairs, retaining the expanded formatting and equivalent help text. Preserved the pre-repair source in ignored `.runtime/ios-before-syntax-repair.cjs`; the existing `.save` file was left intact.
- Independently compared the repaired script with the previously verified staged implementation: remaining initial differences were formatting and equivalent concatenated help text. Subsequent intentional launcher changes below have dedicated checks.
- Reproduced a separate wait: old session Metro8081 and localhost8000 API health were healthy, while the stored LAN API address timed out after the network changed. The earlier launcher retried for 180 seconds with a misleading models message.
- Fresh default Simulator launch now uses localhost unless host configuration or explicit device selection is supplied. Healthy existing sessions and explicit API URLs remain honored. If a configured API address fails while the local API is ready, the launcher reports that specific connection failure promptly with stop/restart guidance; genuine API/model initialization continues to wait normally.
- Added `npm run stop`: verifies the session root/schema/PID plus Node runner script and working directory, rechecks before signaling, and uses the runner's own graceful shutdown. It refuses foreign/replaced identities, reports a bounded timeout, and needs no healthy API or network address. It does not erase databases or simulator contents.
- Actual live check: root `npm run stop` stopped the owned API/Metro pair, then root `npm run ios` without port/device/host flags started a new localhost API8000/Metro8081 pair, built/installed/opened on the booted iPhone 17 / iOS 26.5. Build succeeded with zero errors and one existing script-dependency warning. The current login screen and Guest Dashboard API connection were independently observed through DeviceHub.
- A no-booted-simulator check before the final restart also auto-booted iPhone 17 and completed build/install/open. DeviceHub initially retained a different selected simulator; selected the actual target in its sidebar. Do not infer viewer selection from a successful app-process launch alone.
- Current-run screenshot: `scamgraph-current-login-repaired.png` in the task output folder. All source changes remain uncommitted on DevTutor; the user-controlled Git staging was not modified.
- Final verification after stop/restart: Guest text analysis returned a visible 66.20 result through the new localhost session. Screenshot `scamgraph-current-result-repaired.png` records this run. The result is from the synthetic demonstration input, not a fraud probability or accuracy measurement; no history record was saved.
- Launcher/viewer/scene checks passed (24/9/12), plus Node syntax and whitespace checks. A final stop regression exposed a shutdown race after 11 of 12 stop checks passed: a runner could exit during read-only inspection and be incorrectly classified as a changed PID. The corrective stop verification is recorded below. DeviceHub activation uses ordinary app activation and names the simulator to select; legacy Simulator retains its supported UDID argument. No guessed DeviceHub URL or AppleScript was added.
- Corrected the stop race with a post-inspection liveness check and bounded waiting for unreadable/exiting identities, while still refusing a confirmed replacement PID. Added three deterministic regressions. Final stop checks passed 15/15 (launcher/viewer/scenes remain 24/9/12, 60 targeted checks total). A subsequent actual `npm run stop` succeeded, then default `npm run ios` rebuilt/installed/opened successfully; the final visible screen was login-first on iPhone 17. No Git staging or commits were changed.
