import React, { useEffect, useState } from "react";
import { AppState, View, Switch, Platform } from "react-native";
import * as Linking from "expo-linking";
import {
  PhoneIncoming,
  MessageCircle,
  RefreshCw,
  Link2,
  BellRing,
  ShieldCheck,
} from "lucide-react-native";
import type { User } from "../../shared/api";
import { api } from "./api";
import { startSocial, authErrorMessage } from "./social";
import { GoogleMark } from "./Brand";
import { Panel, Txt, Note, Pill, Button, useCopy, useUI } from "./ui";
import {
  getCallerStatus,
  syncCallerDirectory,
  requestCallerActivation,
  requestCallerNotifications,
  disableCallerProtection,
  openCallerSettings,
  CallerStatus,
  CallerDirectory,
} from "../modules/scamgraph-caller";

type LineSettings = {
  configured: boolean;
  linked: boolean;
  enabled: boolean;
  friendship_status:
    "verified" | "not_following" | "awaiting_webhook" | "not_linked";
  can_enable: boolean;
  official_account_url: string | null;
  last_delivery_status: string | null;
  last_attempt_at: string | null;
  consent_scope: string;
  message: string;
};
export function ProtectionSettings({
  user,
  notify,
}: {
  user: User | null;
  notify: (text: string, error?: boolean) => void;
}) {
  const { c, english } = useUI(),
    t = useCopy();
  const [line, setLine] = useState<LineSettings | null>(null),
    [caller, setCaller] = useState<CallerStatus | null>(null);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const [identities, setIdentities] = useState<string[]>([]),
    [providers, setProviders] = useState<any>(null);
  const loadIdentities = async () => {
    setProviders(await api("/auth/providers"));
    if (user)
      setIdentities(
        (await api<{ providers: string[] }>("/auth/identities")).providers,
      );
    else setIdentities([]);
  };
  const loadLine = async () => {
    if (user) setLine(await api<LineSettings>("/notifications/line"));
    else setLine(null);
  };
  const loadCaller = async () => {
    setCaller(await getCallerStatus());
  };
  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setError("");
    try {
      await action();
    } catch (e: any) {
      setError(authErrorMessage(e.message, english));
    } finally {
      setBusy("");
    }
  };
  const sync = async () => {
    const directory = await api<CallerDirectory>("/caller-id/directory");
    const status = await syncCallerDirectory(directory);
    setCaller(status);
    notify(
      directory.entries.length
        ? t(
            "อัปเดตข้อมูลเบอร์ที่มีหลักฐานแล้ว",
            "Verified caller evidence updated",
          )
        : t(
            "ยังไม่มีเบอร์จากหลักฐานจริงที่ผ่านการตรวจสอบ",
            "There are no verified real caller entries yet",
          ),
    );
  };
  useEffect(() => {
    loadLine().catch((e) => setError(e.message));
    loadIdentities().catch((e) => setError(e.message));
    loadCaller().catch((e) => setError(e.message));
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        loadLine().catch(() => {});
        loadIdentities().catch(() => {});
        loadCaller().catch(() => {});
      }
    });
    return () => listener.remove();
  }, [user?.id]);
  const friendLabels = {
    verified: t("เพิ่มเพื่อนแล้ว", "Friendship verified"),
    not_following: t("ยังไม่ได้เพิ่มเพื่อน", "Not following"),
    awaiting_webhook: t(
      "รอยืนยันการเพิ่มเพื่อน",
      "Awaiting friendship verification",
    ),
    not_linked: t("ยังไม่ได้เชื่อม LINE", "LINE is not linked"),
  };
  return (
    <View style={{ gap: 22 }}>
      {user && (
        <Panel style={{ gap: 15 }}>
          <Txt bold size={17}>
            {t("ตัวเลือกเข้าสู่ระบบของคุณ", "Your sign-in methods")}
          </Txt>
          <Txt muted size={12}>
            {t(
              "เชื่อมผู้ให้บริการกับบัญชีนี้ เพื่อกลับมาใช้ประวัติเดิมได้",
              "Link a provider to this account to keep using the same history.",
            )}
          </Txt>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Button
              small
              secondary
              icon={GoogleMark}
              loading={busy === "googleLink"}
              disabled={
                !!busy ||
                !providers?.google?.enabled ||
                identities.includes("google")
              }
              onPress={() =>
                run("googleLink", async () => {
                  await startSocial("google", "link");
                  await loadIdentities();
                })
              }
            >
              {identities.includes("google")
                ? t("เชื่อม Google แล้ว", "Google linked")
                : t("เชื่อม Google", "Link Google")}
            </Button>
            <Pill kind="muted">
              {identities.includes("line")
                ? t("เชื่อม LINE แล้ว", "LINE linked")
                : t("เชื่อม LINE ได้ด้านล่าง", "Link LINE below")}
            </Pill>
          </View>
        </Panel>
      )}
      <Panel style={{ gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
          <MessageCircle color="#06c755" size={25} />
          <Txt bold size={17}>
            {t("แจ้งเตือนผ่าน LINE", "LINE notifications")}
          </Txt>
        </View>
        <Txt muted size={12}>
          {t(
            "รับการแจ้งเตือนเมื่อคุณบันทึกผลที่มีความเสี่ยงสูง ส่งเฉพาะข้อมูลสรุปที่ปกปิดแล้ว",
            "Receive alerts when you save a high-risk result. Only a masked summary is sent.",
          )}
        </Txt>
        {!user ? (
          <Note>
            {t(
              "เข้าสู่ระบบก่อนเชื่อมบัญชี LINE ของคุณ",
              "Sign in to link your LINE account.",
            )}
          </Note>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Pill kind={line?.configured ? "teal" : "muted"}>
                {line?.configured
                  ? t("บริการพร้อมเชื่อมต่อ", "Service configured")
                  : t("บริการยังไม่เปิดใช้งาน", "Service is not configured")}
              </Pill>
              {line && (
                <Pill kind="muted">{friendLabels[line.friendship_status]}</Pill>
              )}
            </View>
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              {!line?.linked && (
                <Button
                  small
                  secondary
                  icon={Link2}
                  disabled={!!busy || !providers?.line?.enabled}
                  onPress={() =>
                    run("link", async () => {
                      await startSocial("line", "link");
                      await loadLine();
                      await loadIdentities();
                    })
                  }
                >
                  {t("เชื่อมบัญชี LINE", "Link LINE account")}
                </Button>
              )}
              {line?.official_account_url && (
                <Button
                  small
                  secondary
                  icon={MessageCircle}
                  onPress={() =>
                    run("friend", async () => {
                      const url = new URL(line.official_account_url!);
                      if (
                        url.protocol !== "https:" ||
                        url.hostname !== "line.me"
                      )
                        throw Error("Invalid LINE Official Account URL");
                      await Linking.openURL(url.href);
                    })
                  }
                >
                  {t("เพิ่มเพื่อนบัญชีทางการ", "Add the Official Account")}
                </Button>
              )}
              <Button
                small
                secondary
                icon={RefreshCw}
                loading={busy === "lineRefresh"}
                disabled={!!busy}
                onPress={() => run("lineRefresh", loadLine)}
              >
                {t("ตรวจสถานะ", "Refresh status")}
              </Button>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 15,
                borderTopWidth: 1,
                borderColor: c.line,
                paddingTop: 15,
              }}
            >
              <View style={{ flex: 1 }}>
                <Txt bold size={13}>
                  {t("เปิดการแจ้งเตือน LINE", "Enable LINE alerts")}
                </Txt>
                <Txt muted size={11}>
                  {t(
                    "ปิดได้ทุกเมื่อ ข้อความต้นฉบับและเลขเต็มจะไม่ถูกส่ง",
                    "Turn off anytime. Original content and full numbers are excluded.",
                  )}
                </Txt>
              </View>
              <Switch
                accessibilityLabel={t(
                  "เปิดการแจ้งเตือน LINE",
                  "Enable LINE alerts",
                )}
                value={!!line?.enabled}
                disabled={!!busy || (!line?.can_enable && !line?.enabled)}
                onValueChange={(enabled) =>
                  run("lineConsent", async () => {
                    setLine(
                      await api<LineSettings>("/notifications/line", {
                        method: "PUT",
                        body: JSON.stringify({ enabled }),
                      }),
                    );
                  })
                }
              />
            </View>
            {line?.configured && !line.can_enable && (
              <Note>
                {t(
                  "เชื่อม LINE แล้วเพิ่มเพื่อนบัญชีทางการ จากนั้นกดตรวจสถานะเพื่อยืนยัน ก่อนเปิดการแจ้งเตือน",
                  "Link LINE, add the Official Account, then refresh to verify before enabling alerts.",
                )}
              </Note>
            )}
            {line?.last_delivery_status && (
              <Txt muted size={11}>
                {t("การส่งล่าสุด", "Last delivery")}:{" "}
                {(
                  {
                    sent: t(
                      "LINE รับคำขอแล้ว ยังไม่ยืนยันว่าอ่านแล้ว",
                      "Accepted by LINE; reading is not confirmed",
                    ),
                    timeout: t(
                      "LINE ตอบกลับช้า ตรวจผลได้ในแอพ แต่ยังยืนยันการรับคำขอไม่ได้",
                      "LINE timed out. Your result is available in the app; acceptance is unconfirmed.",
                    ),
                    unavailable: t(
                      "LINE รับคำขอไม่ได้ ผลตรวจยังอยู่ในแอพ",
                      "LINE could not accept the message. Your result remains in the app.",
                    ),
                    queued: t("รอส่ง", "Queued"),
                    not_configured: t(
                      "บริการยังไม่พร้อม",
                      "Service unavailable",
                    ),
                  } as Record<string, string>
                )[line.last_delivery_status] ||
                  t("สถานะการส่งยังไม่พร้อม", "Delivery status is unavailable")}
              </Txt>
            )}
          </>
        )}
      </Panel>
      <Panel style={{ gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
          <PhoneIncoming color={c.teal} size={25} />
          <Txt bold size={17}>
            {t("ตรวจสถานะสายเรียกเข้า", "Incoming caller status")}
          </Txt>
        </View>
        <Txt muted size={12}>
          {t(
            "ตรวจเบอร์กับหลักฐานที่ผ่านการตรวจสอบบนอุปกรณ์ การไม่พบข้อมูลไม่ได้ยืนยันว่าเบอร์ปลอดภัย",
            "Match callers against verified evidence on your device. Missing evidence does not establish safety.",
          )}
        </Txt>
        {caller?.available ? (
          <>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Pill kind={caller.enabled ? "teal" : "muted"}>
                {caller.enabled
                  ? t("เปิดใช้งานบนอุปกรณ์แล้ว", "Enabled on this device")
                  : t("ยังไม่เปิดใช้งาน", "Not enabled")}
              </Pill>
              <Pill kind="muted">
                {t("เบอร์ที่มีหลักฐาน", "Verified entries")}:{" "}
                {caller.cacheCount}
              </Pill>
            </View>
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              <Button
                small
                icon={ShieldCheck}
                disabled={!!busy}
                loading={busy === "activate"}
                onPress={() =>
                  run("activate", async () => {
                    await sync();
                    setCaller(await requestCallerActivation());
                  })
                }
              >
                {t("เปิดตรวจสายเรียกเข้า", "Enable caller protection")}
              </Button>
              <Button
                small
                secondary
                icon={RefreshCw}
                disabled={!!busy}
                loading={busy === "sync"}
                onPress={() => run("sync", sync)}
              >
                {t("อัปเดตข้อมูลเบอร์", "Update caller evidence")}
              </Button>
              {Platform.OS === "android" && !caller.notificationsGranted && (
                <Button
                  small
                  secondary
                  icon={BellRing}
                  disabled={!!busy}
                  onPress={() =>
                    run("permissions", async () =>
                      setCaller(await requestCallerNotifications()),
                    )
                  }
                >
                  {t("อนุญาตแจ้งเตือนสาย", "Allow caller notifications")}
                </Button>
              )}
              <Button
                small
                secondary
                disabled={!!busy}
                onPress={() => run("settings", openCallerSettings)}
              >
                {t("ตั้งค่าบนอุปกรณ์", "Device settings")}
              </Button>
              <Button
                small
                secondary
                disabled={!!busy}
                onPress={() =>
                  run("disable", async () => {
                    setCaller(await disableCallerProtection());
                    notify(
                      t(
                        "ปิดการตรวจสายและล้างข้อมูลบนอุปกรณ์แล้ว",
                        "Caller protection disabled and device evidence cleared.",
                      ),
                    );
                  })
                }
              >
                {t("ปิดตรวจสายเรียกเข้า", "Disable caller protection")}
              </Button>
            </View>
            <Txt muted size={11}>
              {caller.cacheCurrent
                ? t(
                    "ข้อมูลบนอุปกรณ์ยังไม่หมดอายุ",
                    "Device evidence is current",
                  )
                : t(
                    "ข้อมูลหมดอายุหรือยังไม่มีข้อมูล กรุณาอัปเดต",
                    "Evidence is missing or expired. Please update.",
                  )}
              {caller.cacheExpiresAt
                ? ` · ${new Date(caller.cacheExpiresAt).toLocaleString()}`
                : ""}
            </Txt>
            {caller.lastLookup && (
              <View
                style={{
                  padding: 15,
                  borderRadius: 12,
                  backgroundColor: c.soft,
                  gap: 5,
                }}
              >
                <Txt bold size={13}>
                  {t(
                    "สายล่าสุดที่ตรวจบนอุปกรณ์",
                    "Last caller checked on this device",
                  )}
                </Txt>
                <Txt size={12}>
                  {caller.lastLookup.maskedPhone} ·{" "}
                  {caller.lastLookup.status === "known_verified_evidence"
                    ? t("พบหลักฐานที่ผ่านการตรวจสอบ", "Verified evidence found")
                    : t("ข้อมูลไม่เพียงพอ", "Insufficient data")}
                </Txt>
                {caller.lastLookup.source && (
                  <Txt muted size={11}>
                    {t("แหล่งข้อมูล", "Source")}: {caller.lastLookup.source}
                  </Txt>
                )}
                <Txt muted size={11}>
                  {new Date(caller.lastLookup.checkedAt).toLocaleString()}
                </Txt>
              </View>
            )}
            <Note>
              {Platform.OS === "android"
                ? t(
                    "Android จะแจ้งสถานะจากข้อมูลที่ยังไม่หมดอายุ ไม่มีการบล็อกสายหรืออ่านเสียงสนทนา",
                    "Android uses unexpired local evidence. Calls are allowed and conversations are not recorded.",
                  )
                : t(
                    "iPhone แสดงชื่อเฉพาะเบอร์ที่อยู่ในรายการที่ซิงก์ ต้องเปิด Call Directory ใน Settings เบอร์อื่นจะไม่มีสถานะจากแอพหรือการแจ้งเตือนจากแอพ รายการในระบบอาจคงอยู่จนกว่าจะอัปเดตอีกครั้ง",
                    "iPhone labels numbers in the synced directory. Enable Call Directory in Settings. Other callers have no app status or app notification; system labels may remain until the next refresh.",
                  )}
            </Note>
          </>
        ) : (
          <Note>
            {t(
              "ใช้ฟังก์ชันนี้ในแอพที่ติดตั้งบน Android หรือ iPhone เวอร์ชันเว็บและ Expo Go ไม่สามารถตรวจสายที่โทรเข้าเครื่องได้",
              "Install the native Android or iPhone app to use this feature. Web and Expo Go cannot identify device calls.",
            )}
          </Note>
        )}
        <Note>
          {t(
            "เบอร์ที่มีรายงานไม่ใช่คำตัดสินว่าผู้โทรเป็นมิจฉาชีพ เบอร์อาจถูกปลอมแปลงได้ ไม่พบประวัติก็ไม่ได้ยืนยันว่าปลอดภัย",
            "A report does not establish the caller’s identity or guilt. Caller numbers can be spoofed; no history does not establish safety.",
          )}
        </Note>
      </Panel>
      {!!error && (
        <Txt accessibilityRole="alert" size={12} style={{ color: "#ad3f4a" }}>
          {error}
        </Txt>
      )}
    </View>
  );
}
