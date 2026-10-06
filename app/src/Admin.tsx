import React, { useState, useEffect } from "react";
import { View, Pressable, Image, Platform } from "react-native";
import {
  RefreshCw,
  Upload,
  Play,
  Save,
  Check,
  Trash2,
  Settings2,
  ClipboardList,
  Database,
  Activity,
  Layers,
  FileCheck2,
} from "lucide-react-native";
import * as DocumentPicker from "expo-document-picker";
import { api, post, fileForm, apiBlob } from "./api";
import type { User } from "../../shared/api";
import {
  Button,
  Panel,
  Txt,
  Field,
  Pill,
  Note,
  Empty,
  Heading,
  useUI,
  useCopy,
} from "./ui";
export function AdminPage({
  user,
  notify,
}: {
  user: User | null;
  notify: (text: string, error?: boolean) => void;
}) {
  const { c } = useUI(),
    t = useCopy();
  const [tab, setTab] = useState("overview"),
    [data, setData] = useState<any>({}),
    [loading, setLoading] = useState(false),
    [err, setErr] = useState("");
  const [reason, setReason] = useState(""),
    [sourceName, setSourceName] = useState(""),
    [sourceDescription, setSourceDescription] = useState(""),
    [selectedSource, setSelectedSource] = useState(""),
    [medium, setMedium] = useState("40"),
    [high, setHigh] = useState("70"),
    [datasetJob, setDatasetJob] = useState("");
  const [evidencePreview, setEvidencePreview] = useState<
    Record<string, string>
  >({});
  const viewEvidence = async (id: string) => {
    try {
      const blob = await apiBlob(`/reports/evidence/${id}`);
      if (blob.type === "application/pdf" && Platform.OS === "web") {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "scamgraph-evidence.pdf";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      const uri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      setEvidencePreview((v) => ({ ...v, [id]: uri }));
    } catch (e: any) {
      notify(e.message, true);
    }
  };
  const load = async () => {
    if (user?.role !== "admin") return;
    setLoading(true);
    setErr("");
    try {
      const paths = {
        overview: "/admin/stats",
        reports: "/admin/reports",
        sources: "/admin/sources",
        models: "/admin/stats",
        config: "/admin/thresholds",
        health: "/admin/health",
        audit: "/admin/audit",
      };
      const res = await api(paths[tab as keyof typeof paths]);
      setData(res);
      if (tab === "config") {
        setMedium(String(res.medium));
        setHigh(String(res.high));
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [tab, user]);
  const moderate = async (id: string, status: string) => {
    if (reason.trim().length < 10) {
      notify(
        t(
          "กรอกเหตุผลอย่างน้อย 10 ตัวอักษร",
          "Add a review reason (10+ characters)",
        ),
        true,
      );
      return;
    }
    try {
      await api(`/admin/reports/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason }),
      });
      notify(
        t("บันทึกการตรวจและ audit log แล้ว", "Review and audit log saved"),
      );
      await load();
    } catch (e: any) {
      notify(e.message, true);
    }
  };
  const upload = async (path: string) => {
    try {
      const chosen = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "application/json", "text/plain"],
        copyToCacheDirectory: true,
      });
      if (chosen.canceled) return;
      setLoading(true);
      const res = await api(path, {
        method: "POST",
        body: await fileForm(chosen.assets[0]),
      });
      if (res.id) setDatasetJob(res.id);
      if (res.job_id) setDatasetJob(res.job_id);
      setData((v: any) => ({ ...v, import_result: res }));
      notify(
        t(
          "รับไฟล์แล้ว ดูผลการตรวจด้านล่าง",
          "File received. See the validation result below.",
        ),
      );
    } catch (e: any) {
      notify(e.message, true);
    } finally {
      setLoading(false);
    }
  };
  if (user?.role !== "admin")
    return (
      <Panel>
        <Empty
          title={t("สำหรับผู้ดูแลระบบ", "Administrator access required")}
          detail={t(
            "เข้าสู่ระบบด้วยบัญชีผู้ดูแลเพื่อจัดการข้อมูล",
            "Sign in as an administrator to manage the system.",
          )}
        />
      </Panel>
    );
  return (
    <View style={{ gap: 20 }}>
      <Heading
        title={t("ผู้ดูแลระบบ", "Administration")}
        subtitle={t(
          "สถิติจากการทำงานจริง • การเปลี่ยนแปลงมี audit log",
          "Live system records · changes are audited",
        )}
        action={
          <Button
            small
            secondary
            loading={loading}
            onPress={load}
            icon={RefreshCw}
          >
            {t("รีเฟรช", "Refresh")}
          </Button>
        }
      />
      <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap" }}>
        {[
          ["overview", "ภาพรวม", "Overview"],
          ["reports", "ตรวจเบาะแส", "Review reports"],
          ["sources", "แหล่งข้อมูล", "Sources"],
          ["models", "โมเดล / Training", "Models / Training"],
          ["config", "Thresholds", "Thresholds"],
          ["health", "Health", "Health"],
          ["audit", "Audit log", "Audit log"],
        ].map(([k, th, en]) => (
          <Pressable
            key={k}
            onPress={() => setTab(k)}
            style={{
              paddingVertical: 9,
              paddingHorizontal: 13,
              borderRadius: 8,
              backgroundColor: tab === k ? c.soft : c.card,
              borderWidth: 1,
              borderColor: tab === k ? c.teal : c.line,
            }}
          >
            <Txt size={12} bold={tab === k}>
              {t(th, en)}
            </Txt>
          </Pressable>
        ))}
      </View>
      {err && <Note>{err}</Note>}
      {tab === "overview" && (
        <>
          <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
            {[
              ["analyses_total", "การตรวจทั้งหมด", "Analyses"],
              ["users_total", "ผู้ใช้ในระบบ", "Users"],
              ["reports_pending", "เบาะแสรอตรวจ", "Pending reports"],
            ].map(([key, th, en]) => (
              <Panel key={key} style={{ flex: 1, minWidth: 180 }}>
                <Txt muted size={12}>
                  {t(th, en)}
                </Txt>
                <Txt bold size={34}>
                  {data[key] ?? "—"}
                </Txt>
              </Panel>
            ))}
          </View>
          <Panel style={{ gap: 14 }}>
            <Txt bold size={17}>
              {t("ระดับความเสี่ยงจากการตรวจ", "Analysis levels")}
            </Txt>
            {Object.entries(data.levels || {}).map(([key, n]: any) => (
              <View
                key={key}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Txt size={13}>{key}</Txt>
                <Txt bold size={14}>
                  {typeof n === "number" ? n : JSON.stringify(n)}
                </Txt>
              </View>
            ))}
          </Panel>
          <Note>
            {t(
              "จำนวนนี้นับจากบันทึกในฐานข้อมูล ไม่มีตัวเลขผู้ใช้หรือการตรวจที่สร้างขึ้นเพื่อเดโม",
              "Counts come directly from database records. No invented usage statistics.",
            )}
          </Note>
        </>
      )}
      {tab === "reports" && (
        <>
          <Panel>
            <Field
              label={t(
                "เหตุผลสำหรับการอนุมัติ / ปฏิเสธ",
                "Reason for verification or rejection",
              )}
              value={reason}
              onChangeText={setReason}
              multiline
              placeholder={t(
                "ระบุหลักฐานที่ใช้ในการตัดสิน…",
                "Describe the evidence behind this review…",
              )}
            />
          </Panel>
          {(data.items || []).length ? (
            (data.items || []).map((r: any) => (
              <Panel key={r.id} style={{ gap: 13 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Pill kind="muted">{r.status}</Pill>
                  <Txt muted size={10}>
                    {r.id}
                  </Txt>
                </View>
                <Txt size={13}>{r.text}</Txt>
                <Txt muted size={12}>
                  {r.detail}
                </Txt>
                {(r.evidence || []).map((id: string) => (
                  <View key={id} style={{ gap: 10 }}>
                    <Button
                      small
                      secondary
                      icon={FileCheck2}
                      onPress={() => viewEvidence(id)}
                    >
                      {t("เปิดหลักฐานที่แนบ", "View attached evidence")}
                    </Button>
                    {evidencePreview[id] && (
                      <Image
                        source={{ uri: evidencePreview[id] }}
                        style={{ width: "100%", height: 240 }}
                        resizeMode="contain"
                      />
                    )}
                  </View>
                ))}
                <View style={{ flexDirection: "row", gap: 9 }}>
                  <Button
                    small
                    icon={Check}
                    onPress={() => moderate(r.id, "verified")}
                  >
                    {t("ยืนยันหลังตรวจ", "Verify")}
                  </Button>
                  <Button
                    small
                    secondary
                    onPress={() => moderate(r.id, "rejected")}
                  >
                    {t("ปฏิเสธ", "Reject")}
                  </Button>
                </View>
              </Panel>
            ))
          ) : (
            <Panel>
              <Empty title={t("ไม่มีเบาะแสรอตรวจ", "No pending reports")} />
            </Panel>
          )}
        </>
      )}
      {tab === "sources" && (
        <>
          <Panel style={{ gap: 14 }}>
            <Txt bold size={16}>
              {t("เพิ่มแหล่งข้อมูลที่ได้รับอนุญาต", "Add an authorized source")}
            </Txt>
            <Field
              label={t("ชื่อแหล่งข้อมูล", "Source name")}
              value={sourceName}
              onChangeText={setSourceName}
            />
            <Field
              label={t(
                "รายละเอียด / ขอบเขตสิทธิ์ใช้ข้อมูล",
                "Description / data authorization",
              )}
              value={sourceDescription}
              onChangeText={setSourceDescription}
            />
            <Button
              onPress={async () => {
                try {
                  await post("/admin/sources", {
                    name: sourceName,
                    description: sourceDescription,
                    is_sample: false,
                  });
                  setSourceName("");
                  setSourceDescription("");
                  await load();
                  notify(t("เพิ่มแหล่งข้อมูลแล้ว", "Source added"));
                } catch (e: any) {
                  notify(e.message, true);
                }
              }}
            >
              {t("เพิ่มแหล่งข้อมูล", "Add source")}
            </Button>
          </Panel>
          <Panel style={{ gap: 14 }}>
            <Txt bold size={16}>
              {t("นำเข้า Known Intelligence", "Import known intelligence")}
            </Txt>
            <Note>
              {t(
                "CSV/JSON: type, value, evidence, status, retrieved_at โดย status ใช้ reported หรือ verified ข้อมูลต้องได้รับอนุญาตและระบุที่มา",
                "CSV/JSON fields: type, value, evidence, status, retrieved_at. Status is reported or verified. Use authorized data with provenance.",
              )}
            </Note>
            {(data.items || []).map((s: any) => (
              <Pressable
                key={s.id}
                onPress={() => setSelectedSource(s.id)}
                style={{
                  padding: 13,
                  borderWidth: 1,
                  borderColor: selectedSource === s.id ? c.teal : c.line,
                  borderRadius: 9,
                }}
              >
                <Txt bold size={13}>
                  {s.name}
                </Txt>
                <Txt muted size={11}>
                  {s.description}
                </Txt>
                {s.is_sample && (
                  <Pill>{t("ข้อมูลตัวอย่าง", "Sample source")}</Pill>
                )}
                <Button
                  small
                  secondary
                  onPress={async () => {
                    try {
                      await api(`/admin/sources/${s.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ enabled: !s.enabled }),
                      });
                      await load();
                      notify(
                        t("บันทึกสถานะแหล่งข้อมูลแล้ว", "Source status saved"),
                      );
                    } catch (e: any) {
                      notify(e.message, true);
                    }
                  }}
                >
                  {s.enabled
                    ? t("ปิดใช้แหล่งนี้", "Disable source")
                    : t("เปิดใช้แหล่งนี้", "Enable source")}
                </Button>
              </Pressable>
            ))}
            <Button
              icon={Upload}
              loading={loading}
              disabled={!selectedSource}
              onPress={() => upload(`/admin/sources/${selectedSource}/import`)}
            >
              {t("นำเข้าในแหล่งที่เลือก", "Import into selected source")}
            </Button>
          </Panel>
        </>
      )}
      {tab === "models" && (
        <>
          <Panel style={{ gap: 14 }}>
            <Txt bold size={17}>
              {t("โมเดลและผลประเมินจริง", "Model and evaluation")}
            </Txt>
            <Pill>
              {t(
                "ชุดข้อมูลตัวอย่าง ไม่อ้างความแม่นยำในโลกจริง",
                "Sample dataset · not real-world accuracy",
              )}
            </Pill>
            <Txt size={12} selectable>
              {JSON.stringify(data.model, null, 2)}
            </Txt>
            <Txt size={12} selectable>
              {JSON.stringify(data.metrics, null, 2)}
            </Txt>
          </Panel>
          <Panel style={{ gap: 14 }}>
            <Txt bold size={17}>
              {t("Dataset และงานฝึก", "Datasets and training jobs")}
            </Txt>
            <Note>
              {t(
                "CSV/JSON ต้องมี text, label (normal/scam), campaign_id และ source ระบบแบ่งชุดตาม campaign/domain และตรวจข้อมูลซ้ำ",
                "CSV/JSON requires text, label (normal/scam), campaign_id, and source. Split by campaign/domain, with duplicate validation.",
              )}
            </Note>
            <View style={{ flexDirection: "row", gap: 9, flexWrap: "wrap" }}>
              <Button
                small
                secondary
                icon={FileCheck2}
                onPress={() => upload("/admin/datasets/validate")}
              >
                {t("ตรวจไฟล์ Dataset", "Validate dataset")}
              </Button>
              <Button
                small
                secondary
                icon={Upload}
                onPress={() => upload("/admin/datasets/import")}
              >
                {t("นำเข้า Dataset", "Import dataset")}
              </Button>
            </View>
            <Field
              label={t(
                "รหัสงานนำเข้า Dataset (เว้นว่าง = ชุดตัวอย่าง)",
                "Imported dataset job ID (blank = sample)",
              )}
              value={datasetJob}
              onChangeText={setDatasetJob}
            />
            <Button
              icon={Play}
              loading={loading}
              onPress={async () => {
                try {
                  const job = await post(
                    "/admin/train",
                    datasetJob ? { dataset_job_id: datasetJob } : {},
                  );
                  setData((v: any) => ({ ...v, training_job: job }));
                  notify(
                    t(
                      "เริ่มงานฝึกแล้ว กดรีเฟรชเพื่อติดตาม",
                      "Training started. Refresh to follow progress.",
                    ),
                  );
                } catch (e: any) {
                  notify(e.message, true);
                }
              }}
            >
              {t("เริ่มฝึกโมเดล", "Start training")}
            </Button>
            {data.training_job && (
              <Txt selectable size={11}>
                {JSON.stringify(data.training_job, null, 2)}
              </Txt>
            )}
            {(data.jobs || []).map((j: any) => (
              <View
                key={j.id}
                style={{
                  borderTopWidth: 1,
                  borderColor: c.line,
                  paddingTop: 12,
                }}
              >
                <Txt bold size={12}>
                  {j.kind || j.type} · {j.status}
                </Txt>
                <Txt muted size={10} selectable>
                  {j.id}
                </Txt>
                {j.error && <Txt size={11}>{j.error}</Txt>}
              </View>
            ))}
          </Panel>
        </>
      )}
      {tab === "config" && (
        <Panel style={{ gap: 16 }}>
          <Txt bold size={17}>
            {t("เกณฑ์ระดับความเสี่ยง 0–100", "Risk score thresholds 0–100")}
          </Txt>
          <Field
            label="MEDIUM"
            value={medium}
            onChangeText={setMedium}
            keyboardType="numeric"
          />
          <Field
            label="HIGH"
            value={high}
            onChangeText={setHigh}
            keyboardType="numeric"
          />
          <Button
            icon={Save}
            onPress={async () => {
              try {
                await api("/admin/thresholds", {
                  method: "PUT",
                  body: JSON.stringify({
                    medium: Number(medium),
                    high: Number(high),
                  }),
                });
                notify(
                  t(
                    "บันทึกเกณฑ์และ audit log แล้ว",
                    "Thresholds and audit log saved",
                  ),
                );
                await load();
              } catch (e: any) {
                notify(e.message, true);
              }
            }}
          >
            {t("บันทึกเกณฑ์", "Save thresholds")}
          </Button>
          <Note>
            {t(
              "คะแนนยังไม่ได้ calibrate จึงไม่ใช่เปอร์เซ็นต์โอกาสโกง",
              "These scores are uncalibrated and are not probabilities.",
            )}
          </Note>
        </Panel>
      )}
      {tab === "health" && (
        <Panel style={{ gap: 15 }}>
          <Txt bold size={17}>
            {t("สถานะบริการจริง", "Live service health")}
          </Txt>
          <Txt size={12} selectable>
            {JSON.stringify(data, null, 2)}
          </Txt>
        </Panel>
      )}
      {tab === "audit" && (
        <Panel style={{ gap: 13 }}>
          <Txt bold size={17}>
            Audit log
          </Txt>
          {(data.items || []).length ? (
            (data.items || []).map((row: any) => (
              <View
                key={row.id}
                style={{
                  borderBottomWidth: 1,
                  borderColor: c.line,
                  paddingBottom: 13,
                }}
              >
                <Txt bold size={12}>
                  {row.action}
                </Txt>
                <Txt muted size={10} selectable>
                  {JSON.stringify(row)}
                </Txt>
              </View>
            ))
          ) : (
            <Empty title={t("ยังไม่มีการเปลี่ยนแปลง", "No changes recorded")} />
          )}
        </Panel>
      )}
      {data.import_result && (
        <Panel style={{ gap: 13 }}>
          <Txt bold size={14}>
            {t("ผลนำเข้า / ตรวจข้อมูล", "Import / validation result")}
          </Txt>
          <Txt size={11} selectable>
            {JSON.stringify(data.import_result, null, 2)}
          </Txt>
        </Panel>
      )}
    </View>
  );
}
