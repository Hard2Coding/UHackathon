import React, { useState, useEffect } from "react";
import { View, Modal, Pressable, Switch } from "react-native";
import {
  X,
  UserRound,
  LogOut,
  Trash2,
  Download,
  Save,
  LockKeyhole,
  Moon,
  Languages,
  Sun,
  ShieldCheck,
  MessageCircle,
} from "lucide-react-native";
import type { User } from "../../shared/api";
import { api, post } from "./api";
import { startSocial, authErrorMessage } from "./social";
import { GoogleMark } from "./Brand";
import { ProtectionSettings } from "./ProtectionSettings";
import {
  Button,
  Panel,
  Txt,
  Field,
  Pill,
  Note,
  Heading,
  useUI,
  useCopy,
} from "./ui";
export function AuthModal({
  visible,
  onClose,
  onSuccess,
  notify,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: (token: string, user: User) => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const { c, english } = useUI(),
    t = useCopy();
  const [register, setRegister] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async () => {
    setError("");
    if (!email.trim() || !password || (register && !name.trim())) {
      setError(t("กรอกข้อมูลให้ครบ", "Please complete all fields"));
      return;
    }
    setBusy(true);
    try {
      const data = await post(register ? "/auth/register" : "/auth/login", {
        email,
        password,
        ...(register ? { name } : {}),
      });
      onSuccess(data.token, data.user);
      setPassword("");
      onClose();
      notify(t("เข้าสู่ระบบแล้ว", "You are signed in"));
    } catch (e: any) {
      setError(authErrorMessage(e.message, english));
    } finally {
      setBusy(false);
    }
  };
  const social = async (provider: "google" | "line") => {
    setBusy(true);
    setError("");
    try {
      const response = await startSocial(provider);
      if (response && "token" in response) {
        onSuccess(response.token, response.user);
        onClose();
      }
    } catch (e: any) {
      setError(authErrorMessage(e.message, english));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "#061f35aa",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Panel style={{ width: "100%", maxWidth: 430, gap: 17 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View
              style={{ padding: 10, backgroundColor: c.soft, borderRadius: 12 }}
            >
              <LockKeyhole size={23} color={c.teal} />
            </View>
            <Pressable onPress={onClose} accessibilityLabel="Close">
              <X size={20} color={c.muted} />
            </Pressable>
          </View>
          <Txt bold size={23}>
            {register
              ? t("สร้างบัญชีของคุณ", "Create your account")
              : t("ยินดีต้อนรับกลับ", "Welcome back")}
          </Txt>
          <Txt muted size={12}>
            {t(
              "บันทึกผลและติดตามเบาะแสของคุณ",
              "Save results and follow your reports.",
            )}
          </Txt>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              secondary
              small
              icon={GoogleMark}
              disabled={busy}
              onPress={() => social("google")}
              style={{ flex: 1 }}
            >
              Google
            </Button>
            <Button
              small
              icon={MessageCircle}
              disabled={busy}
              onPress={() => social("line")}
              style={{ flex: 1, backgroundColor: "#00853b" }}
            >
              LINE
            </Button>
          </View>
          {register && (
            <Field
              label={t("ชื่อที่แสดง", "Display name")}
              value={name}
              onChangeText={setName}
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
            secureTextEntry
            autoComplete={register ? "new-password" : "current-password"}
            onSubmitEditing={submit}
          />
          {register && (
            <Txt muted size={10}>
              {t("อย่างน้อย 10 ตัวอักษร", "At least 10 characters")}
            </Txt>
          )}
          {error && (
            <Txt size={12} style={{ color: "#b9444e" }}>
              {error}
            </Txt>
          )}
          <Button onPress={submit} loading={busy}>
            {register
              ? t("สร้างบัญชี", "Create account")
              : t("เข้าสู่ระบบ", "Sign in")}
          </Button>
          <Pressable
            onPress={() => {
              setRegister(!register);
              setError("");
            }}
          >
            <Txt size={12} style={{ textAlign: "center", color: c.teal }}>
              {register
                ? t("มีบัญชีแล้ว? เข้าสู่ระบบ", "Already registered? Sign in")
                : t("ยังไม่มีบัญชี? สร้างบัญชี", "New here? Create an account")}
            </Txt>
          </Pressable>
          <Note>
            {t(
              "โหมด Guest ตรวจสอบได้เสมอ โดยไม่ต้องสมัคร",
              "You can always analyze as a guest.",
            )}
          </Note>
        </Panel>
      </View>
    </Modal>
  );
}
export function SettingsPage({
  user,
  onLogin,
  onLogout,
  onUserUpdate,
  onDelete,
  onExport,
  setDark,
  setEnglish,
  notify,
}: {
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
  onUserUpdate: (user: User) => void;
  onDelete: () => void;
  onExport: () => void;
  setDark: (v: boolean) => void;
  setEnglish: (v: boolean) => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const { c, dark, english } = useUI(),
    t = useCopy();
  const [name, setName] = useState(user?.name || ""),
    [confirm, setConfirm] = useState(false),
    [email, setEmail] = useState("");
  const placeholderEmail = user?.email.endsWith("@identity.scamgraph.invalid");
  const deleteConfirmation = placeholderEmail
    ? user?.name || "DELETE"
    : user?.email;
  useEffect(() => setName(user?.name || ""), [user]);
  const setting = (
    Icon: any,
    title: string,
    detail: string,
    value: boolean,
    onChange: (v: boolean) => void,
  ) => (
    <View
      style={{
        flexDirection: "row",
        gap: 14,
        alignItems: "center",
        paddingVertical: 15,
      }}
    >
      <Icon size={22} color={c.teal} />
      <View style={{ flex: 1 }}>
        <Txt bold size={14}>
          {title}
        </Txt>
        <Txt muted size={11}>
          {detail}
        </Txt>
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: c.line, true: c.teal }}
        thumbColor="#fff"
      />
    </View>
  );
  return (
    <View style={{ gap: 20 }}>
      <Heading
        title={t("ตั้งค่า", "Settings")}
        subtitle={t(
          "ปรับการแสดงผลและจัดการข้อมูลของคุณ",
          "Personalize your experience and manage your data.",
        )}
      />
      <Panel>
        <Txt bold size={17}>
          {t("การแสดงผล", "Appearance")}
        </Txt>
        {setting(
          Moon,
          t("โหมดมืด", "Dark mode"),
          t("อ่านสบายในสภาพแสงน้อย", "Comfortable in low light."),
          dark,
          setDark,
        )}
        <View style={{ borderTopWidth: 1, borderColor: c.line }}>
          {setting(
            Languages,
            t("แสดงผลเป็นภาษาอังกฤษ", "English interface"),
            t("สลับภาษาไทย / English", "Switch Thai / English."),
            english,
            setEnglish,
          )}
        </View>
      </Panel>
      <Panel style={{ gap: 16 }}>
        <Txt bold size={17}>
          {t("บัญชีและความเป็นส่วนตัว", "Account and privacy")}
        </Txt>
        {user ? (
          <>
            <Pill kind="muted">
              {placeholderEmail
                ? t("บัญชีที่เชื่อมผ่านผู้ให้บริการ", "Linked provider account")
                : user.email}{" "}
              ·{" "}
              {user.role === "admin"
                ? t("ผู้ดูแล", "Administrator")
                : t("สมาชิก", "Member")}
            </Pill>
            <Field
              label={t("ชื่อที่แสดง", "Display name")}
              value={name}
              onChangeText={setName}
            />
            <View style={{ flexDirection: "row", gap: 9, flexWrap: "wrap" }}>
              <Button
                small
                icon={Save}
                onPress={async () => {
                  try {
                    const next = await api<User>("/auth/me", {
                      method: "PATCH",
                      body: JSON.stringify({ name }),
                    });
                    onUserUpdate(next);
                    notify(t("บันทึกโปรไฟล์แล้ว", "Profile updated"));
                  } catch (e: any) {
                    notify(e.message, true);
                  }
                }}
              >
                {t("บันทึกโปรไฟล์", "Save profile")}
              </Button>
              <Button small secondary icon={Download} onPress={onExport}>
                {t("ส่งออกข้อมูลของฉัน", "Export my data")}
              </Button>
              <Button small secondary icon={LogOut} onPress={onLogout}>
                {t("ออกจากระบบ", "Sign out")}
              </Button>
            </View>
            <View
              style={{
                borderTopWidth: 1,
                borderColor: c.line,
                paddingTop: 18,
                gap: 12,
              }}
            >
              <Txt muted size={12}>
                {t(
                  "การลบบัญชีจะลบประวัติและข้อมูลส่วนบุคคลของคุณ ไม่สามารถกู้คืนได้",
                  "Deleting your account removes your private history and personal data permanently.",
                )}
              </Txt>
              {confirm ? (
                <>
                  <Field
                    label={
                      placeholderEmail
                        ? t(
                            `พิมพ์ ${deleteConfirmation} เพื่อยืนยันการลบ`,
                            `Type ${deleteConfirmation} to confirm deletion`,
                          )
                        : t(
                            "พิมพ์อีเมลของคุณเพื่อยืนยันการลบ",
                            "Type your email to confirm deletion",
                          )
                    }
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                  />
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Button
                      small
                      danger
                      disabled={email !== deleteConfirmation}
                      icon={Trash2}
                      onPress={onDelete}
                    >
                      {t("ยืนยันลบบัญชี", "Delete my account")}
                    </Button>
                    <Button small secondary onPress={() => setConfirm(false)}>
                      {t("ยกเลิก", "Cancel")}
                    </Button>
                  </View>
                </>
              ) : (
                <Button
                  small
                  secondary
                  icon={Trash2}
                  onPress={() => setConfirm(true)}
                >
                  {t("ลบบัญชี", "Delete account")}
                </Button>
              )}
            </View>
          </>
        ) : (
          <>
            <Note>
              {t(
                "คุณกำลังใช้ Guest mode ไม่มีประวัติบันทึกในบัญชี",
                "You are in guest mode with no account history.",
              )}
            </Note>
            <Button onPress={onLogin} icon={UserRound}>
              {t("เข้าสู่ระบบ / สร้างบัญชี", "Sign in / Create account")}
            </Button>
          </>
        )}
      </Panel>
      <ProtectionSettings user={user} notify={notify} />
      <Panel style={{ gap: 13 }}>
        <Txt bold size={17}>
          {t("เกี่ยวกับ ScamGraph AI", "About ScamGraph AI")}
        </Txt>
        <Txt size={13}>Predict Before It Gets Reported</Txt>
        <Note>
          {t(
            "เวอร์ชันเดโมใช้โมเดลที่ฝึกจริงจากข้อมูลตัวอย่างและกราฟตัวอย่างที่ติดป้าย ข้อมูลจริงจากภายนอกต้องเพิ่มผ่านแหล่งที่ได้รับอนุญาต",
            "This demo runs trained models on a labeled sample dataset and labeled example graph. External intelligence requires authorized sources.",
          )}
        </Note>
        <Txt muted size={12}>
          {t(
            "คะแนนเป็นค่าความเสี่ยง 0–100 ไม่มีการอ้างเป็นเปอร์เซ็นต์ การไม่พบรายงานหรือมี HTTPS ไม่ได้ยืนยันความปลอดภัย",
            "Risk scores run from 0–100 and are not probabilities. No reports or HTTPS alone do not establish safety.",
          )}
        </Txt>
      </Panel>
    </View>
  );
}
