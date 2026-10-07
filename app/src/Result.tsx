import React, { useState } from "react";
import { View, Pressable, Linking, useWindowDimensions } from "react-native";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import {
  ShieldAlert,
  ShieldCheck,
  HelpCircle,
  AlertTriangle,
  Save,
  Share2,
  Download,
  Flag,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  Network,
  Info,
  CheckCircle2,
  Database,
} from "lucide-react-native";
import type { Analysis } from "../../shared/api";
import {
  Button,
  Panel,
  Txt,
  Pill,
  Note,
  Heading,
  useUI,
  useCopy,
  levelCopy,
  statusCopy,
  entityCopy,
} from "./ui";
import { GraphCanvas } from "./GraphCanvas";
export function Result({
  result,
  onBack,
  onSave,
  onShare,
  onExport,
  onReport,
  onFeedback,
  busy,
}: {
  result: Analysis;
  onBack: () => void;
  onSave: () => void;
  onShare: () => void;
  onExport: () => void;
  onReport: () => void;
  onFeedback: (correct: boolean) => void;
  busy: boolean;
}) {
  const { c, dark, english } = useUI(),
    t = useCopy(),
    { width } = useWindowDimensions();
  const [technical, setTechnical] = useState(false);
  const tone =
    result.level === "HIGH"
      ? dark ? "#ffadbf" : "#bc3452"
      : result.level === "MEDIUM"
        ? dark ? "#f7d789" : "#986417"
        : result.level === "LOW"
          ? dark ? "#76e2c6" : "#16806b"
          : c.muted;
  const riskBackground = result.level === "HIGH"
    ? dark ? "#372438" : "#fff2f5"
    : result.level === "MEDIUM"
      ? dark ? "#322b23" : "#fff8e9"
      : result.level === "LOW"
        ? dark ? "#12352f" : "#ecfbf6"
        : c.soft;
  const riskBorder = result.level === "HIGH"
    ? dark ? "#664158" : "#f6d5df"
    : result.level === "MEDIUM"
      ? dark ? "#605334" : "#efdfb8"
      : result.level === "LOW"
        ? dark ? "#285448" : "#c8ebe2"
        : c.line;
  const Icon =
    result.level === "HIGH"
      ? ShieldAlert
      : result.level === "MEDIUM"
        ? AlertTriangle
        : result.level === "LOW"
          ? ShieldCheck
          : HelpCircle;
  const score = result.score;
  const circumference = 2 * Math.PI * 60;
  return (
    <View style={{ gap: 20 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
        >
          <ArrowLeft size={16} color={c.teal} />
          <Txt size={12} style={{ color: c.teal }}>
            {t("ตรวจรายการใหม่", "New analysis")}
          </Txt>
        </Pressable>
        <Txt muted size={10}>
          {new Date(result.checked_at).toLocaleString(
            english ? "en-GB" : "th-TH",
          )}{" "}
          · {result.input_kind}
        </Txt>
      </View>
      <Panel style={{ padding: width < 600 ? 22 : 28, backgroundColor: riskBackground, borderColor: riskBorder, overflow: "hidden" }}>
        <View
          style={{
            flexDirection: width >= 780 ? "row" : "column",
            alignItems: width >= 780 ? "center" : "flex-start",
            gap: 26,
          }}
        >
          <View
            style={{
              alignItems: "center",
              alignSelf: width < 780 ? "center" : "auto",
              minWidth: 165,
            }}
          >
            <Svg width={165} height={165} viewBox="0 0 165 165">
              <Circle
                cx="82"
                cy="82"
                r="60"
                fill="none"
                stroke={c.line}
                strokeWidth="8"
              />
              {score !== null && (
                <Circle
                  cx="82"
                  cy="82"
                  r="60"
                  fill="none"
                  stroke={tone}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={circumference * (1 - score / 100)}
                  transform="rotate(-90 82 82)"
                />
              )}
              <SvgText
                x="82"
                y="86"
                fontSize="34"
                fontFamily="ThaiBold"
                fontWeight="bold"
                textAnchor="middle"
                fill={tone}
              >
                {score === null ? "—" : score.toFixed(2)}
              </SvgText>
              <SvgText
                x="82"
                y="110"
                textAnchor="middle"
                fontSize="10"
                fontFamily="Thai"
                fill={c.muted}
              >
                {t("คะแนนความเสี่ยง / 100", "RISK SCORE / 100")}
              </SvgText>
            </Svg>
          </View>
          <View style={{ flex: 1, gap: 11 }}>
            <View
              style={{ flexDirection: "row", gap: 13, alignItems: "center" }}
            >
              <View style={{ width: 56, height: 56, borderRadius: 20, backgroundColor: dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.85)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: riskBorder }}><Icon size={31} color={tone} /></View>
              <View style={{ flex: 1 }}>
                <Txt muted size={10}>{t("สรุปผลการตรวจสอบ", "ANALYSIS SUMMARY")}</Txt>
                <Txt bold size={24} style={{ color: tone }}>{levelCopy(result.level, english)}</Txt>
              </View>
            </View>
            <Txt size={15}>
              {english
                ? (
                    {
                      HIGH: "High risk signals were found. Pause and verify through official channels.",
                      MEDIUM:
                        "Some signals need further checking before you act.",
                      LOW: "Few risk signals were found in this content. This does not establish safety.",
                      "INSUFFICIENT DATA":
                        "Available data is insufficient for a meaningful risk score.",
                    } as Record<string, string>
                  )[result.level] || result.summary
                : result.summary}
            </Txt>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {result.model.dataset_is_sample && (
                <Pill>
                  {t(
                    "โมเดลทดลอง • ข้อมูลตัวอย่าง",
                    "Experimental · sample dataset",
                  )}
                </Pill>
              )}
              <Pill kind="muted">
                {t("ไม่ใช่เปอร์เซ็นต์โอกาสโกง", "Not a fraud probability")}
              </Pill>
            </View>
            <Txt muted size={11}>
              {t(
                "คะแนนจากสัญญาณที่ตรวจพบ ณ เวลาตรวจ ข้อมูลใหม่อาจทำให้ผลเปลี่ยนได้",
                "Based on available signals at the time of analysis. New evidence may change the result.",
              )}
            </Txt>
          </View>
        </View>
        <View
          style={{
            borderTopWidth: 1,
            borderColor: riskBorder,
            paddingTop: 20,
            marginTop: 22,
            flexDirection: "row",
            gap: 9,
            flexWrap: "wrap",
          }}
        >
          <Button small onPress={onSave} icon={Save} loading={busy}>
            {t("บันทึกผล", "Save result")}
          </Button>
          <Button small secondary onPress={onShare} icon={Share2}>
            {t("แชร์แบบปกปิดข้อมูล", "Share masked result")}
          </Button>
          <Button small secondary onPress={onExport} icon={Download}>
            {t("ส่งออก", "Export")}
          </Button>
          <Button small secondary={result.level !== "HIGH"} danger={result.level === "HIGH"} onPress={onReport} icon={Flag}>
            {t("แจ้งเบาะแส", "Report a clue")}
          </Button>
        </View>
      </Panel>
      <View
        style={{ flexDirection: width >= 1050 ? "row" : "column", gap: 20 }}
      >
        <Panel style={{ flex: 1.4, gap: 17 }}>
          <Txt bold size={17}>
            {t("สิ่งที่ตรวจพบ", "What we found")}
          </Txt>
          {result.reasons.length ? (
            result.reasons.map((r, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <View
                  style={{
                    backgroundColor: c.soft,
                    padding: 8,
                    borderRadius: 9,
                  }}
                >
                  <SearchDot color={c.teal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt bold size={13}>
                    {evidenceCopy(r, english, "title")}
                  </Txt>
                  <Txt muted size={12} style={{ marginTop: 3 }}>
                    {evidenceCopy(r, english, "detail")}
                  </Txt>
                  <Txt muted size={10} style={{ marginTop: 3 }}>
                    {sourceCopy(r.source, english)}
                  </Txt>
                </View>
              </View>
            ))
          ) : (
            <Note>
              {t(
                "ไม่พบปัจจัยเสี่ยงชัดเจนในข้อมูลนี้ แต่ไม่ได้ยืนยันว่าปลอดภัย",
                "No clear risk signal was found. This does not establish safety.",
              )}
            </Note>
          )}
          {result.anomaly && result.anomaly.status !== "not_applicable" && (
            <View
              style={{ borderTopWidth: 1, borderColor: c.line, paddingTop: 14 }}
            >
              <Txt bold size={12}>
                {t("ความผิดปกติของรูปแบบ", "Pattern anomaly")}
              </Txt>
              <Txt muted size={11}>
                {result.anomaly.status === "ready"
                  ? result.anomaly.unusual
                    ? t(
                        "รูปแบบลิงก์แตกต่างจากกลุ่มข้อมูลอ้างอิง",
                        "The URL pattern differs from the reference data",
                      )
                    : t(
                        "รูปแบบลิงก์ไม่แตกต่างจากกลุ่มอ้างอิงอย่างชัดเจน",
                        "No clear deviation from reference URL patterns",
                      )
                  : t(
                      "การตรวจความผิดปกติยังไม่พร้อม",
                      "Anomaly analysis is unavailable",
                    )}
              </Txt>
              <Txt muted size={10}>
                {t(
                  "แสดงแยกจากผลจำแนก ไม่ใช่ความน่าจะเป็นการโกง",
                  "Separate from scam classification; not a fraud probability.",
                )}
              </Txt>
            </View>
          )}
        </Panel>
        <Panel style={{ flex: 1, gap: 14 }}>
          <Txt bold size={17}>
            {t("สิ่งที่คุณทำต่อได้", "What you can do next")}
          </Txt>
          {result.advice.map((a, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 9 }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  backgroundColor: c.soft,
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 2,
                }}
              >
                <Txt bold size={10} style={{ color: c.teal }}>
                  {i + 1}
                </Txt>
              </View>
              <Txt size={12} style={{ flex: 1 }}>
                {english
                  ? [
                      "Do not share an OTP or password, or transfer money because of this message.",
                      "Contact the organization through an official app or a number you find independently.",
                      "Check the evidence and missing information before deciding.",
                    ][i] || a
                  : a}
              </Txt>
            </View>
          ))}
          <View style={{ marginTop: 5 }}>
            <Note>
              {t(
                "ตรวจสอบกับองค์กรผ่านช่องทางที่คุณหาเอง ก่อนโอนเงินหรือให้รหัส OTP",
                "Independently contact the organization before transferring money or sharing an OTP.",
              )}
            </Note>
          </View>
        </Panel>
      </View>
      <Panel style={{ gap: 15 }}>
        <View style={{ flexDirection: "row", gap: 9, alignItems: "center" }}>
          <Database size={19} color={c.teal} />
          <Txt bold size={17}>
            {t("ประวัติและแหล่งข้อมูล", "History and sources")}
          </Txt>
          <Pill kind="muted">
            {statusCopy(String(result.history.status), english)}
          </Pill>
        </View>
        {result.history.matches.length ? (
          result.history.matches.map((m, i) => (
            <View
              key={i}
              style={{
                padding: 14,
                borderWidth: 1,
                borderColor: c.line,
                borderRadius: 10,
                gap: 5,
              }}
            >
              <Txt bold size={12}>
                {String(m.source || m.source_name || m.name || "")}
              </Txt>
              <Txt muted size={12}>
                {String(m.evidence || m.detail || "")}
              </Txt>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pill kind={m.is_sample ? "sample" : "muted"}>
                  {m.is_sample
                    ? t("ข้อมูลตัวอย่าง", "Sample data")
                    : String(m.status || m.verification_status || "")}
                </Pill>
                <Txt muted size={10}>
                  {String(m.retrieved_at || m.created_at || "")}
                </Txt>
              </View>
              {!m.is_sample && typeof m.source_url === "string" && /^https?:\/\//.test(m.source_url) && <Button small secondary onPress={()=>Linking.openURL(String(m.source_url))}>{t("เปิดแหล่งข้อมูลต้นทาง","Open original source")}</Button>}
            </View>
          ))
        ) : (
          <Note>
            {t(
              "ไม่พบประวัติในแหล่งข้อมูลที่เชื่อมต่อ การไม่มีรายงานไม่ใช่หลักฐานว่าปลอดภัย",
              "No history was found in connected sources. An absence of reports is not evidence of safety.",
            )}
          </Note>
        )}
        <View style={{ gap: 10, marginTop: 6 }}>
          <Txt muted size={11}>{t("ช่องทางตรวจเพิ่มเติม (ระบบไม่ได้ดึงข้อมูลจากเว็บไซต์เหล่านี้)", "Additional channels (these sites are not integrated data sources)")}</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button small secondary onPress={()=>Linking.openURL("https://www.bot.or.th/")}>{t("ธนาคารแห่งประเทศไทย", "Bank of Thailand")}</Button>
            <Button small secondary onPress={()=>Linking.openURL("https://www.thaipoliceonline.go.th/")}>{t("ช่องทางตำรวจออนไลน์", "Thai Police Online")}</Button>
          </View>
        </View>
      </Panel>
      {!!result.entities.length && (
        <Panel style={{ gap: 14 }}>
          <Txt bold size={17}>
            {t("เบาะแสที่แยกได้", "Extracted entities")}{" "}
            <Txt muted size={12}>
              ({result.entities.length})
            </Txt>
          </Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {result.entities.map((e, i) => (
              <View
                key={e.id || i}
                style={{
                  backgroundColor: c.bg,
                  padding: 12,
                  borderRadius: 9,
                  borderWidth: 1,
                  borderColor: c.line,
                  gap: 4,
                }}
              >
                <Txt muted size={10}>
                  {entityCopy(e.type, english)}
                </Txt>
                <Txt bold size={12} selectable>
                  {e.value}
                </Txt>
              </View>
            ))}
          </View>
        </Panel>
      )}
      {!!result.graph.nodes.length && (
        <Panel style={{ gap: 16 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Txt bold size={17}>
              {t("ความสัมพันธ์ของเบาะแส", "Evidence connections")}
            </Txt>
            {(result.graph.is_sample ||
              result.history.matches.some((x) => x.is_sample)) && (
              <Pill>{t("มีข้อมูลตัวอย่าง", "Includes sample data")}</Pill>
            )}
          </View>
          <GraphCanvas data={result.graph} dark={dark} english={english} />
        </Panel>
      )}
      {!!result.similar_examples.length && (
        <Panel style={{ gap: 13 }}>
          <Txt bold size={17}>
            {t("ข้อความตัวอย่างที่มีลักษณะคล้าย", "Similar example messages")}
          </Txt>
          <Txt muted size={11}>
            {t(
              "ความคล้ายช่วยค้นหาบริบท ไม่ใช่หลักฐานยืนยันการโกง",
              "Similarity is a retrieval signal. It does not prove fraud.",
            )}
          </Txt>
          {result.similar_examples.map((ex, i) => (
            <View
              key={i}
              style={{
                padding: 15,
                borderWidth: 1,
                borderColor: c.line,
                borderRadius: 10,
                gap: 7,
              }}
            >
              <Txt size={12}>{ex.text}</Txt>
              <Txt muted size={10}>
                {ex.source} ·{" "}
                {ex.method === "sentence_transformer_cosine"
                  ? t("คล้ายกันด้านความหมาย", "Semantic similarity")
                  : ex.method === "tfidf_lexical_cosine"
                    ? t("คล้ายกันด้านตัวอักษร", "Character similarity")
                    : ex.method}{" "}
                · {t("ค่าความคล้าย", "Similarity")} {ex.similarity.toFixed(3)}{" "}
                {ex.is_sample ? `· ${t("ข้อมูลตัวอย่าง", "sample")}` : ""}
              </Txt>
            </View>
          ))}
        </Panel>
      )}
      {!!result.missing_data.length && (
        <Panel style={{ gap: 11 }}>
          <Txt bold size={16}>
            {t(
              "ข้อมูลที่ยังไม่มี / การตรวจที่ไม่พร้อม",
              "Missing data and unavailable checks",
            )}
          </Txt>
          {result.missing_data.map((m, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8 }}>
              <Info size={14} color={c.muted} style={{ marginTop: 3 }} />
              <Txt muted size={12} style={{ flex: 1 }}>
                {missingCopy(m, english)}
              </Txt>
            </View>
          ))}
        </Panel>
      )}
      <Panel style={{ gap: 14 }}>
        <Pressable
          onPress={() => setTechnical(!technical)}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Txt bold size={14}>
            {t("รายละเอียดทางเทคนิคและโมเดล", "Technical and model details")}
          </Txt>
          {technical ? (
            <ChevronUp size={18} color={c.muted} />
          ) : (
            <ChevronDown size={18} color={c.muted} />
          )}
        </Pressable>
        {technical && (
          <View style={{ gap: 10 }}>
            <Txt size={11} selectable>
              Model: {result.model.version}
            </Txt>
            <Txt size={11} selectable>
              {JSON.stringify(
                result.model.components || result.model.status,
                null,
                2,
              )}
            </Txt>
            <Txt muted size={11}>
              {t(
                "Contribution เป็นหน่วยของโมเดล เช่น log-odds ไม่ใช่เปอร์เซ็นต์ความเสี่ยง",
                "Contributions are in model units such as log-odds, not risk percentages.",
              )}
            </Txt>
            {result.contributions.slice(0, 12).map((v, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <Txt size={11} style={{ flex: 1 }}>
                  {v.feature} · {v.model}
                </Txt>
                <Txt size={11} muted>
                  {v.value.toFixed(4)} {v.unit}
                </Txt>
              </View>
            ))}
            <Txt muted size={11}>
              Score components: {JSON.stringify(result.score_components)} ·
              Thresholds: {JSON.stringify(result.thresholds)} · Graph:{" "}
              {JSON.stringify(result.graph.features)} · Anomaly:{" "}
              {JSON.stringify(result.anomaly)}
            </Txt>
          </View>
        )}
      </Panel>
      <View style={{ alignItems: "center", gap: 10, paddingBottom: 15 }}>
        <Txt muted size={12}>
          {t("ผลนี้ช่วยคุณประเมินได้หรือไม่?", "Was this analysis useful?")}
        </Txt>
        <View style={{ flexDirection: "row", gap: 9 }}>
          <Button
            small
            secondary
            icon={ThumbsUp}
            onPress={() => onFeedback(true)}
          >
            {t("ผลเหมาะสม", "Looks right")}
          </Button>
          <Button
            small
            secondary
            icon={ThumbsDown}
            onPress={() => onFeedback(false)}
          >
            {t("ผลอาจผิด", "May be wrong")}
          </Button>
        </View>
      </View>
    </View>
  );
}
function SearchDot({ color }: { color: string }) {
  return <Network size={16} color={color} />;
}

