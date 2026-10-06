import React, { useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
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
      onPress={() => social(provider)}
      style={({ pressed }) => ({
        minHeight: 56,
        borderRadius: 14,
        paddingHorizontal: 21,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        borderWidth: 1,
        borderColor: provider === "line" ? "#06c755" : c.line,
        backgroundColor: provider === "line" ? "#06c755" : c.card,
        opacity: pressed || busy ? 0.75 : 1,
      })}
    >
      {provider === "google" ? (
        <GoogleMark />
      ) : (
        <MessageCircle size={24} color="#fff" fill="#fff" stroke="#06c755" />
      )}
      <Txt
        bold
        size={14}
        style={{ color: provider === "line" ? "#073b1d" : c.ink }}
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
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          paddingVertical: 52,
        }}
        style={{ backgroundColor: c.bg }}
      >
        <View style={{ width: "100%", maxWidth: 430, alignItems: "center" }}>
          <View
            style={{
              width: 150,
              height: 150,
              borderRadius: 38,
              backgroundColor: dark ? "#0a1124" : "#ffffff",
              borderWidth: 1,
              borderColor: dark ? "#363275" : "#e4e7f3",
              boxShadow: dark
                ? "0px 0px 38px rgba(101, 66, 255, 0.25)"
                : "0px 12px 30px rgba(54, 45, 130, 0.10)",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 21,
            }}
          >
            <BrandMark size={140} />
          </View>
          <Txt
            bold
            size={32}
            style={{ letterSpacing: -0.8, textAlign: "center", lineHeight: 46 }}
          >
            ScamGraph{" "}
            <Txt bold size={32} style={{ color: c.teal }}>
              AI
            </Txt>
          </Txt>
          <Txt
            size={10}
            style={{
              color: c.muted,
              letterSpacing: 2.8,
              marginTop: 3,
              marginBottom: 39,
            }}
          >
            SEE THE CONNECTIONS · STOP THE SCAM
          </Txt>
          <View
            style={{
              width: "100%",
              backgroundColor: c.card,
              borderRadius: 24,
              padding: 25,
              borderWidth: 1,
              borderColor: c.line,
              boxShadow: dark
                ? undefined
                : "0px 16px 45px rgba(40, 34, 97, 0.08)",
              gap: 13,
            }}
          >
            {mode === "choices" ? (
              <>
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
                  style={{ minHeight: 56, borderRadius: 14 }}
                >
                  {t("เข้าสู่ระบบด้วยอีเมล", "Sign in with email")}
                </Button>
                <Button
                  secondary
                  onPress={() => choose("register")}
                  style={{ minHeight: 56, borderRadius: 14 }}
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
            style={{ paddingVertical: 20, paddingHorizontal: 16 }}
          >
            <Txt size={12} style={{ color: c.muted }}>
              {t("ทดลองใช้งานโดยไม่เข้าสู่ระบบ", "Continue as a guest")}　→
            </Txt>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
