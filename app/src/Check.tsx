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
            minWidth: 180,
          }}
        >
          <ScanLine size={22} color={c.teal} />
          <Txt bold size={20}>
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
              paddingHorizontal: 13,
              paddingVertical: 9,
              borderRadius: 8,
              backgroundColor: kind === key ? c.card : "transparent",
            }}
          >
            <Icon size={15} color={kind === key ? c.teal : c.muted} />
            <Txt size={14} bold={kind === key} muted={kind !== key}>
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
          <LockKeyhole size={15} color={c.muted} />
          <Txt muted size={13}>
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
export { Home } from "./Dashboard";
