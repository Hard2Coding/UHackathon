import React, { createContext, useContext, useState } from "react";
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
import { GradientSurface } from "./visual";
export const palette = {
  light: {
    bg: "#f5faff",
    card: "#ffffff",
    ink: "#172d50",
    muted: "#5c718e",
    line: "#dce8f4",
    soft: "#edf2ff",
    teal: "#4663df",
    tealDark: "#324ec4",
    nav: "#ffffff",
  },
  dark: {
    bg: "#071326",
    card: "#10203a",
    ink: "#f6f7ff",
    muted: "#abc0db",
    line: "#283e60",
    soft: "#182b4b",
    teal: "#b5a5ff",
    tealDark: "#6947e3",
    nav: "#08182f",
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
  size = 15,
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
          lineHeight: size * 1.55,
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
  const { c, dark } = useUI();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderColor: c.line,
          borderWidth: 1,
          borderRadius: 24,
          padding: 24,
          boxShadow: dark ? "0px 10px 28px rgba(0, 6, 20, 0.15)" : "0px 8px 28px rgba(34, 69, 119, 0.055)",
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
  const [highlighted, setHighlighted] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onHoverIn={() => setHighlighted(true)}
      onHoverOut={() => setHighlighted(false)}
      onFocus={() => setHighlighted(true)}
      onBlur={() => setHighlighted(false)}
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
          borderColor: secondary ? highlighted ? c.teal : c.line : "transparent",
          borderRadius: 14,
          minHeight: small ? 42 : 50,
          overflow: "hidden",
          paddingHorizontal: small ? 14 : 20,
          paddingVertical: small ? 10 : 13,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
          transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
          boxShadow: disabled ? undefined : highlighted ? "0px 0px 0px 3px rgba(89, 109, 224, 0.18), 0px 8px 20px rgba(74, 84, 215, 0.19)" : secondary || danger ? undefined : "0px 5px 14px rgba(74, 84, 215, 0.17)",
        },
        style,
      ]}
    >
      {!secondary && !danger && <GradientSurface style={StyleSheet.absoluteFillObject} radius={14} colors={dark ? ["#315ee8", "#8b4ee8"] : ["#2e6ae7", "#7850df", "#9654df"]} />}
      {loading ? (
        <View style={{ zIndex: 1 }}><ActivityIndicator size="small" color={ink} /></View>
      ) : Icon ? (
        <View style={{ zIndex: 1 }}><Icon size={small ? 16 : 19} color={ink} /></View>
      ) : null}
      <Txt bold size={small ? 13 : 15} style={{ color: ink, zIndex: 1 }}>
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
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 7 }}>
      {label && (
        <Txt bold size={13}>
          {label}
        </Txt>
      )}
      <TextInput
        {...props}
        onFocus={event => { setFocused(true); props.onFocus?.(event); }}
        onBlur={event => { setFocused(false); props.onBlur?.(event); }}
        accessibilityLabel={props.accessibilityLabel || label}
        placeholderTextColor={c.muted}
        style={[
          {
            fontFamily: "Thai",
            fontSize: 15,
            color: c.ink,
            backgroundColor: c.bg,
            borderWidth: 1,
            borderColor: focused ? c.teal : c.line,
            borderRadius: 14,
            minHeight: 50,
            boxShadow: focused ? "0px 0px 0px 3px rgba(77, 106, 224, 0.11)" : undefined,
            paddingHorizontal: 15,
            paddingVertical: 12,
            outlineStyle: "none" as any,
          },
          props.multiline
            ? { minHeight: 130, textAlignVertical: "top", lineHeight: 26 }
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
    LOW: [dark ? "#15372f" : "#e8f8f1", dark ? "#76e2c6" : "#187b64"],
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
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: colors[0],
      }}
    >
      <Txt size={12} bold style={{ color: colors[1], lineHeight: 16 }}>
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
      <Txt bold size={19} style={{ textAlign: "center" }}>
        {title}
      </Txt>
      {detail && (
        <Txt muted size={14} style={{ textAlign: "center", maxWidth: 420 }}>
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
      <Info size={17} color={c.teal} style={{ marginTop: 3 }} />
      <Txt size={13} muted style={{ flex: 1, lineHeight: 20 }}>
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
        <Txt bold size={26} style={{ lineHeight: 34 }}>
          {title}
        </Txt>
        {subtitle && (
          <Txt muted size={14} style={{ marginTop: 4, lineHeight: 21 }}>
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