function missingCopy(value: string, en: boolean) {
  const copy: Record<string, [string, string]> = {
    domain_age: [
      "ยังไม่มีแหล่งข้อมูลอายุโดเมน",
      "Domain-age data is not connected",
    ],
    external_reputation: [
      "ยังไม่มีบริการข้อมูลชื่อเสียงเว็บไซต์ภายนอก",
      "External reputation data is not connected",
    ],
    independent_calibration: [
      "คะแนนยังไม่ได้ปรับเทียบกับข้อมูลจริง",
      "Scores have not been calibrated against real-world data",
    ],
    url_input: ["ไม่มี URL สำหรับตรวจลิงก์", "No URL was supplied"],
    substantive_text: [
      "ไม่มีข้อความเพียงพอสำหรับวิเคราะห์ภาษา",
      "Not enough text for language analysis",
    ],
    text_features_not_in_training_vocabulary: [
      "ข้อความนี้มีคำหรือรูปแบบที่โมเดลยังไม่รู้จัก",
      "The text contains patterns outside the training vocabulary",
    ],
    trained_models: [
      "โมเดลตรวจสอบยังไม่พร้อมใช้งาน",
      "Trained models are unavailable",
    ],
    text_model_unavailable: [
      "การวิเคราะห์ข้อความยังไม่พร้อมใช้งาน",
      "Text analysis is unavailable",
    ],
    url_model_unavailable: [
      "การวิเคราะห์ลิงก์ยังไม่พร้อมใช้งาน",
      "URL analysis is unavailable",
    ],
  };
  return copy[value]?.[en ? 1 : 0] || value;
}

