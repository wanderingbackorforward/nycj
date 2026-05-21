import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchGnHealth,
  fetchGnQuickRisk,
} from "../api/area1";

import type {
  GnQuickRiskResponse,
  GnQuickRiskRecord,
  GnQuickRiskHeat,
  GnQuickRiskType,
  GnQuickRiskNote,
} from "../api/area1";

const DEFAULT_DATE = "2026-04-14";
const POINT_PAGE = "/md/nycj/area1-point-analysis";

type Priority = "高" | "中" | "低";

type KpiTone = "danger" | "warning" | "success" | "info";

type RiskRecord = {
  key: string;
  priority: Priority;
  label: string;
  pointCode?: string;
  item: string;
  zone: string;
  metric: string;
  ratio: number;
  reason: string;
};

type HeatCell = {
  key: string;
  group: string;
  level: Priority;
  count: number;
  points: number;
  maxRatio: number;
};

type RiskTypeRow = {
  key: string;
  item: string;
  count: number;
  points: number;
  maxRatio: number;
  representativePoint?: string;
  level: Priority;
};

type DataNote = {
  key: string;
  title: string;
  status: string;
  description: string;
};

function isBadText(v?: string): boolean {
  return !v || v.includes("?") || v.includes("�");
}

function formatRatio(v?: number): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "-";
  return `${v.toFixed(2)}x`;
}

function zoneName(side?: string, part?: string, object?: string): string {
  const left = side && side !== "unknown_side" ? side : "未分侧";
  const right = part && part !== "unknown_part" ? part : object || "未分组";
  return `${left} · ${right}`;
}

function priorityText(code?: string, fallback?: string | number): Priority {
  if (code === "high") return "高";
  if (code === "medium") return "中";
  if (code === "low") return "低";

  if (typeof fallback === "number") {
    if (fallback >= 1.5) return "高";
    if (fallback >= 1) return "中";
    return "低";
  }

  if (fallback?.includes("高")) return "高";
  if (fallback?.includes("中")) return "中";

  return "低";
}

function stateText(code?: string, fallback?: string): string {
  if (code === "review_required") return "需复核";
  if (code === "attention") return "关注";
  if (code === "normal") return "正常";
  if (code === "unknown") return "未判定";

  return fallback && !isBadText(fallback) ? fallback : "未判定";
}

function stateColor(state: string): string {
  if (state.includes("严重") || state.includes("预警")) return "#e65100";
  if (state.includes("需复核") || state.includes("关注")) return "#d4a050";
  if (state.includes("正常")) return "#2e7d32";
  return "#00d4ff";
}

function priorityColor(priority: Priority): string {
  if (priority === "高") return "#e65100";
  if (priority === "中") return "#d4a050";
  return "#00d4ff";
}

function labelText(code?: string, fallback?: string): string {
  if (code === "suspected_exceed") return "疑似超限";
  return fallback && !isBadText(fallback) ? fallback : "风险记录";
}

function reasonText(code?: string, fallback?: string): string {
  if (code === "design_limit_exceeded") {
    return "超过设计限值，需复核是否形成正式预警。";
  }

  return fallback && !isBadText(fallback) ? fallback : "需要人工确认。";
}

function noteText(code?: string): DataNote {
  if (code === "unified_view") {
    return {
      key: "unified_view",
      title: "研判口径",
      status: "统一风险视图",
      description: "当前页面基于 vw_risk_overview 汇总，不再混用多个接口口径。",
    };
  }

  if (code === "design_limit") {
    return {
      key: "design_limit",
      title: "阈值口径",
      status: "设计限值",
      description: "当前疑似超限主要基于设计限值，正式预警/报警阈值待补录。",
    };
  }

  return {
    key: "group_heatmap",
    title: "空间口径",
    status: "分组热力",
    description: "测点坐标尚未补录，当前按侧别和部位做分组热力，不是真实空间热力图。",
  };
}

function buildTitle(quick: GnQuickRiskResponse | null, suspected: number, pending: number): string {
  if (quick?.title && !isBadText(quick.title)) return quick.title;
  if (suspected > 0) return `今日有 ${suspected} 条疑似超限记录需要复核`;
  if (pending > 0) return `今日有 ${pending} 条数据需要人工判定`;
  return "今日未发现明显整体风险";
}

