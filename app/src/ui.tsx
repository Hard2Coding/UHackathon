import React, { createContext, useContext } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  TextInputProps,
  StyleProp,
  ViewStyle,
  TextStyle,
} from "react-native";
import { ArrowRight, Inbox, Info } from "lucide-react-native";
export const palette = {
  light: {
    bg: "#f5f6fd",
    card: "#ffffff",
    ink: "#182344",
    muted: "#626d86",
    line: "#e4e7f3",
    soft: "#efedfd",
    teal: "#5743d6",
    tealDark: "#4733b3",
    nav: "#ffffff",
  },
  dark: {
    bg: "#050b18",
    card: "#0d172a",
    ink: "#f6f7ff",
    muted: "#a3afc8",
    line: "#243451",
    soft: "#141f3a",
    teal: "#ad9bff",
    tealDark: "#6947e3",
    nav: "#080f1f",
  },
};
export const UIContext = createContext({
  dark: false,
  english: false,
  c: palette.light,
});
export const useUI = () => useContext(UIContext);
export const useCopy = () => {
  const { english } = useUI();
  return (th: string, en: string) => (english ? en : th);
};
export function Txt({
  children,
  muted = false,
  bold = false,
  size = 14,
  style,
  ...props
}: {
  children?: React.ReactNode;
  muted?: boolean;
  bold?: boolean;
  size?: number;
  style?: StyleProp<TextStyle>;
  [key: string]: any;
}) {
  const { c } = useUI();
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: bold ? "ThaiBold" : "Thai",
          fontSize: size,
          color: muted ? c.muted : c.ink,
          lineHeight: size * 1.65,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Panel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useUI();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderColor: c.line,
          borderWidth: 1,
          borderRadius: 18,
          padding: 24,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Button({
  children,
  onPress,
  secondary = false,
  small = false,
  loading = false,
  disabled = false,
  icon: Icon,
  style,
  danger = false,
}: {
  children: React.ReactNode;
  onPress: () => void;
  secondary?: boolean;
  small?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: any;
  style?: StyleProp<ViewStyle>;
  danger?: boolean;
}) {
  const { c, dark } = useUI();
  const ink = secondary ? c.ink : "#fff";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: secondary
            ? c.card
            : danger
              ? "#b63f48"
              : dark
                ? c.tealDark
                : c.teal,
          borderWidth: 1,
          borderColor: secondary ? c.line : "transparent",
          borderRadius: 10,
          paddingHorizontal: small ? 13 : 20,
          paddingVertical: small ? 9 : 13,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={ink} />
      ) : Icon ? (
        <Icon size={small ? 15 : 18} color={ink} />
      ) : null}
      <Txt bold size={small ? 12 : 14} style={{ color: ink }}>
        {children}
      </Txt>
    </Pressable>
  );
}
export function Field({
  label,
  style,
  ...props
}: TextInputProps & { label?: string }) {
  const { c } = useUI();
  return (
    <View style={{ gap: 7 }}>
      {label && (
        <Txt bold size={12}>
          {label}
        </Txt>
      )}
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel || label}
        placeholderTextColor={c.muted}
        style={[
          {
            fontFamily: "Thai",
            fontSize: 14,
            color: c.ink,
            backgroundColor: c.bg,
            borderWidth: 1,
            borderColor: c.line,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            outlineStyle: "none" as any,
          },
          props.multiline
            ? { minHeight: 130, textAlignVertical: "top", lineHeight: 25 }
            : null,
          style,
        ]}
      />
    </View>
  );
}
export function Pill({
  children,
  kind = "teal",
}: {
  children: React.ReactNode;
  kind?:
    | "teal"
    | "sample"
    | "muted"
    | "HIGH"
    | "MEDIUM"
    | "LOW"
    | "INSUFFICIENT_DATA"
    | "INSUFFICIENT DATA";
}) {
  const { c, dark } = useUI();
  const colors = {
    HIGH: [dark ? "#442c36" : "#fff0f0", dark ? "#ff9fa6" : "#b9444e"],
    MEDIUM: [dark ? "#3a3628" : "#fff6df", dark ? "#f7d789" : "#927121"],
    LOW: [c.soft, c.teal],
    INSUFFICIENT_DATA: [c.bg, c.muted],
    "INSUFFICIENT DATA": [c.bg, c.muted],
    teal: [c.soft, c.teal],
    sample: [c.soft, c.teal],
    muted: [c.bg, c.muted],
  }[kind];
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 7,
        paddingHorizontal: 9,
        paddingVertical: 4,
        backgroundColor: colors[0],
      }}
    >
      <Txt size={10} bold style={{ color: colors[1] }}>
        {children}
      </Txt>
    </View>
  );
}
export function Empty({
  title,
  detail,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
  icon?: any;
}) {
  const { c } = useUI();
  return (
    <View style={{ padding: 35, alignItems: "center", gap: 12 }}>
      <View style={{ padding: 15, borderRadius: 18, backgroundColor: c.soft }}>
        <Icon size={30} color={c.teal} />
      </View>
      <Txt bold size={17} style={{ textAlign: "center" }}>
        {title}
      </Txt>
      {detail && (
        <Txt muted size={13} style={{ textAlign: "center", maxWidth: 420 }}>
          {detail}
        </Txt>
      )}
      {action}
    </View>
  );
}
export function Note({ children }: { children: React.ReactNode }) {
  const { c } = useUI();
  return (
    <View
      style={{
        padding: 14,
        borderRadius: 10,
        backgroundColor: c.soft,
        flexDirection: "row",
        gap: 9,
        alignItems: "flex-start",
      }}
    >
      <Info size={16} color={c.teal} style={{ marginTop: 3 }} />
      <Txt size={12} muted style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
}
export function Heading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 15,
        marginBottom: 22,
      }}
    >
      <View style={{ flex: 1 }}>
        <Txt bold size={25}>
          {title}
        </Txt>
        {subtitle && (
          <Txt muted size={12} style={{ marginTop: 3 }}>
            {subtitle}
          </Txt>
        )}
      </View>
      {action}
    </View>
  );
}
export const levelCopy = (level: string, english: boolean) =>
  ({
    HIGH: english ? "High risk" : "ความเสี่ยงสูง",
    MEDIUM: english ? "Medium risk" : "ควรระมัดระวัง",
    LOW: english ? "Low risk" : "ความเสี่ยงต่ำ",
    INSUFFICIENT_DATA: english ? "Insufficient data" : "ข้อมูลไม่เพียงพอ",
    "INSUFFICIENT DATA": english ? "Insufficient data" : "ข้อมูลไม่เพียงพอ",
  })[level] || level;
