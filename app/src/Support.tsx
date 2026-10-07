import React, { useEffect, useState } from "react";
import { View, Pressable, Linking, ActivityIndicator } from "react-native";
import { Bell, ShieldAlert, ChevronDown, ChevronUp, BookOpen, MessageCircle, ArrowRight, Download, Globe, RefreshCw } from "lucide-react-native";
import { Txt, Panel, Button, Field, Heading, Empty, Note, useUI, useCopy, Pill } from "./ui";
import type { User, Analysis } from "../../shared/api";
import { api } from "./api";
import type { WebappState } from "./webapp";

const faqs = [
  ["ScamGraph AI คืออะไร?", "What is ScamGraph AI?", "เครื่องมือช่วยตรวจข้อความ ลิงก์ เบอร์โทร บัญชี รูปภาพ และ QR พร้อมแสดงเหตุผลและหลักฐานเชื่อมโยง ผลตรวจช่วยประกอบการตัดสินใจ ไม่ใช่คำตัดสินว่าบุคคลใดกระทำผิด", "A tool that reviews messages, links, numbers, accounts, images and QR content with evidence and explanations. A result supports your judgment; it is not a verdict."],
  ["คะแนนความเสี่ยงหมายถึงอะไร?", "What does the risk score mean?", "คะแนน 0–100 มาจากสัญญาณที่ตรวจพบ ไม่ใช่เปอร์เซ็นต์โอกาสโกง โมเดลปัจจุบันฝึกจากข้อมูลตัวอย่าง และยังไม่ผ่านการรับรองความแม่นยำกับข้อมูลจริง", "The 0–100 score represents detected signals, not a fraud probability. The current model is trained on synthetic examples and has not been validated for real-world accuracy."],
  ["ทำไมบางรายการขึ้นว่าข้อมูลไม่เพียงพอ?", "Why do some results say insufficient data?", "เบอร์หรือบัญชีที่ไม่มีหลักฐานยืนยันไม่สามารถสรุปว่าปลอดภัยได้ แอพจึงแสดงข้อมูลไม่เพียงพอ และแนะนำให้ตรวจสอบกับผู้ให้บริการผ่านช่องทางทางการ", "A number or account without confirmed evidence cannot be classified as safe. Verify it with the provider using official channels."],
  ["ตรวจรูปภาพและ QR อย่างไร?", "How do image and QR checks work?", "เลือกภาพหรือถ่ายภาพ แอพจะแสดงข้อความ OCR หรือข้อมูลใน QR ให้แก้ไขและยืนยันก่อนวิเคราะห์ การอ่าน QR ไม่เปิดลิงก์และไม่ชำระเงินอัตโนมัติ", "Select or take an image, then review and edit the extracted text or decoded QR content before analysis. QR decoding does not open a link or make a payment."],
  ["ข้อมูลของฉันถูกบันทึกเมื่อไร?", "When is my data saved?", "บันทึกประวัติเฉพาะเมื่อเลือกบันทึกผล รายงานเบาะแสและไฟล์หลักฐานจะบันทึกเมื่อคุณส่งเพื่อให้ตรวจสอบ ลบข้อมูลหรือส่งออกได้ในหน้าโปรไฟล์ การตรวจแบบ Guest ไม่ต้องสร้างบัญชี", "History is retained when you choose to save a result. Submitted reports and evidence are retained for review. Export or delete your data from your profile; guest analysis needs no account."],
  ["เชื่อม Google และ LINE อย่างไร?", "How do Google and LINE sign-ins work?", "เลือกปุ่มเข้าสู่ระบบ ผู้ดูแลต้องตั้งค่าโครงการ Google/LINE ก่อน บัญชีอีเมลเดิมต้องเข้าสู่ระบบและเลือกเชื่อมบัญชีเองในตั้งค่า แอพไม่รวมบัญชีโดยอัตโนมัติจากอีเมล", "Choose a sign-in provider after the operator configures its project. Existing email accounts can explicitly link providers in settings; accounts are not merged automatically by email."],
  ["แจ้งเตือน LINE ทำงานเมื่อไร?", "When are LINE alerts sent?", "เชื่อมบัญชี LINE เพิ่ม Official Account เป็นเพื่อน และยินยอมรับแจ้งเตือนในตั้งค่า เมื่อบันทึกผลความเสี่ยงสูง แอพจะส่งสรุปแบบปกปิดข้อมูลผ่าน Messaging API สถานะส่งสำเร็จหมายถึง LINE รับคำขอ ไม่ยืนยันว่าคุณอ่านข้อความแล้ว", "Link LINE, follow the Official Account and opt in under settings. Saved high-risk results trigger masked summaries through the Messaging API. A sent status means LINE accepted the request, not that it was read."],
  ["ตรวจสายเรียกเข้าได้บนเว็บหรือไม่?", "Can the webapp identify incoming calls?", "เว็บและ Expo Go ตรวจสายเรียกเข้าไม่ได้ ต้องติดตั้งแอพ native และอนุญาตบนเครื่อง Android ใช้ Call Screening ส่วน iPhone ใช้รายชื่อ Call Directory ที่ซิงก์ไว้ แสดงสถานะเฉพาะเบอร์ที่มีข้อมูลยืนยัน และไม่ส่งข้อมูลสายสนทนาไปเซิร์ฟเวอร์", "Web browsers and Expo Go cannot identify incoming phone calls. Native Android uses Call Screening; iPhone uses a synced Call Directory. Only evidence-backed entries receive labels, and call content is not uploaded."],
  ["พบข้อความน่าสงสัย ควรทำอย่างไร?", "What should I do with a suspicious message?", "หยุดก่อนโอนเงินหรือส่งข้อมูลส่วนตัว อย่าเปิดลิงก์หรือให้รหัส OTP ติดต่อหน่วยงานด้วยเบอร์หรือเว็บไซต์ทางการที่คุณหาเอง เก็บหลักฐานและส่งเบาะแสให้ผู้ดูแลตรวจสอบ", "Pause before paying or disclosing data. Do not follow the link or share an OTP. Contact the organization through an independently verified official channel and preserve the evidence."],
];

