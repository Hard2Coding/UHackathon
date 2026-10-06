import React, { useState, useEffect } from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import {
  Search,
  Trash2,
  ArrowUpRight,
  Flag,
  ImagePlus,
  UserRound,
  RefreshCw,
  Clock3,
  Download,
} from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import { api, post, fileForm } from "./api";
import type { Analysis, User } from "../../shared/api";
import {
  Panel,
  Button,
  Txt,
  Field,
  Pill,
  Note,
  Empty,
  Heading,
  useUI,
  useCopy,
  levelCopy,
  statusCopy,
} from "./ui";
type PageProps = {
  user: User | null;
  onLogin: () => void;
  notify: (text: string, error?: boolean) => void;
};
export function HistoryPage({
  user,
  onLogin,
  notify,
  onOpen,
}: PageProps & {
  onOpen: (result: Analysis, text: string, kind: string, id: string) => void;
}) {
  const { c, english } = useUI(),
    t = useCopy();
  const [items, setItems] = useState<any[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [level, setLevel] = useState(""),
    [kind, setKind] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        q: query,
        level,
        kind,
        from_date: from,
        to_date: to,
      });
      Object.keys(Object.fromEntries(params)).forEach((k) => {
        if (!params.get(k)) params.delete(k);
      });
      setItems((await api(`/history?${params}`)).items);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [user]);
  const remove = async (id: string) => {
    try {
      await api(`/history/${id}`, { method: "DELETE" });
      setItems((x) => x.filter((y) => y.id !== id));
      notify(t("ลบประวัติแล้ว", "History deleted"));
    } catch (e: any) {
      notify(e.message, true);
    }
  };
  return (
    <View style={{ gap: 20 }}>
      <Heading
        title={t("ประวัติการตรวจสอบ", "Your saved analyses")}
        subtitle={t(
          "ผลที่คุณเลือกบันทึก พร้อมโมเดล ณ เวลาที่ตรวจ",
          "Results you chose to save, with the model version used at the time.",
        )}
      />
      {!user ? (
        <Panel>
          <Empty
            icon={UserRound}
            title={t("บันทึกและเปิดผลย้อนหลัง", "Save and revisit results")}
            detail={t(
              "เข้าสู่ระบบเพื่อดูประวัติของคุณ ตรวจสอบแบบ Guest ได้โดยไม่ต้องสมัคร",
              "Sign in to access your private history. Guest analysis is always available.",
            )}
            action={
              <Button onPress={onLogin}>{t("เข้าสู่ระบบ", "Sign in")}</Button>
            }
          />
        </Panel>
      ) : (
        <>
          <Panel style={{ gap: 14 }}>
            <Field
              placeholder={t(
                "ค้นหาข้อความหรือเบาะแส",
                "Search text or an entity",
              )}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={load}
            />
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              {["", "HIGH", "MEDIUM", "LOW", "INSUFFICIENT DATA"].map((l) => (
                <Pressable key={l} onPress={() => setLevel(l)}>
                  <Pill kind={level === l ? "teal" : "muted"}>
                    {l ? levelCopy(l, english) : t("ทุกระดับ", "All levels")}
                  </Pill>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              {["", "text", "url", "phone", "account", "wallet"].map((k) => (
                <Pressable key={k} onPress={() => setKind(k)}>
                  <Pill kind={kind === k ? "teal" : "muted"}>
                    {k || t("ทุกประเภท", "All types")}
                  </Pill>
                </Pressable>
              ))}
            </View>
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "flex-end",
              }}
            >
              <View style={{ minWidth: 160, flex: 1 }}>
                <Field
                  label={t(
                    "ตั้งแต่วันที่ (YYYY-MM-DD)",
                    "From date (YYYY-MM-DD)",
                  )}
                  placeholder="2026-01-01"
                  value={from}
                  onChangeText={setFrom}
                />
              </View>
              <View style={{ minWidth: 160, flex: 1 }}>
                <Field
                  label={t("ถึงวันที่ (YYYY-MM-DD)", "To date (YYYY-MM-DD)")}
                  placeholder="2026-12-31"
                  value={to}
                  onChangeText={setTo}
                />
              </View>
              <Button onPress={load} loading={loading} icon={Search}>
                {t("ค้นหา", "Search")}
              </Button>
            </View>
          </Panel>
          {error ? (
            <Panel>
              <Empty
                title={t("โหลดประวัติไม่สำเร็จ", "Could not load history")}
                detail={error}
                action={
                  <Button onPress={load} icon={RefreshCw}>
                    {t("ลองอีกครั้ง", "Retry")}
                  </Button>
                }
              />
            </Panel>
          ) : !items.length ? (
            <Panel>
              <Empty
                title={
                  loading
                    ? t("กำลังโหลด…", "Loading…")
                    : t("ยังไม่มีประวัติที่บันทึก", "No saved analyses")
                }
                detail={t(
                  "กดบันทึกผลหลังการตรวจสอบ หรือปรับตัวกรองเพื่อดูผลอื่น",
                  "Save a result after analysis, or adjust your filters.",
                )}
              />
            </Panel>
          ) : (
            items.map((row) => (
              <Panel key={row.id} style={{ padding: 20, gap: 12 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Pill kind={row.level}>{levelCopy(row.level, english)}</Pill>
                  <Txt muted size={10}>
                    {new Date(row.created_at).toLocaleString(
                      english ? "en-GB" : "th-TH",
                    )}{" "}
                    · {row.kind}
                  </Txt>
                </View>
                <Txt size={13} numberOfLines={2}>
                  {row.text}
                </Txt>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Button
                    small
                    secondary
                    icon={ArrowUpRight}
                    onPress={() =>
                      onOpen(row.result, row.text, row.kind, row.id)
                    }
                  >
                    {t("เปิดผลตรวจ", "View result")}
                  </Button>
                  <Button
                    small
                    secondary
                    icon={Trash2}
                    onPress={() => remove(row.id)}
                  >
                    {t("ลบ", "Delete")}
                  </Button>
                </View>
              </Panel>
            ))
          )}
        </>
      )}
    </View>
  );
}
export function ReportsPage({
  user,
  onLogin,
  notify,
  initialText = "",
}: PageProps & { initialText?: string }) {
  const { english } = useUI();
  const t = useCopy();
  const [text, setText] = useState(initialText),
    [detail, setDetail] = useState(""),
    [evidence, setEvidence] = useState<string[]>([]),
    [items, setItems] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (initialText) setText(initialText);
  }, [initialText]);
  const load = async () => {
    if (!user) return;
    try {
      setItems((await api("/reports")).items);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    load();
  }, [user]);
  const attach = async () => {
    if (!user) {
      onLogin();
      return;
    }
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      setBusy(true);
      const data = await fileForm(picked.assets[0]);
      const res = await api("/reports/evidence", {
        method: "POST",
        body: data,
      });
      setEvidence((e) => [...e, res.id]);
      notify(t("แนบหลักฐานแล้ว", "Evidence attached"));
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!user) {
      onLogin();
      return;
    }
    if (!text.trim() || detail.trim().length < 10) {
      notify(
        t(
          "กรอกข้อความและรายละเอียดอย่างน้อย 10 ตัวอักษร",
          "Add the content and at least 10 characters of detail",
        ),
        true,
      );
      return;
    }
    setBusy(true);
    try {
      await post("/reports", { text, kind: "text", detail, evidence });
      setText("");
      setDetail("");
      setEvidence([]);
      notify(t("ส่งเบาะแสแล้ว สถานะรอตรวจสอบ", "Report submitted for review"));
      await load();
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 20 }}>
      <Heading
        title={t("แจ้งเบาะแส", "Report a clue")}
        subtitle={t(
          "ช่วยเพิ่มข้อมูลที่ตรวจสอบได้ ทุกเบาะแสต้องผ่านการตรวจ",
          "Contribute evidence. Every report goes through review.",
        )}
      />
      <Note>
        {t(
          "รายงานใหม่มีสถานะรอตรวจ และไม่ทำให้ผู้ถูกรายงานถูกยืนยันว่าเป็นมิจฉาชีพอัตโนมัติ ข้อมูลส่วนบุคคลจะถูกปกปิดในข้อมูลเผยแพร่",
          "New reports remain pending and never automatically establish fraud. Personal data is masked in published information.",
        )}
      </Note>
      <Panel style={{ gap: 16 }}>
        <Field
          label={t("ข้อความ ลิงก์ หรือเบาะแส", "Message, link, or entity")}
          multiline
          value={text}
          onChangeText={setText}
          maxLength={10000}
          placeholder={t(
            "ข้อมูลที่ต้องการให้ตรวจสอบ…",
            "What should be investigated?",
          )}
        />
        <Field
          label={t("รายละเอียดและบริบท", "Details and context")}
          multiline
          value={detail}
          onChangeText={setDetail}
          maxLength={5000}
          placeholder={t(
            "เกิดอะไรขึ้น เมื่อไร และพบข้อมูลนี้จากที่ไหน",
            "What happened, when, and where did you find this?",
          )}
        />
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Button
            secondary
            small
            icon={ImagePlus}
            onPress={attach}
            disabled={busy}
          >
            {t("แนบหลักฐาน", "Attach evidence")}
          </Button>
          <Txt muted size={11}>
            {evidence.length} {t("ไฟล์แนบ", "attachments")}
          </Txt>
        </View>
        {!user && (
          <Note>
            {t(
              "เข้าสู่ระบบเพื่อส่งเบาะแส แนบไฟล์ และติดตามสถานะของคุณ",
              "Sign in to submit a report, attach files, and follow its status.",
            )}
          </Note>
        )}
        <Button onPress={submit} loading={busy} icon={Flag}>
          {t("ส่งเบาะแสให้ตรวจสอบ", "Submit for review")}
        </Button>
      </Panel>
      <Heading
        title={t("สถานะเบาะแสของคุณ", "Your report status")}
        action={
          <Button small secondary onPress={load} icon={RefreshCw}>
            {t("รีเฟรช", "Refresh")}
          </Button>
        }
      />
      {!user ? (
        <Panel>
          <Empty
            title={t(
              "ติดตามสถานะเมื่อเข้าสู่ระบบ",
              "Sign in to follow reports",
            )}
            action={
              <Button onPress={onLogin}>{t("เข้าสู่ระบบ", "Sign in")}</Button>
            }
          />
        </Panel>
      ) : error ? (
        <Note>{error}</Note>
      ) : !items.length ? (
        <Panel>
          <Empty title={t("ยังไม่มีเบาะแสที่ส่ง", "No reports submitted")} />
        </Panel>
      ) : (
        items.map((r) => (
          <Panel key={r.id} style={{ padding: 20, gap: 8 }}>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Pill kind="muted">{statusCopy(r.status, english)}</Pill>
              <Txt muted size={10}>
                {new Date(r.created_at).toLocaleString()}
              </Txt>
            </View>
            <Txt size={13}>{r.text}</Txt>
            <Txt muted size={12}>
              {r.detail}
            </Txt>
            {r.moderation_reason && (
              <Txt size={12}>
                {t("เหตุผลการตรวจ: ", "Review reason: ")}
                {r.moderation_reason}
              </Txt>
            )}
          </Panel>
        ))
      )}
    </View>
  );
}