export const entityCopy = (kind: string, en: boolean) =>
  ({
    phone: en ? "Phone" : "เบอร์โทร",
    account: en ? "Account" : "บัญชี",
    wallet: "Wallet",
    line: "LINE ID",
    domain: en ? "Domain" : "โดเมน",
    url: "URL",
    report: en ? "Report" : "รายงาน",
    organization: en ? "Organization" : "องค์กร",
  })[kind] || kind;
export const statusCopy = (status: string, en: boolean) =>
  ({
    no_data: en ? "No connected history" : "ไม่พบข้อมูล",
    reported: en ? "Reported" : "พบรายงาน",
    confirmed_source: en ? "Source-confirmed" : "ยืนยันจากแหล่งข้อมูล",
    pending: en ? "Pending review" : "รอตรวจสอบ",
    verified: en ? "Reviewed" : "ผ่านการตรวจ",
    rejected: en ? "Rejected" : "ไม่รับรอง",
    unavailable: en ? "Unavailable" : "ยังไม่พร้อม",
    ready: en ? "Ready" : "พร้อมใช้งาน",
    unreadable: en ? "Unreadable" : "อ่านข้อความไม่ได้",
    not_found: en ? "Not found" : "ไม่พบ QR",
    invalid: en ? "Invalid format" : "รูปแบบไม่ถูกต้อง",
    unsupported: en ? "Unsupported format" : "ยังไม่รองรับรูปแบบนี้",
    queued: en ? "Queued" : "อยู่ในคิว",
    running: en ? "Processing" : "กำลังทำงาน",
    completed: en ? "Completed" : "เสร็จแล้ว",
    failed: en ? "Failed" : "ไม่สำเร็จ",
  })[status] || status;