export function HelpPage({ onGo }: { onGo: (page: string) => void }) {
  const { c, english } = useUI(), t = useCopy();
  const [query, setQuery] = useState(""), [open, setOpen] = useState<number | null>(0);
  const items = faqs.map((item, id) => ({ item, id })).filter(({ item }) => item.join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <View style={{ gap: 18 }}>
    <Heading title={t("ศูนย์ช่วยเหลือ", "Help center")} subtitle={t("เข้าใจผลตรวจ และใช้แอพอย่างมั่นใจ", "Understand your results and make informed choices")} />
    <Panel style={{ gap: 14 }}><View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}><BookOpen size={28} color={c.teal} /><Txt bold size={19}>{t("เราช่วยอะไรคุณได้บ้าง?", "How can we help?")}</Txt></View><Field accessibilityLabel={t("ค้นหาคำถาม", "Search questions")} value={query} onChangeText={setQuery} placeholder={t("ค้นหาคำถาม เช่น LINE, QR, ข้อมูล…", "Search questions: LINE, QR, data…")} /></Panel>
    {items.map(({ item, id }) => <Panel key={id} style={{ padding: 19, gap: 12 }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open === id }} onPress={() => setOpen(open === id ? null : id)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><Txt bold size={14} style={{ flex: 1 }}>{item[english ? 1 : 0]}</Txt>{open === id ? <ChevronUp size={19} color={c.teal} /> : <ChevronDown size={19} color={c.muted} />}</Pressable>{open === id && <Txt size={12} muted>{item[english ? 3 : 2]}</Txt>}</Panel>)}
    {!items.length && <Empty title={t("ไม่พบคำถามที่ตรงกัน", "No matching questions")} detail={t("ลองใช้คำค้นอื่น", "Try another search term")} />}
    <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}><Button icon={MessageCircle} onPress={() => onGo("reports")}>{t("ส่งเบาะแสให้ตรวจสอบ", "Submit a clue for review")}</Button><Button secondary onPress={() => onGo("settings")}>{t("ตั้งค่าการป้องกัน", "Protection settings")}</Button></View>
  </View>;
}

