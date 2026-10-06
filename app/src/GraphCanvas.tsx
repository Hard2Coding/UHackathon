import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import Svg, {
  Circle,
  Line,
  G,
  Text as SvgText,
  Defs,
  Pattern,
  Rect,
} from "react-native-svg";
import { Plus, Minus, RotateCcw, Network, Info } from "lucide-react-native";
import { entityCopy } from "./ui";
import type { GraphData, GraphNode, GraphEdge } from "../../shared/api";

const nodeColors: Record<string, string> = {
  url: "#398b91",
  domain: "#3079ba",
  phone: "#9364c8",
  account: "#24605b",
  wallet: "#499084",
  line: "#65a677",
  report: "#d29a3a",
  organization: "#596b7e",
};
const letters: Record<string, string> = {
  url: "↗",
  domain: "W",
  phone: "P",
  account: "฿",
  wallet: "฿",
  line: "L",
  report: "!",
  organization: "O",
};
export function GraphCanvas({
  data,
  dark = false,
  english = false,
  compact = false,
}: {
  data: GraphData;
  dark?: boolean;
  english?: boolean;
  compact?: boolean;
}) {
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState("all");
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState<GraphNode | GraphEdge | null>(null);
  const panRef = useRef(pan);
  panRef.current = pan;
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) + Math.abs(g.dy) > 8,
        onPanResponderGrant: () => {
          panRef.current = pan;
        },
        onPanResponderMove: (_, g) =>
          setPan({ x: panRef.current.x + g.dx, y: panRef.current.y + g.dy }),
      }),
    [pan.x, pan.y],
  );
  const bg = dark ? "#122737" : "#fbfdfd",
    fg = dark ? "#e6eff4" : "#183346",
    muted = dark ? "#a0b4c1" : "#788995",
    line = dark ? "#244354" : "#e4ebee";
  const allNodes = data?.nodes || [];
  const nodes = allNodes
    .filter((n) => filter === "all" || n.type === filter)
    .slice(0, 60);
  const coords = useMemo(
    () =>
      Object.fromEntries(
        nodes.map((n, i) => {
          if (nodes.length === 1) return [n.id, { x: 350, y: 190 }];
          const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
          const inner = n.type === "report";
          const r = inner ? 75 : 145 + (i % 2) * 12;
          return [
            n.id,
            {
              x: 350 + Math.cos(angle) * r * 1.36,
              y: 185 + Math.sin(angle) * r,
            },
          ];
        }),
      ),
    [nodes.map((n) => n.id).join("|")],
  );
  const edges = (data?.edges || []).filter(
    (e) => coords[e.source] && coords[e.target],
  );
  const types = [...new Set(allNodes.map((n) => n.type))];
  const isEdge = selected && "source" in selected && "target" in selected;
  const related =
    selected && !isEdge
      ? (data?.edges || []).filter(
          (e) => e.source === selected.id || e.target === selected.id,
        )
      : [];
  return (
    <View>
      {!compact && (
        <View style={styles.filters}>
          {["all", ...types].map((t) => (
            <Pressable
              key={t}
              accessibilityRole="button"
              onPress={() => {
                setFilter(t);
                setSelected(null);
              }}
              style={[
                styles.pill,
                {
                  backgroundColor:
                    filter === t ? (dark ? "#1f514f" : "#e2f3ee") : bg,
                  borderColor: filter === t ? "#69a99a" : line,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: filter === t ? "#279b82" : muted,
                  fontFamily: "ThaiMedium",
                }}
              >
                {t === "all"
                  ? english
                    ? "All entities"
                    : "ทั้งหมด"
                  : entityCopy(t, english)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <View
        style={{
          height: compact ? 250 : 380,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: line,
          borderRadius: 16,
          overflow: "hidden",
        }}
        {...responder.panHandlers}
      >
        <Svg width="100%" height="100%" viewBox="0 0 700 380">
          <Defs>
            <Pattern
              id="dots"
              x="0"
              y="0"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <Circle cx="2" cy="2" r="1" fill={dark ? "#2a4657" : "#dfe8e9"} />
            </Pattern>
          </Defs>
          <Rect width="700" height="380" fill="url(#dots)" />
          <G
            transform={`translate(${pan.x} ${pan.y}) translate(350 190) scale(${scale}) translate(-350 -190)`}
          >
            {edges.map((e, i) => {
              const a = coords[e.source],
                b = coords[e.target];
              return (
                <G key={e.id || i} onPress={() => setSelected(e)}>
                  <Line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={
                      selected === e ? "#219d88" : dark ? "#426a75" : "#b7cece"
                    }
                    strokeWidth={selected === e ? 3 : 1.6}
                  />
                  <Line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="transparent"
                    strokeWidth={18}
                  />
                </G>
              );
            })}
            {nodes.map((n) => {
              const p = coords[n.id];
              const color = nodeColors[n.type] || "#5a8396";
              const label = String(n.label || n.value || n.id);
              return (
                <G key={n.id} onPress={() => setSelected(n)}>
                  <Circle
                    cx={p.x}
                    cy={p.y}
                    r={selected === n ? 31 : 27}
                    fill={bg}
                    stroke={color}
                    strokeWidth={selected === n ? 3 : 1.5}
                  />
                  <Circle
                    cx={p.x}
                    cy={p.y}
                    r="21"
                    fill={color}
                    opacity="0.12"
                  />
                  <SvgText
                    x={p.x}
                    y={p.y + 6}
                    textAnchor="middle"
                    fontSize="17"
                    fontWeight="bold"
                    fill={color}
                  >
                    {letters[n.type] || "•"}
                  </SvgText>
                  <SvgText
                    x={p.x}
                    y={p.y + 46}
                    textAnchor="middle"
                    fontSize="11"
                    fill={fg}
                  >
                    {label.length > 24 ? `${label.slice(0, 21)}…` : label}
                  </SvgText>
                </G>
              );
            })}
          </G>
        </Svg>
        {!nodes.length && (
          <View style={styles.empty}>
            <Network size={32} color={muted} />
            <Text style={{ color: muted, fontFamily: "Thai", fontSize: 13 }}>
              {english ? "No connections found" : "ยังไม่มีความสัมพันธ์ที่พบ"}
            </Text>
          </View>
        )}
        <View style={styles.controls}>
          {[
            [Plus, () => setScale((s) => Math.min(2.8, s + 0.2)), "Zoom in"],
            [Minus, () => setScale((s) => Math.max(0.5, s - 0.2)), "Zoom out"],
            [
              RotateCcw,
              () => {
                setScale(1);
                setPan({ x: 0, y: 0 });
              },
              "Reset",
            ],
          ].map(([Icon, fn, label]: any) => (
            <Pressable
              key={label}
              accessibilityLabel={label}
              onPress={fn}
              style={{
                padding: 8,
                backgroundColor: bg,
                borderWidth: 1,
                borderColor: line,
                borderRadius: 8,
              }}
            >
              <Icon size={17} color={fg} />
            </Pressable>
          ))}
        </View>
        <Text
          style={{
            position: "absolute",
            bottom: 12,
            left: 14,
            color: muted,
            fontSize: 10,
            fontFamily: "Thai",
          }}
        >
          {english
            ? "Drag to pan · select a node or line"
            : "ลากเพื่อเลื่อน • แตะจุดหรือเส้นเพื่อดูที่มา"}
        </Text>
      </View>
      {selected && (
        <View
          style={{
            marginTop: 12,
            padding: 16,
            borderRadius: 12,
            backgroundColor: dark ? "#173543" : "#eef6f5",
            gap: 6,
          }}
        >
          <Text style={{ color: fg, fontFamily: "ThaiBold", fontSize: 14 }}>
            {isEdge
              ? english
                ? "Connection evidence"
                : "หลักฐานความสัมพันธ์"
              : String(
                  (selected as GraphNode).label ||
                    (selected as GraphNode).value ||
                    selected.id,
                )}
          </Text>
          {isEdge ? (
            <>
              <Text style={{ color: muted, fontFamily: "Thai", fontSize: 12 }}>
                {String(
                  selected.relationship || selected.relation || "co_occurrence",
                )}
              </Text>
              <Text style={{ color: fg, fontFamily: "Thai", fontSize: 12 }}>
                {String(selected.evidence || selected.provenance || "")}
              </Text>
              <Text style={{ color: muted, fontFamily: "Thai", fontSize: 11 }}>
                {String(
                  selected.source_name ||
                    selected.source_label ||
                    selected.source_type ||
                    "",
                )}{" "}
                ·{" "}
                {String(
                  selected.retrieved_at ||
                    selected.created_at ||
                    selected.observed_at ||
                    "",
                )}
              </Text>
            </>
          ) : (
            <>
              <Text style={{ color: muted, fontFamily: "Thai", fontSize: 12 }}>
                {entityCopy(String(selected.type), english)} · {related.length}{" "}
                {english ? "connections" : "ความสัมพันธ์"}
              </Text>
              {related.map((e, i) => (
                <Pressable key={i} onPress={() => setSelected(e)}>
                  <Text
                    style={{
                      color: "#279b82",
                      fontFamily: "Thai",
                      fontSize: 12,
                    }}
                  >
                    {e.relationship || String(e.relation || "co_occurrence")} ·{" "}
                    {String(
                      e.source_name || e.provenance || e.evidence || "ดูที่มา",
                    )}
                  </Text>
                </Pressable>
              ))}
            </>
          )}
        </View>
      )}
      {!compact && (
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginTop: 12,
            alignItems: "flex-start",
          }}
        >
          <Info size={14} color={muted} />
          <Text
            style={{
              flex: 1,
              color: muted,
              fontFamily: "Thai",
              fontSize: 11,
              lineHeight: 19,
            }}
          >
            {english
              ? "A connection records shared evidence. It does not prove fraud."
              : "เส้นเชื่อมแสดงความสัมพันธ์จากหลักฐานที่มี ไม่ได้ยืนยันว่า entity นั้นเป็นมิจฉาชีพ"}
          </Text>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 },
  pill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  controls: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    gap: 5,
  },
  empty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
});