function sourceCopy(value: unknown, en: boolean) {
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((v) => {
      const s = String(v || "");
      if (s.startsWith("normal-reference IsolationForest"))
        return en
          ? "Reference-pattern analysis"
          : "การวิเคราะห์รูปแบบเทียบกลุ่มอ้างอิง";
      if (s.startsWith("URL model"))
        return en ? "Trained URL model" : "โมเดลตรวจลิงก์ที่ฝึกไว้";
      if (s.startsWith("input observation"))
        return en
          ? "Observed in the provided content"
          : "สังเกตจากข้อมูลที่ส่งมา";
      if (s.startsWith("text model") || s.startsWith("trained text model"))
        return en ? "Trained text model" : "โมเดลตรวจข้อความที่ฝึกไว้";
      return s;
    })
    .join(" · ");
}

function evidenceCopy(
  reason: { code: string; title: string; detail: string },
  en: boolean,
  key: "title" | "detail",
) {
  if (!en) return reason[key];
  const labels: Record<string, [string, string]> = {
    TEXT_MODEL_PATTERN: [
      "The text resembles learned risk patterns",
      "The trained experimental text model identified a pattern worth checking; this does not prove fraud.",
    ],
    TEXT_MODEL_REVIEW: [
      "The text model suggests further checking",
      "The experimental score meets the review threshold. Classification thresholds and risk bands are different.",
    ],
    URL_MODEL_PATTERN: [
      "The URL structure warrants checking",
      "The trained URL model found structural signals. Domain age and external reputation are not connected. See model details for feature contributions.",
    ],
    URL_ANOMALY: [
      "The URL differs from reference patterns",
      "This is deviation from normal reference URLs, separate from scam classification and never a fraud probability.",
    ],
    sample_history: [
      "Matched a demonstration record",
      "The matched history is fictional sample data. It does not add to the score.",
    ],
    CREDENTIAL_MENTION: [
      "The content mentions an OTP or password",
      "Check whether this is a request for secret data or a warning. This observation does not add to the score.",
    ],
    URGENCY_MENTION: [
      "Urgency language was found",
      "Pause before acting. Urgency alone does not establish intent and is not counted twice.",
    ],
    reported_source_history: [
      "An unconfirmed source report was found",
      "The imported record is a report, not a confirmed source or a reviewed community finding.",
    ],
    verified_history: [
      "Reviewed or source-confirmed evidence was found",
      "Review the original evidence and its status. This is not a legal judgment.",
    ],
  };
  return labels[reason.code]?.[key === "title" ? 0 : 1] || reason[key];
}