export function AlertsPage({ user, onLogin, onOpen, onGo }: { user: User | null; onLogin: () => void; onOpen: (result: Analysis, text: string, kind: string, id: string) => void; onGo: (page: string) => void }) {
  const { c, dark, english } = useUI(), t = useCopy();
  const [items, setItems] = useState<any[]>([]), [error, setError] = useState(""), [loading, setLoading] = useState(false), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true; setItems([]); setError("");
    if (!user) { setLoading(false); return; }
    setLoading(true);
    api("/history?level=HIGH").then(data => { if (active) setItems(data.items); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, refresh]);
  return <View style={{ gap: 18 }}>
    <Heading title={t("แจ้งเตือน", "Alerts")} subtitle={t("ทบทวนผลความเสี่ยงสูงที่คุณเลือกบันทึกไว้", "Review high-risk results you chose to save")} action={<Button small secondary icon={RefreshCw} onPress={() => setRefresh(x => x + 1)}>{t("รีเฟรช", "Refresh")}</Button>} />
    <Note>{t("รายการนี้เป็นผลตรวจที่บันทึกไว้ ไม่ใช่การยืนยันว่ามีการกระทำผิด การแจ้งเตือน LINE ต้องเปิดในตั้งค่า", "These are saved risk reviews, not fraud verdicts. Enable LINE delivery under settings.")}</Note>
    {!user ? <Panel><Empty icon={Bell} title={t("ติดตามผลตรวจของคุณ", "Keep track of your reviews")} detail={t("เข้าสู่ระบบเพื่อดูรายการที่บันทึก", "Sign in to see saved results")} action={<Button onPress={onLogin}>{t("เข้าสู่ระบบ", "Sign in")}</Button>} /></Panel> : loading ? <Panel><ActivityIndicator color={c.teal} /></Panel> : error ? <Panel><Empty title={t("โหลดแจ้งเตือนไม่สำเร็จ", "Could not load alerts")} detail={error} action={<Button onPress={() => setRefresh(x => x + 1)}>{t("ลองอีกครั้ง", "Retry")}</Button>} /></Panel> : !items.length ? <Panel><Empty icon={Bell} title={t("ยังไม่มีผลความเสี่ยงสูงที่บันทึกไว้", "No saved high-risk results")} detail={t("ตรวจข้อมูลและเลือกบันทึกผล เพื่อเปิดดูย้อนหลังได้", "Analyze content and save results to revisit them here")} /></Panel> : items.map(row => <Pressable key={row.id} accessibilityRole="button" onPress={() => onOpen(row.result, row.text, row.kind, row.id)}><Panel style={{ backgroundColor: dark ? "#302337" : "#fff4f7", padding: 20, flexDirection: "row", gap: 14, alignItems: "center" }}><ShieldAlert size={29} color={dark ? "#ffb1c8" : "#ad3555"} /><View style={{ flex: 1, gap: 5 }}><Txt bold size={14}>{t("ควรตรวจสอบก่อนดำเนินการ", "Review before taking action")}</Txt><Txt muted size={11}>{new Date(row.created_at).toLocaleString(english ? "en-GB" : "th-TH")} · {row.kind}</Txt><Pill kind="HIGH">{t("คะแนนความเสี่ยง", "Risk score")} {row.result.score?.toFixed(2)} / 100</Pill></View><ArrowRight size={18} color={c.teal} /></Panel></Pressable>)}
    <Button secondary icon={Bell} onPress={() => onGo("settings")}>{t("ตั้งค่าการแจ้งเตือน LINE", "Set up LINE alerts")}</Button>
  </View>;
}

export function WebappPanel({ state, install, applyUpdate }: { state: WebappState; install: () => Promise<WebappState["installState"]>; applyUpdate: () => boolean }) {
  const t = useCopy(); const [guidance, setGuidance] = useState(false);
  if (!state.isWeb) return null;
  return <Panel style={{ gap: 12, marginBottom: 20 }}>
    <Heading title={t("ScamGraph Webapp", "ScamGraph Webapp")} subtitle={t("เปิดจากเบราว์เซอร์ หรือติดตั้งไว้บนหน้าจอหลัก", "Use your browser or add the app to your home screen")} />
    <Pill>{state.installed ? t("เปิดใช้งานแบบแอพแล้ว", "Running as an installed app") : t("ใช้งานผ่านเว็บ", "Running in your browser")}</Pill>
    <Txt size={12} muted>{t("การตรวจสอบ ล็อกอิน และโหลดประวัติต้องเชื่อมต่อบริการออนไลน์", "Analysis, sign-in and private history require the online service.")}</Txt>
    {!state.installed && <Button icon={Download} disabled={state.installState === "prompting"} onPress={async () => { const result = await install(); setGuidance(result === "manual" || result === "error"); }}>{state.canInstall ? t("ติดตั้ง Webapp", "Install webapp") : t("วิธีติดตั้งบนหน้าจอหลัก", "How to add to home screen")}</Button>}
    {guidance && <Note>{state.installHint === "ios" ? t("เปิดเว็บใน Safari แล้วกดแชร์ → เพิ่มไปยังหน้าจอโฮม หากไม่เห็นเมนูนี้ ให้เปิดด้วย Safari โดยตรง", "Open in Safari, then Share → Add to Home Screen.") : state.installHint === "insecure" ? t("การติดตั้งต้องเปิดผ่าน HTTPS หรือ localhost เปิดลิงก์ที่ปลอดภัยก่อน แล้วเลือกติดตั้งจากเมนูเบราว์เซอร์", "Installation requires HTTPS or localhost. Open a secure URL, then use the browser install menu.") : t("ใน Chrome หรือ Edge เปิดเมนู ⋮ → ติดตั้งแอพ หรือเพิ่มลงหน้าจอหลัก หากไม่มีตัวเลือกนี้ ให้ใช้เว็บตามปกติได้", "In Chrome or Edge, open the browser menu and select Install app or Add to Home Screen. If unavailable, continue using the browser.")}</Note>}
    {state.installState === "accepted" && !state.installed && <Txt muted size={11}>{t("เบราว์เซอร์รับคำขอติดตั้งแล้ว เปิดแอพจากหน้าจอหลักหลังติดตั้งเสร็จ", "Your browser accepted the request. Open the app from your home screen once installed.")}</Txt>}
    {state.updateReady && <><Note>{t("มีเวอร์ชันใหม่ บันทึกงานที่ต้องการเก็บก่อนอัปเดต หน้าจอจะเปิดใหม่", "An update is ready. Save your work before updating; the page will reload.")}</Note><Button icon={RefreshCw} onPress={applyUpdate}>{t("อัปเดต Webapp", "Update webapp")}</Button></>}
  </Panel>;
}