function buildReason(quick: GnQuickRiskResponse | null): string {
  if (quick?.reason && !isBadText(quick.reason)) return quick.reason;
  return "当前研判基于统一风险视图；疑似超限尚不等同于正式报警，需要人工复核。";
}

function buildAction(quick: GnQuickRiskResponse | null): string {
  if (quick?.action && !isBadText(quick.action)) return quick.action;
  return "先看风险集中区域和主要风险类型，再进入高倍数点位做单点分析。";
}

function riskFromQuick(r: GnQuickRiskRecord, index: number): RiskRecord {
  const parsedRatio = parseFloat(String(r.metric || "0").replace("x", ""));
  const ratio = r.ratio ?? (Number.isNaN(parsedRatio) ? 0 : parsedRatio);

  return {
    key: `risk-${index}-${r.point_code || "unknown"}-${r.monitoring_item || "item"}`,
    priority: priorityText(r.priority_code, ratio),
    label: labelText(r.label_code, r.label),
    pointCode: r.point_code,
    item: r.monitoring_item || "未知监测项",
    zone: zoneName(r.side, r.part, r.monitoring_object),
    metric: r.metric || formatRatio(ratio),
    ratio,
    reason: reasonText(r.reason_code, r.reason),
  };
}

function heatFromQuick(h: GnQuickRiskHeat, index: number): HeatCell {
  const count = h.suspected_exceed ?? 0;
  const maxRatio = h.max_ratio ?? 0;

  return {
    key: `heat-${index}-${h.side || "side"}-${h.part || "part"}`,
    group: h.group && !isBadText(h.group) ? h.group : zoneName(h.side, h.part),
    level: priorityText(h.level_code, maxRatio || count),
    count,
    points: h.points ?? 0,
    maxRatio,
  };
}

function typeFromQuick(t: GnQuickRiskType, index: number): RiskTypeRow {
  const maxRatio = t.max_ratio ?? 0;

  return {
    key: `type-${index}-${t.monitoring_item || "item"}`,
    item: t.monitoring_item || "未知类型",
    count: t.suspected_exceed ?? 0,
    points: t.points ?? 0,
    maxRatio,
    representativePoint: t.representative_point,
    level: priorityText(t.level_code, maxRatio || t.suspected_exceed || 0),
  };
}

function noteFromQuick(n: GnQuickRiskNote, index: number): DataNote {
  if (n.note_code) return noteText(n.note_code);

  const fallback = noteText(["unified_view", "design_limit", "group_heatmap"][index]);

  return {
    key: `note-${index}-${n.title || fallback.key}`,
    title: n.title && !isBadText(n.title) ? n.title : fallback.title,
    status: n.status && !isBadText(n.status) ? n.status : fallback.status,
    description: n.description && !isBadText(n.description) ? n.description : fallback.description,
  };
}

