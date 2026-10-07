import React, { useEffect, useState } from "react";
import { View, Pressable, useWindowDimensions, ActivityIndicator } from "react-native";
import Svg, { Polyline, Line, Circle } from "react-native-svg";
import { Link, Phone, Landmark, ImagePlus, ShieldCheck, ArrowRight, Bell, Network, FileSpreadsheet, QrCode, BookOpen, Flag, RefreshCw } from "lucide-react-native";
import { Txt, Panel, Button, Field, Pill, useUI, useCopy, levelCopy } from "./ui";
import { MotionView, GradientSurface } from "./visual";
import { BrandMark } from "./Brand";
import { Checker, examples } from "./Check";
import type { InputKind } from "./Check";
import type { User } from "../../shared/api";
import { api } from "./api";

export function Home({ checker, health, onExample, onGo, user }: {
  checker: React.ComponentProps<typeof Checker>;
  health: any;
  onExample: (text: string, kind: InputKind) => void;
  onGo: (page: string) => void;
  user?: User | null;
}) {
  const { width } = useWindowDimensions(), { c, dark, english } = useUI(), t = useCopy();
  const wide = width >= 980;
  const [records, setRecords] = useState<any[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setRecords([]); setError("");
    if (!user) { setLoading(false); return; }
    setLoading(true);
    api("/history").then(data => { if (active) setRecords(data.items); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, refresh]);
  const visibleRecords = user ? records : [];
  const counts = [visibleRecords.length, visibleRecords.filter(x => x.level === "HIGH").length, visibleRecords.filter(x => x.level === "LOW").length];
  const latestRisk = visibleRecords.find(x => x.level === "HIGH");
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - 6 + index); date.setHours(0, 0, 0, 0);
    return { date, count: visibleRecords.filter(x => { const at = new Date(x.created_at); return at >= date && at.getTime() < date.getTime() + 86400000; }).length };
  });
  const top = Math.max(1, ...days.map(x => x.count));
  const points = days.map((x, i) => `${14 + i * 44},${76 - x.count / top * 54}`).join(" ");
  const quickActions = [
    { Icon: Link, th: "สแกนลิงก์", en: "Scan a link", detail: t("ตรวจข้อความและ URL", "Messages and URLs"), color: dark ? "#b5a5ff" : "#5946d7", bg: dark ? "#242045" : "#eeebff", action: () => onExample("", "url") },
    { Icon: Phone, th: "สแกนเบอร์", en: "Scan a number", detail: t("ตรวจเบอร์โทรศัพท์", "Phone numbers"), color: dark ? "#67d8cd" : "#147b77", bg: dark ? "#102f36" : "#e5f7f5", action: () => onExample("", "phone") },
    { Icon: Landmark, th: "ตรวจบัญชี", en: "Check an account", detail: t("บัญชีและพร้อมเพย์", "Accounts and PromptPay"), color: dark ? "#78baff" : "#2668bb", bg: dark ? "#182d46" : "#e9f2ff", action: () => onExample("", "account") },
    { Icon: ImagePlus, th: "ภาพ / ไฟล์", en: "Image / file", detail: t("อ่านข้อความด้วย AI", "Read text from an image"), color: dark ? "#f2cd78" : "#9a6920", bg: dark ? "#362e26" : "#fff4df", action: () => checker.media("image") },
  ];
  return <View style={{ gap: wide ? 24 : 20 }}>
    <MotionView>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Txt muted size={12}>{t("สวัสดีค่ะ", "Welcome back")}</Txt>
          <Txt bold size={wide ? 29 : 25} style={{ lineHeight: 40 }}>{user?.name || t("พร้อมเช็กก่อนเชื่อไหม?", "Ready to check?")}</Txt>
          <Txt muted size={12}>{t("ดูแลตัวเองและคนที่คุณรัก ด้วยข้อมูลที่ตรวจสอบได้", "Look after yourself and the people you love.")}</Txt>
        </View>
        <GradientSurface radius={22} style={{ width: 64, height: 64, alignItems: "center", justifyContent: "center" }} colors={[dark ? "#272555" : "#eae6ff", dark ? "#123546" : "#ddf7ff"]}>
          <BrandMark size={58} />
        </GradientSurface>
      </View>
    </MotionView>
    <Field accessibilityLabel={t("ค้นหาข้อมูลที่ต้องการตรวจ", "Search content to check")}
      placeholder={t("วางลิงก์ เบอร์ ข้อความ หรือบัญชีที่ต้องการตรวจ…", "Paste a link, number, message or account…")}
      value={checker.text} onChangeText={value => { checker.setText(value); checker.setKind(/^https?:\/\//i.test(value.trim()) ? "url" : "text"); }} onSubmitEditing={checker.analyze} returnKeyType="search" />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {quickActions.map(({ Icon, th, en, detail, color, bg, action }, index) =>
        <MotionView key={en} delay={index * 45} style={{ width: wide ? "23.5%" : "48%", flexGrow: 1 }}>
          <Pressable accessibilityRole="button" onPress={action} style={({ pressed }) => ({ borderRadius: 22, backgroundColor: bg, padding: wide ? 23 : 18, minHeight: 142, gap: 8, alignItems: wide ? "flex-start" : "center", transform: [{ scale: pressed ? 0.98 : 1 }], borderWidth: 1, borderColor: dark ? "#ffffff0c" : "#ffffffb3" })}>
            <Icon size={29} color={color} strokeWidth={1.8} />
            <Txt bold size={15} style={{ color }}>{t(th, en)}</Txt>
            <Txt muted size={10} style={{ textAlign: wide ? "left" : "center" }}>{detail}</Txt>
          </Pressable>
        </MotionView>)}
    </View>
    <View style={{ flexDirection: wide ? "row" : "column", gap: 16 }}>
      <Panel style={{ flex: 1.2, gap: 14, padding: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Txt bold size={15}>{t("สรุปรายการของคุณ", "Your saved overview")}</Txt>
          {loading ? <ActivityIndicator size="small" color={c.teal} /> : <Pressable accessibilityRole="button" accessibilityLabel={t("รีเฟรชสรุป", "Refresh overview")} onPress={() => setRefresh(x => x + 1)} style={{ padding: 7 }}><RefreshCw size={15} color={c.muted} /></Pressable>}
        </View>
        <View style={{ flexDirection: "row", gap: 9 }}>
          {[ ["บันทึกทั้งหมด", "Saved", c.soft, c.teal], ["ความเสี่ยงสูง", "High risk", dark ? "#402636" : "#fff0f3", dark ? "#ffb4c9" : "#aa3454"], ["ความเสี่ยงต่ำ", "Low risk", dark ? "#163731" : "#e9f8f3", dark ? "#75d9bd" : "#216e5d"] ].map(([th, en, bg, color], i) => <View key={en} style={{ flex: 1, borderRadius: 14, padding: 12, backgroundColor: bg }}>
            <Txt size={10} style={{ color }}>{t(th, en)}</Txt><Txt bold size={26} style={{ color }}>{user && !loading && !error ? counts[i] : "—"}</Txt>
          </View>)}
        </View>
        <Txt muted size={10}>{error ? t("โหลดสรุปไม่สำเร็จ กดรีเฟรชเพื่อลองอีกครั้ง", "Could not load overview. Refresh to retry.") : user ? t("จากรายการที่คุณบันทึกล่าสุด สูงสุด 300 รายการ", "Based on up to 300 of your latest saved items") : t("เข้าสู่ระบบและบันทึกผล เพื่อดูสรุปของคุณ", "Sign in and save results to see your overview")}</Txt>
      </Panel>
      {wide && <Panel style={{ flex: 1, padding: 20, gap: 8 }}>
        <Txt bold size={15}>{t("รายการที่บันทึกใน 7 วัน", "Saved items over 7 days")}</Txt>
        {user && !loading && !error ? <><Svg viewBox="0 0 292 92" height={90} width="100%" accessibilityLabel={t("กราฟจำนวนรายการที่คุณบันทึกในเจ็ดวัน", "Your seven-day saved item counts")}>
          {[25, 50, 76].map(y => <Line key={y} x1={14} x2={278} y1={y} y2={y} stroke={c.line} strokeDasharray="3 5" />)}
          <Polyline points={points} fill="none" stroke={c.teal} strokeWidth={2.5} />
          {days.map((x, i) => <Circle key={i} cx={14 + i * 44} cy={76 - x.count / top * 54} r={3.5} fill={c.teal} />)}
        </Svg>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>{days.map((x, i) => <Txt key={i} muted size={9}>{x.date.toLocaleDateString(english ? "en-GB" : "th-TH", { weekday: "short" })}</Txt>)}</View></> : <View style={{ flex: 1, justifyContent: "center", gap: 10 }}><BookOpen size={26} color={c.teal} /><Txt muted size={12}>{t("บันทึกผลตรวจเมื่อเข้าสู่ระบบ เพื่อดูภาพรวมและรายการย้อนหลังของคุณ", "Sign in and save results to see your overview and activity")}</Txt></View>}
      </Panel>}
    </View>
    <Pressable accessibilityRole="button" onPress={() => onGo(latestRisk ? "alerts" : "settings")}>
      <Panel style={{ padding: 18, flexDirection: "row", gap: 13, alignItems: "center" }}>
        <View style={{ backgroundColor: latestRisk ? dark ? "#432635" : "#fff0f4" : c.soft, borderRadius: 14, padding: 11 }}><Bell size={22} color={latestRisk ? dark ? "#ffb3c1" : "#b53b59" : c.teal} /></View>
        <View style={{ flex: 1 }}><Txt bold size={13}>{latestRisk ? t("มีผลตรวจความเสี่ยงสูงที่บันทึกไว้", "A saved result needs attention") : t("ดูแลคุณได้มากกว่าในแอพ", "Protection beyond a scan")}</Txt>
          <Txt muted size={11}>{latestRisk ? t("เปิดดูเหตุผลและคำแนะนำ ก่อนทำธุรกรรม", "Review the evidence before taking action") : t("ตั้งค่าตรวจสายเรียกเข้าและแจ้งเตือน LINE", "Set up caller identification and LINE alerts")}</Txt>
        </View><ArrowRight size={18} color={c.teal} />
      </Panel>
    </Pressable>
    {wide && <Checker {...checker} />}
    <View style={{ gap: 12 }}>
      <Txt bold size={16}>{t("เครื่องมือเพิ่มเติม", "More ways to check")}</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {[
          [QrCode, "อ่าน QR", "Read QR", () => checker.media("qr")],
          [FileSpreadsheet, "ตรวจ CSV", "Batch CSV", () => checker.media("batch")],
          [Network, "กราฟเบาะแส", "Evidence graph", () => onGo("graph")],
          [Flag, "แจ้งเบาะแส", "Report a clue", () => onGo("reports")],
          [BookOpen, "ศูนย์ช่วยเหลือ", "Help center", () => onGo("help")],
        ].map(([Icon, th, en, action]: any) => <Button key={en} small secondary icon={Icon} onPress={action}>{t(th, en)}</Button>)}
      </View>
    </View>
    <GradientSurface radius={22} colors={dark ? ["#192646", "#262043"] : ["#edf5ff", "#f1ecff"]} style={{ padding: 23, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><ShieldCheck size={22} color={c.teal} /><Txt bold size={16}>{t("เช็กก่อนเชื่อ ปลอดภัยกว่า", "Pause. Check. Stay informed.")}</Txt></View>
      <Txt muted size={12}>{t("ไม่พบประวัติ ไม่ได้แปลว่าปลอดภัย คะแนนช่วยประเมินความเสี่ยง พร้อมเหตุผลที่ตรวจสอบได้", "No history does not mean safe. Review the signals and the evidence behind every result.")}</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>{examples.map(ex => <Button key={ex.en} small secondary onPress={() => onExample(ex.text, ex.type === "url" ? "url" : "text")}>{t(ex.title, ex.en)}</Button>)}</View>
      <Txt muted size={9}>{t("ตัวอย่างสมมติ · โมเดลทดลองฝึกจากข้อมูลตัวอย่าง", "Synthetic examples · Experimental model")}</Txt>
    </GradientSurface>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: health ? "#279578" : c.muted }} /><Txt muted size={10}>{health ? t("บริการตรวจสอบเชื่อมต่อแล้ว", "Analysis service connected") : t("ยังเชื่อมต่อบริการตรวจสอบไม่ได้", "Analysis service unavailable")}</Txt></View>
  </View>;
}
