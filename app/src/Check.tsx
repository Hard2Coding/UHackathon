import React from "react";
import { View, Pressable, useWindowDimensions } from "react-native";
import {
  ShieldCheck,
  ArrowUpRight,
  Link,
  AlignLeft,
  Phone,
  PhoneIncoming,
  Landmark,
  ImagePlus,
  Camera,
  QrCode,
  FileSpreadsheet,
  ArrowRight,
  LockKeyhole,
  Network,
  BrainCircuit,
  Check,
  Search,
  ScanLine,
  Sparkles,
} from "lucide-react-native";
import { BrandMark } from "./Brand";
import {
  Button,
  Panel,
  Txt,
  Pill,
  Field,
  Note,
  useUI,
  useCopy,
  Heading,
} from "./ui";
export const examples = [
  {
    title: "ข้อความทั่วไป",
    en: "An everyday message",
    text: "นัดทานข้าวพรุ่งนี้ตอนเที่ยงที่ร้านเดิมนะ แล้วเจอกัน",
    type: "normal",
  },
  {
    title: "ข้อความที่ควรระวัง",
    en: "A suspicious message",
    text: "ด่วน! บัญชีของคุณจะถูกระงับ กรุณายืนยันรหัส OTP และโอนค่าธรรมเนียมภายใน 10 นาที ติดต่อ LINE ID: @support_demo",
    type: "scam",
  },
  {
    title: "ลิงก์เลียนแบบแบรนด์",
    en: "A brand impersonation link",
    text: "https://kasikorn-verify-login.example/secure?claim=reward",
    type: "url",
  },
];
export type InputKind = "text" | "url" | "phone" | "account" | "wallet";
type CheckerProps = {
  text: string;
  setText: (text: string) => void;
  kind: InputKind;
  setKind: (kind: InputKind) => void;
  busy: boolean;
  analyze: () => void;
  media: (type: string) => void;
};
export function Checker(props: CheckerProps) {
  const { c } = useUI(),
    t = useCopy();
  const { text, setText, kind, setKind, busy, analyze, media } = props;
  const modes: [InputKind, any, string, string][] = [
    ["text", AlignLeft, "ข้อความ", "Text"],
    ["url", Link, "ลิงก์", "URL"],
    ["phone", Phone, "เบอร์โทร", "Phone"],
    ["account", Landmark, "บัญชี", "Account"],
    ["wallet", Landmark, "Wallet", "Wallet"],
  ];
  return (
    <Panel style={{ padding: 24, gap: 18 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 9,
            alignItems: "center",
            flex: 1,
            minWidth: 240,
          }}
        >
          <ScanLine size={21} color={c.teal} />
          <Txt bold size={18}>
            {t("เริ่มตรวจสอบความเสี่ยง", "Check something suspicious")}
          </Txt>
        </View>
        <Pill>{t("ไม่ต้องสมัครสมาชิก", "Guest friendly")}</Pill>
      </View>
      <View
        style={{
          flexDirection: "row",
          gap: 5,
          flexWrap: "wrap",
          padding: 5,
          borderRadius: 11,
          backgroundColor: c.bg,
        }}
      >
        {modes.map(([key, Icon, th, en]) => (
          <Pressable
            key={key}
            onPress={() => setKind(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: kind === key }}
            style={{
              flexDirection: "row",
              gap: 7,
              alignItems: "center",
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: kind === key ? c.card : "transparent",
            }}
          >
            <Icon size={14} color={kind === key ? c.teal : c.muted} />
            <Txt size={12} bold={kind === key} muted={kind !== key}>
              {t(th, en)}
            </Txt>
          </Pressable>
        ))}
      </View>
      <Field
        accessibilityLabel={t("ข้อมูลที่ต้องการตรวจสอบ", "Content to analyze")}
        multiline={kind === "text"}
        value={text}
        onChangeText={setText}
        maxLength={10000}
        autoCapitalize="none"
        placeholder={
          kind === "text"
            ? t(
                "วางข้อความหรือ SMS ที่นี่…\nข้อความที่น่าสงสัย อาจมีมากกว่าหนึ่งเบาะแส",
                "Paste a message or SMS here…\nWe will look at the signals together.",
              )
            : kind === "url"
              ? "https://example.com"
              : kind === "phone"
                ? t(
                    "หมายเลขโทรศัพท์ เช่น 0812345678",
                    "Phone number, e.g. +66812345678",
                  )
                : t(
                    "หมายเลขบัญชี พร้อมเพย์ หรือ Wallet",
                    "Account, PromptPay, or wallet identifier",
                  )
        }
        style={{ minHeight: kind === "text" ? 158 : 64 }}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <LockKeyhole size={13} color={c.muted} />
          <Txt muted size={11}>
            {t(
              "บันทึกประวัติเฉพาะเมื่อคุณเลือก",
              "History is saved only when you choose",
            )}
          </Txt>
        </View>
        <Button onPress={analyze} loading={busy} icon={Search}>
          {t("ตรวจสอบความเสี่ยง", "Analyze risk")}
        </Button>
      </View>
      <View
        style={{
          borderTopWidth: 1,
          borderColor: c.line,
          paddingTop: 16,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 9,
        }}
      >
        {[
          [ImagePlus, "image", "อัปโหลดภาพ", "Upload image"],
          [Camera, "camera", "ถ่ายภาพ", "Take photo"],
          [QrCode, "qr", "อ่าน QR", "Read QR"],
          [FileSpreadsheet, "batch", "ตรวจ CSV", "Batch CSV"],
        ].map(([Icon, type, th, en]: any) => (
          <Button
            secondary
            small
            key={type}
            icon={Icon}
            onPress={() => media(type)}
          >
            {t(th, en)}
          </Button>
        ))}
      </View>
    </Panel>
  );
}
function ShieldArt() {
  return (
    <View
      style={{
        width: 230,
        height: 205,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <BrandMark size={205} />
    </View>
  );
}
export function Home({
  checker,
  health,
  onExample,
  onGo,
}: {
  checker: CheckerProps;
  health: any;
  onExample: (text: string, kind: InputKind) => void;
  onGo: (page: string) => void;
}) {
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  const { c } = useUI(),
    t = useCopy();
  return (
    <View style={{ gap: 25 }}>
      <View
        style={{
          padding: desktop ? 30 : 22,
          borderRadius: 20,
          backgroundColor: c.soft,
          borderWidth: 1,
          borderColor: c.line,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginBottom: 12,
            }}
          >
            <Sparkles size={13} color={c.teal} />
            <Txt bold size={11} style={{ color: c.teal, letterSpacing: 1.3 }}>
              PREDICT BEFORE IT GETS REPORTED
            </Txt>
          </View>
          <Txt
            bold
            size={desktop ? 34 : 27}
            style={{ lineHeight: desktop ? 48 : 40 }}
          >
            {t(
              "เช็กก่อนเชื่อ\nหยุดความเสี่ยงก่อนเกิด",
              "Pause. Check. Stay informed.",
            )}
          </Txt>
          <Txt muted size={13} style={{ marginTop: 12, maxWidth: 520 }}>
            {t(
              "ตรวจข้อความ ลิงก์ และเบาะแสรอบตัว\nเข้าใจความเสี่ยง พร้อมเหตุผลที่ตรวจสอบได้",
              "Check messages, links, and connected clues.\nUnderstand the risk and the evidence behind it.",
            )}
          </Txt>
        </View>
        {desktop && <ShieldArt />}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(
          "ตั้งค่าการตรวจสายและ LINE",
          "Set up caller protection and LINE",
        )}
        onPress={() => onGo("settings")}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.line,
          padding: 18,
          borderRadius: 16,
        }}
      >
        <PhoneIncoming size={23} color={c.teal} />
        <View style={{ flex: 1 }}>
          <Txt bold size={13}>
            {t("ดูแลคุณได้มากกว่าในแอพ", "Protection beyond a scan")}
          </Txt>
          <Txt muted size={11}>
            {t(
              "ตั้งค่าตรวจสายเรียกเข้าและแจ้งเตือน LINE",
              "Set up incoming caller status and LINE alerts",
            )}
          </Txt>
        </View>
        <ArrowRight size={18} color={c.teal} />
      </Pressable>
      <View style={{ flexDirection: desktop ? "row" : "column", gap: 22 }}>
        <View style={{ flex: 1.8 }}>
          <Checker {...checker} />
        </View>
        <Panel style={{ flex: 1, gap: 21 }}>
          <Txt bold size={16}>
            {t("มองให้เห็นมากกว่าข้อความ", "Look beyond the message")}
          </Txt>
          {[
            [
              BrainCircuit,
              "รูปแบบที่น่าสงสัย",
              "Suspicious patterns",
              "วิเคราะห์ภาษาและองค์ประกอบของลิงก์",
              "Analyze language and link characteristics",
            ],
            [
              Network,
              "ความเชื่อมโยงของเบาะแส",
              "Connected evidence",
              "ดูความสัมพันธ์พร้อมที่มาของแต่ละเส้น",
              "Explore relationships with clear provenance",
            ],
            [
              ShieldCheck,
              "ประวัติและหลักฐาน",
              "Reports and evidence",
              "แยกรายงานที่รอตรวจออกจากข้อมูลยืนยัน",
              "Separate pending reports from verified evidence",
            ],
          ].map(([Icon, th, en, dth, den]: any) => (
            <View key={en} style={{ flexDirection: "row", gap: 13 }}>
              <View
                style={{
                  backgroundColor: c.soft,
                  padding: 10,
                  borderRadius: 11,
                  alignSelf: "flex-start",
                }}
              >
                <Icon size={20} color={c.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt bold size={13}>
                  {t(th, en)}
                </Txt>
                <Txt muted size={11} style={{ marginTop: 3 }}>
                  {t(dth, den)}
                </Txt>
              </View>
            </View>
          ))}
          <View
            style={{ borderTopWidth: 1, borderColor: c.line, paddingTop: 15 }}
          >
            <Txt size={11} muted>
              {t(
                "ไม่พบรายงาน ≠ ปลอดภัย\nคะแนนช่วยประเมินความเสี่ยง ไม่ใช่คำตัดสิน",
                "No report does not mean safe.\nA risk score supports your judgment.",
              )}
            </Txt>
          </View>
        </Panel>
      </View>
      <View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <Txt bold size={16}>
            {t("ลองตรวจสอบด้วยตัวอย่าง", "Try a sample")}
          </Txt>
          <Txt muted size={10}>
            {t(
              "ข้อมูลสมมติ • ใช้โดเมนสงวน",
              "Synthetic content · reserved domains",
            )}
          </Txt>
        </View>
        <View
          style={{ flexDirection: width >= 780 ? "row" : "column", gap: 13 }}
        >
          {examples.map((ex, i) => (
            <Pressable
              key={ex.title}
              onPress={() =>
                onExample(ex.text, ex.type === "url" ? "url" : "text")
              }
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: pressed ? c.teal : c.line,
                borderRadius: 13,
                padding: 17,
                gap: 8,
              })}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Txt bold size={12}>
                  {t(ex.title, ex.en)}
                </Txt>
                <ArrowUpRight size={15} color={c.teal} />
              </View>
              <Txt muted numberOfLines={2} size={11}>
                {ex.text}
              </Txt>
              <Txt size={10} style={{ color: c.teal, marginTop: 3 }}>
                {t("คลิกเพื่อทดลอง", "Click to try")} →
              </Txt>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: width >= 780 ? "row" : "column", gap: 15 }}>
        <Panel
          style={{
            flex: 1,
            padding: 20,
            flexDirection: "row",
            gap: 14,
            alignItems: "center",
          }}
        >
          <LockKeyhole size={25} color={c.teal} />
          <View style={{ flex: 1 }}>
            <Txt bold size={13}>
              {t("ข้อมูลของคุณ คุณเป็นผู้เลือก", "Your data. Your choice.")}
            </Txt>
            <Txt muted size={11}>
              {t(
                "ตรวจแบบ Guest ได้ และลบข้อมูลที่บันทึกได้ทุกเมื่อ",
                "Analyze as a guest. Delete saved data anytime.",
              )}
            </Txt>
          </View>
          <Pressable onPress={() => onGo("settings")}>
            <ArrowRight size={18} color={c.teal} />
          </Pressable>
        </Panel>
        <Panel
          style={{
            flex: 1,
            padding: 20,
            flexDirection: "row",
            gap: 14,
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 9,
              backgroundColor: health ? "#2eaa87" : "#95a6b1",
            }}
          />
          <View style={{ flex: 1 }}>
            <Txt bold size={13}>
              {health
                ? t("บริการตรวจสอบเชื่อมต่อแล้ว", "Analysis service connected")
                : t("กำลังตรวจสอบการเชื่อมต่อ", "Checking service connection")}
            </Txt>
            <Txt muted size={11}>
              {t(
                "โมเดลทดลองฝึกจากข้อมูลตัวอย่าง ไม่ใช่การรับรองความแม่นยำ",
                "Experimental model trained on synthetic examples.",
              )}
            </Txt>
          </View>
        </Panel>
      </View>
    </View>
  );
}