export default function Area1Monitoring() {
  const [date, setDate] = useState(DEFAULT_DATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dbDown, setDbDown] = useState(false);
  const [quick, setQuick] = useState<GnQuickRiskResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [healthRes, quickRes] = await Promise.all([
        fetchGnHealth().catch(() => null),
        fetchGnQuickRisk(date).catch(() => null),
      ]);

      if (healthRes?.ok && healthRes.data) {
        setDbDown(!healthRes.data.ok || healthRes.data.database !== "connected");
      }

      if (quickRes?.ok && quickRes.data) {
        setQuick(quickRes.data);
      } else {
        setQuick(null);
        setError("整体风险研判接口暂不可用");
      }
    } catch {
      setError("整体风险研判数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = quick?.kpis ?? {};
  const suspected = kpis.suspected_exceed ?? 0;
  const pending = kpis.pending_confirm ?? 0;
  const pointCount = kpis.monitoring_points ?? 0;
  const readingCount = kpis.readings ?? 0;

  const state = stateText(
    quick?.state_code,
    quick?.state || (suspected > 0 ? "需复核" : pending > 0 ? "关注" : "正常"),
  );

  const risks = useMemo(() => {
    return (quick?.risk_records ?? [])
      .map(riskFromQuick)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 8);
  }, [quick]);

  const heatCells = useMemo(() => {
    return (quick?.group_heatmap ?? [])
      .map(heatFromQuick)
      .sort((a, b) => b.count - a.count || b.maxRatio - a.maxRatio);
  }, [quick]);

  const riskTypes = useMemo(() => {
    return (quick?.risk_types ?? [])
      .map(typeFromQuick)
      .sort((a, b) => b.count - a.count || b.maxRatio - a.maxRatio);
  }, [quick]);

  const notes = useMemo(() => {
    const source = quick?.data_notes?.length
      ? quick.data_notes
      : [
          { note_code: "unified_view" },
          { note_code: "design_limit" },
          { note_code: "group_heatmap" },
        ];

    return source.map(noteFromQuick);
  }, [quick]);

  const topHeat = heatCells[0];
  const topType = riskTypes[0];

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loading}>正在加载 1工区整体风险研判...</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>1工区整体风险研判</h1>
          <p style={styles.subtitle}>基于统一风险视图，快速定位风险区域、风险类型和重点点位。</p>
        </div>

        <div style={styles.toolbar}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={styles.input}
          />
          <button onClick={() => void load()} style={styles.button}>
            刷新
          </button>
          <span
            style={{
              ...styles.statusPill,
              color: dbDown ? "#e65100" : "#2e7d32",
              borderColor: dbDown ? "#e65100" : "#2e7d32",
            }}
          >
            {dbDown ? "系统异常" : "系统正常"}
          </span>
        </div>
      </header>

      {error && <div style={styles.error}>{error}</div>}

      <section style={styles.topGrid}>
        <Panel title="今日总体判断">
          <div style={styles.conclusion}>
            <span
              style={{
                ...styles.stateBadge,
                color: stateColor(state),
                borderColor: stateColor(state),
              }}
            >
              {state}
            </span>

            <div>
              <div style={styles.conclusionTitle}>{buildTitle(quick, suspected, pending)}</div>
              <div style={styles.conclusionText}>{buildReason(quick)}</div>
            </div>
          </div>

          <div style={styles.summaryStrip}>
            <SummaryItem label="风险集中区域" value={topHeat?.group || "-"} />
            <SummaryItem label="主要风险类型" value={topType?.item || "-"} />
            <SummaryItem label="建议动作" value={buildAction(quick)} wide />
          </div>
        </Panel>

        <div style={styles.kpiGrid}>
          <Kpi title="疑似超限" value={suspected} unit="条" tone="danger" />
          <Kpi title="待人工判定" value={pending} unit="条" tone="warning" />
          <Kpi title="监测覆盖" value={pointCount} unit="点" tone="success" />
          <Kpi title="累计读数" value={readingCount} unit="条" tone="info" />
        </div>
      </section>

      <section style={styles.twoCol}>
        <Panel title="风险集中区域">
          {heatCells.length === 0 ? (
            <Empty text="暂无分组风险数据" />
          ) : (
            <div style={styles.heatList}>
              {heatCells.map((h, idx) => (
                <div key={h.key} style={styles.heatRow}>
                  <div style={styles.rank}>{idx + 1}</div>

                  <div style={styles.heatMain}>
                    <div style={styles.rowBetween}>
                      <b>{h.group}</b>
                      <span style={{ ...styles.levelText, color: priorityColor(h.level) }}>{h.level}</span>
                    </div>

                    <div style={styles.heatMeta}>
                      <span>疑似超限 {h.count}</span>
                      <span>点位 {h.points}</span>
                      <span>最大 {formatRatio(h.maxRatio)}</span>
                    </div>

                    <div style={styles.barTrack}>
                      <div
                        style={{
                          ...styles.barFill,
                          width: `${Math.min(100, Math.max(h.count * 3, h.maxRatio * 20))}%`,
                          background: priorityColor(h.level),
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="主要风险类型">
          {riskTypes.length === 0 ? (
            <Empty text="暂无风险类型数据" />
          ) : (
            <div style={styles.typeList}>
              {riskTypes.map((t, idx) => (
                <div key={t.key} style={styles.typeRow}>
                  <div style={styles.rank}>{idx + 1}</div>

                  <div style={styles.typeMain}>
                    <div style={styles.rowBetween}>
                      <b>{t.item}</b>
                      <span style={{ ...styles.levelText, color: priorityColor(t.level) }}>{t.level}</span>
                    </div>

                    <div style={styles.typeMeta}>
                      <span>疑似超限 {t.count}</span>
                      <span>点位 {t.points}</span>
                      <span>最大 {formatRatio(t.maxRatio)}</span>
                      <span>代表点 {t.representativePoint || "-"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <Panel title="重点点位 Top 8">
        {risks.length === 0 ? (
          <Empty text="暂无重点点位" />
        ) : (
          <div style={styles.pointTableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>优先级</th>
                  <th style={styles.th}>类型</th>
                  <th style={styles.th}>测点</th>
                  <th style={styles.th}>位置</th>
                  <th style={styles.th}>倍数</th>
                  <th style={styles.th}>说明</th>
                  <th style={styles.th}>操作</th>
                </tr>
              </thead>

              <tbody>
                {risks.map((r) => (
                  <tr key={r.key}>
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.priorityBadge,
                          borderColor: priorityColor(r.priority),
                          color: priorityColor(r.priority),
                        }}
                      >
                        {r.priority}
                      </span>
                    </td>
                    <td style={styles.td}>{r.item}</td>
                    <td style={styles.td}>
                      <b>{r.pointCode || "-"}</b>
                    </td>
                    <td style={styles.td}>{r.zone}</td>
                    <td style={{ ...styles.td, color: priorityColor(r.priority), fontWeight: 800 }}>
                      {r.metric}
                    </td>
                    <td style={styles.tdMuted}>{r.reason}</td>
                    <td style={styles.td}>
                      {r.pointCode ? (
                        <a
                          style={styles.link}
                          href={`${POINT_PAGE}?point_code=${encodeURIComponent(r.pointCode)}`}
                        >
                          查看单点
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="数据口径说明" compact>
        <div style={styles.noteGrid}>
          {notes.map((n) => (
            <div key={n.key} style={styles.noteCard}>
              <div style={styles.rowBetween}>
                <b>{n.title}</b>
                <span style={styles.noteStatus}>{n.status}</span>
              </div>
              <div style={styles.muted}>{n.description}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Panel({
  title,
  compact,
  children,
}: {
  title: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section style={{ ...styles.panel, ...(compact ? styles.panelCompact : {}) }}>
      <h2 style={styles.h2}>{title}</h2>
      {children}
    </section>
  );
}

function SummaryItem({
  label,
  value,
  wide,
}: {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div style={{ ...styles.summaryItem, ...(wide ? styles.summaryItemWide : {}) }}>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={styles.summaryValue}>{value}</div>
    </div>
  );
}

function Kpi({
  title,
  value,
  unit,
  tone,
}: {
  title: string;
  value: number | string;
  unit: string;
  tone: KpiTone;
}) {
  const colors: Record<KpiTone, string> = {
    danger: "#e65100",
    warning: "#d4a050",
    success: "#2e7d32",
    info: "#00d4ff",
  };

  return (
    <div style={styles.kpi}>
      <div style={styles.kpiTitle}>{title}</div>
      <div style={{ ...styles.kpiValue, color: colors[tone] }}>
        {value}
        <span style={styles.kpiUnit}> {unit}</span>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={styles.empty}>{text}</div>;
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#050816",
    color: "#c8d6e5",
    padding: 22,
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 16,
  },
  h1: {
    margin: 0,
    fontSize: 24,
    fontWeight: 800,
    color: "#e6f2ff",
  },
  subtitle: {
    margin: "6px 0 0",
    color: "#5a6d8a",
    fontSize: 13,
  },
  toolbar: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },
  input: {
    background: "#0f1525",
    color: "#c8d6e5",
    border: "1px solid #1a2640",
    borderRadius: 6,
    padding: "7px 10px",
    outline: "none",
  },
  button: {
    background: "#0b5cad",
    color: "#fff",
    border: 0,
    borderRadius: 6,
    padding: "8px 14px",
    cursor: "pointer",
  },
  statusPill: {
    border: "1px solid",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    background: "#0f1525",
  },
  error: {
    background: "#2a0a0a",
    border: "1px solid #e65100",
    color: "#ffb089",
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  loading: {
    padding: 40,
    textAlign: "center",
    color: "#00d4ff",
  },
  topGrid: {
    display: "grid",
    gridTemplateColumns: "1.3fr 1fr",
    gap: 14,
    marginBottom: 14,
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
    marginBottom: 14,
  },
  panel: {
    background: "#0f1525",
    border: "1px solid #1a2640",
    borderRadius: 10,
    padding: 15,
    marginBottom: 14,
  },
  panelCompact: {
    paddingBottom: 12,
  },
  h2: {
    margin: "0 0 12px",
    fontSize: 16,
    color: "#e6f2ff",
    fontWeight: 800,
  },
  conclusion: {
    display: "grid",
    gridTemplateColumns: "86px 1fr",
    gap: 14,
    alignItems: "start",
  },
  stateBadge: {
    border: "1px solid",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 13,
    fontWeight: 800,
    textAlign: "center",
    background: "#0b1020",
  },
  conclusionTitle: {
    fontSize: 21,
    lineHeight: 1.35,
    color: "#e6f2ff",
    fontWeight: 900,
    marginBottom: 6,
  },
  conclusionText: {
    color: "#98aec9",
    fontSize: 13,
    lineHeight: 1.6,
  },
  summaryStrip: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 14,
  },
  summaryItem: {
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 10,
  },
  summaryItemWide: {
    gridColumn: "1 / -1",
  },
  summaryLabel: {
    color: "#5a6d8a",
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    color: "#c8d6e5",
    fontSize: 13,
    lineHeight: 1.5,
    fontWeight: 700,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  kpi: {
    background: "#0f1525",
    border: "1px solid #1a2640",
    borderRadius: 10,
    padding: 14,
  },
  kpiTitle: {
    color: "#98aec9",
    fontSize: 12,
    marginBottom: 6,
  },
  kpiValue: {
    fontSize: 26,
    fontWeight: 900,
  },
  kpiUnit: {
    fontSize: 13,
    color: "#5a6d8a",
    fontWeight: 500,
  },
  heatList: {
    display: "grid",
    gap: 9,
  },
  heatRow: {
    display: "grid",
    gridTemplateColumns: "28px 1fr",
    gap: 10,
    alignItems: "start",
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 10,
  },
  rank: {
    width: 24,
    height: 24,
    borderRadius: 999,
    background: "#121e36",
    color: "#00d4ff",
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 800,
  },
  heatMain: {
    minWidth: 0,
  },
  heatMeta: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    color: "#98aec9",
    fontSize: 12,
    margin: "7px 0",
  },
  levelText: {
    fontWeight: 900,
    fontSize: 13,
  },
  barTrack: {
    height: 6,
    background: "#121e36",
    borderRadius: 999,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
  typeList: {
    display: "grid",
    gap: 9,
  },
  typeRow: {
    display: "grid",
    gridTemplateColumns: "28px 1fr",
    gap: 10,
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 10,
  },
  typeMain: {
    minWidth: 0,
  },
  typeMeta: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    color: "#98aec9",
    fontSize: 12,
    marginTop: 7,
  },
  rowBetween: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
  },
  pointTableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
  },
  th: {
    textAlign: "left",
    color: "#5a6d8a",
    borderBottom: "1px solid #1a2640",
    padding: "9px 7px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  td: {
    borderBottom: "1px solid #1a2640",
    padding: "9px 7px",
    color: "#c8d6e5",
    verticalAlign: "top",
  },
  tdMuted: {
    borderBottom: "1px solid #1a2640",
    padding: "9px 7px",
    color: "#98aec9",
    lineHeight: 1.5,
    verticalAlign: "top",
  },
  priorityBadge: {
    border: "1px solid",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  link: {
    color: "#00d4ff",
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  noteGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },
  noteCard: {
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
  },
  noteStatus: {
    color: "#00d4ff",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  muted: {
    color: "#98aec9",
    fontSize: 12,
    lineHeight: 1.6,
  },
  empty: {
    color: "#5a6d8a",
    background: "#0b1020",
    border: "1px dashed #1a2640",
    borderRadius: 8,
    padding: 16,
    textAlign: "center",
    fontSize: 13,
  },
};