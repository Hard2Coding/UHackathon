import React, { useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import {
  Mail,
  ArrowRight,
  MessageCircle,
  ArrowLeft,
  Eye,
  EyeOff,
} from "lucide-react-native";
import { Txt, Field, Button, useUI, useCopy } from "./ui";
import { BrandMark, GoogleMark } from "./Brand";
import { post } from "./api";
import { startSocial, authErrorMessage } from "./social";
import { AmbientBackground, MotionView } from "./visual";
import type { User } from "../../shared/api";

export function LoginScreen({
  onSuccess,
  onGuest,
  initialError = "",
}: {
  onSuccess: (token: string, user: User) => void;
  onGuest: () => void;
  initialError?: string;
}) {
  const { c, dark, english } = useUI(),
    t = useCopy();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [hoveredProvider, setHoveredProvider] = useState("");
  const [mode, setMode] = useState<"choices" | "login" | "register">("choices");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState("");
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(initialError),
    [reveal, setReveal] = useState(false);
  const choose = (value: typeof mode) => {
    setMode(value);
    setError("");
    setPassword("");
  };
  const social = async (provider: "google" | "line") => {
    setBusy(provider);
    setError("");
    try {
      const response = await startSocial(provider);
      if (response && "token" in response)
        onSuccess(response.token, response.user);
    } catch (e: any) {
      setError(authErrorMessage(e.message, english));
    } finally {
      setBusy("");
    }
  };
  const submit = async () => {
    if (!email.trim() || !password || (mode === "register" && !name.trim())) {
      setError(t("กรอกข้อมูลให้ครบ", "Please complete all fields"));
      return;
    }
    setBusy("direct");
    setError("");
    try {
      const response = await post(
        mode === "register" ? "/auth/register" : "/auth/login",
        {
          email: email.trim(),
          password,
          ...(mode === "register" ? { name: name.trim() } : {}),
        },
      );
      setPassword("");
      onSuccess(response.token, response.user);
    } catch (e: any) {
      setError(authErrorMessage(e.message, english));
    } finally {
      setBusy("");
    }
  };
  const providerButton = (provider: "google" | "line") => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        provider === "google"
          ? t("เข้าสู่ระบบด้วย Google", "Continue with Google")
          : t("เข้าสู่ระบบด้วย LINE", "Continue with LINE")
      }
      disabled={!!busy}
      accessibilityState={{ disabled: !!busy, busy: busy === provider }}
      onHoverIn={() => setHoveredProvider(provider)}
      onHoverOut={() => setHoveredProvider("")}
      onFocus={() => setHoveredProvider(provider)}
      onBlur={() => setHoveredProvider("")}
      onPress={() => social(provider)}
      style={({ pressed }) => ({
        minHeight: 51,
        borderRadius: 14,
        paddingHorizontal: 21,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        borderWidth: 1,
        borderColor: hoveredProvider === provider ? c.teal : c.line,
        backgroundColor: c.card,
        boxShadow: hoveredProvider === provider ? "0px 0px 0px 3px rgba(87, 106, 221, 0.12)" : undefined,
        opacity: pressed || busy ? 0.75 : 1,
      })}
    >
      {provider === "google" ? (
        <GoogleMark />
      ) : (
        <View style={{ width: 25, height: 25, borderRadius: 7, backgroundColor: "#06c755", alignItems: "center", justifyContent: "center" }}>
          <MessageCircle size={19} color="#fff" fill="#fff" stroke="#06c755" />
        </View>
      )}
      <Txt
        bold
        size={14}
        style={{ color: c.ink }}
      >
        {busy === provider
          ? t("กำลังเชื่อมต่อ…", "Connecting…")
          : provider === "google"
            ? t("เข้าสู่ระบบด้วย Google", "Continue with Google")
            : t("เข้าสู่ระบบด้วย LINE", "Continue with LINE")}
      </Txt>
    </Pressable>
  );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AmbientBackground dark={dark} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: wide ? 48 : 22,
          paddingVertical: wide ? 64 : 35,
        }}
        style={{ backgroundColor: "transparent" }}
      >
        <View style={{ width: "100%", maxWidth: wide ? 1060 : 430, alignItems: "center", flexDirection: wide ? "row" : "column", backgroundColor: wide ? c.card : "transparent", borderWidth: wide ? 1 : 0, borderColor: c.line, borderRadius: 32, overflow: "hidden", boxShadow: wide ? "0px 24px 80px rgba(22, 53, 108, 0.13)" : undefined }}>
          <View style={{ width: wide ? "50%" : "100%", minHeight: wide ? 620 : undefined, alignItems: "center", justifyContent: "center", backgroundColor: wide ? "#081735" : "transparent", padding: wide ? 38 : 0, paddingBottom: wide ? 38 : 25, overflow: "hidden" }}>
            {wide && <AmbientBackground dark variant="network" />}
            <MotionView style={{ alignItems: "center" }}>
              <View style={{ width: wide ? 226 : 116, height: wide ? 226 : 116, borderRadius: wide ? 62 : 34, alignItems: "center", justifyContent: "center", marginBottom: wide ? 28 : 8, backgroundColor: wide || dark ? "rgba(40, 62, 129, 0.25)" : "rgba(235, 247, 255, 0.45)", boxShadow: wide || dark ? "0px 0px 60px rgba(76, 121, 245, 0.22)" : "0px 10px 40px rgba(101, 113, 217, 0.10)" }}>
                <BrandMark size={wide ? 206 : 112} />
              </View>
              <Txt bold size={wide ? 40 : 27} style={{ color: wide ? "#fff" : c.ink, letterSpacing: -0.9, textAlign: "center", lineHeight: wide ? 56 : 40 }}>
                ScamGraph <Txt bold size={wide ? 40 : 27} style={{ color: wide ? "#ab8afa" : c.teal }}>AI</Txt>
              </Txt>
              <Txt size={wide ? 9 : 8} style={{ color: wide ? "#c7d5ef" : c.muted, letterSpacing: wide ? 3.1 : 1.8, textAlign: "center", marginTop: 6 }}>
                SEE THE CONNECTIONS · STOP THE SCAM
              </Txt>
            </MotionView>
          </View>
          <MotionView delay={100} style={{ width: wide ? "50%" : "100%", padding: wide ? 44 : 0 }}>
          <View
            style={{
              width: "100%",
              backgroundColor: wide ? "transparent" : c.card,
              borderRadius: 26,
              padding: wide ? 0 : 23,
              borderWidth: wide ? 0 : 1,
              borderColor: dark ? "#2b4065" : "#e0ebf7",
              boxShadow: wide ? undefined : "0px 12px 40px rgba(37, 78, 132, 0.065)",
              gap: 12,
            }}
          >
            {mode === "choices" ? (
              <>
                <Txt bold size={wide ? 25 : 20} style={{ textAlign: wide ? "left" : "center", marginBottom: 2 }}>{t("เข้าสู่ระบบ", "Sign in")}</Txt>
                <Txt muted size={12} style={{ textAlign: wide ? "left" : "center", marginBottom: 10 }}>{t("เข้าสู่ระบบเพื่อใช้งานต่อ", "Sign in to continue")}</Txt>
                {providerButton("google")}
                {providerButton("line")}
                <View
                  style={{
                    flexDirection: "row",
                    gap: 13,
                    alignItems: "center",
                    marginVertical: 4,
                  }}
                >
                  <View
                    style={{ flex: 1, height: 1, backgroundColor: c.line }}
                  />
                  <Txt muted size={11}>
                    {t("หรือ", "or")}
                  </Txt>
                  <View
                    style={{ flex: 1, height: 1, backgroundColor: c.line }}
                  />
                </View>
                <Button
                  icon={Mail}
                  onPress={() => choose("login")}
                  style={{ minHeight: 51, borderRadius: 14 }}
                >
                  {t("เข้าสู่ระบบด้วยอีเมล", "Sign in with email")}
                </Button>
                <Button
                  secondary
                  onPress={() => choose("register")}
                  style={{ minHeight: 51, borderRadius: 14 }}
                >
                  {t("สร้างบัญชีใหม่", "Create an account")}
                </Button>
              </>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    "กลับไปตัวเลือกเข้าสู่ระบบ",
                    "Back to sign-in options",
                  )}
                  onPress={() => choose("choices")}
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "center",
                    paddingVertical: 5,
                  }}
                >
                  <ArrowLeft size={18} color={c.muted} />
                  <Txt size={12} muted>
                    {t("ตัวเลือกเข้าสู่ระบบ", "Sign-in options")}
                  </Txt>
                </Pressable>
                <Txt bold size={22}>
                  {mode === "register"
                    ? t("สร้างบัญชีใหม่", "Create your account")
                    : t("ยินดีต้อนรับกลับ", "Welcome back")}
                </Txt>
                {mode === "register" && (
                  <Field
                    label={t("ชื่อที่แสดง", "Display name")}
                    value={name}
                    onChangeText={setName}
                    autoComplete="name"
                  />
                )}
                <Field
                  label={t("อีเมล", "Email")}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
                <Field
                  label={t("รหัสผ่าน", "Password")}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!reveal}
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  onSubmitEditing={submit}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setReveal(!reveal)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
                >
                  {reveal ? (
                    <EyeOff size={15} color={c.muted} />
                  ) : (
                    <Eye size={15} color={c.muted} />
                  )}
                  <Txt muted size={11}>
                    {reveal
                      ? t("ซ่อนรหัสผ่าน", "Hide password")
                      : t("แสดงรหัสผ่าน", "Show password")}
                  </Txt>
                </Pressable>
                {mode === "register" && (
                  <Txt muted size={11}>
                    {t(
                      "รหัสผ่านอย่างน้อย 10 ตัวอักษร",
                      "Use at least 10 characters",
                    )}
                  </Txt>
                )}
                <Button
                  loading={busy === "direct"}
                  disabled={!!busy}
                  onPress={submit}
                  icon={ArrowRight}
                >
                  {mode === "register"
                    ? t("สร้างบัญชี", "Create account")
                    : t("เข้าสู่ระบบ", "Sign in")}
                </Button>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    choose(mode === "login" ? "register" : "login")
                  }
                >
                  <Txt
                    size={12}
                    style={{
                      color: c.teal,
                      textAlign: "center",
                      paddingVertical: 5,
                    }}
                  >
                    {mode === "login"
                      ? t(
                          "ยังไม่มีบัญชี? สร้างบัญชี",
                          "New here? Create an account",
                        )
                      : t(
                          "มีบัญชีแล้ว? เข้าสู่ระบบ",
                          "Already registered? Sign in",
                        )}
                  </Txt>
                </Pressable>
              </>
            )}
            {!!error && (
              <Txt
                accessibilityRole="alert"
                size={12}
                style={{
                  color: dark ? "#ffadb3" : "#a33541",
                  textAlign: "center",
                }}
              >
                {error}
              </Txt>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onGuest}
            disabled={!!busy}
            style={{ paddingVertical: 18, paddingHorizontal: 8, alignItems: "center" }}
          >
            <Txt size={12} style={{ color: c.muted }}>
              {t("ทดลองใช้งานโดยไม่เข้าสู่ระบบ", "Continue as a guest")}　→
            </Txt>
          </Pressable>
          </MotionView>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
