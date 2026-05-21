import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchGnHealth,
  fetchGnOverview,
  fetchGnAlerts,
  fetchGnQuickRisk,
  fetchGnDataGaps,
  fetchGnDataQualityTyped,
  fetchGnPointsNeedingCoords,
} from "../api/area1";

import type {
  GnOverview,
  GnAlert,
  GnQuickRiskResponse,
  GnQuickRiskRecord,
  GnQuickRiskHeat,
  GnQuickRiskType,
  GnQuickRiskNote,
  GnDataGapsResponse,
  GnDataQualityResponse,
  GnPointsNeedingCoordsResponse,
} from "../api/area1";

const DEFAULT_DATE = "2026-04-14";
const POINT_PAGE = "/md/nycj/area1-point-analysis";

type Priority = "高" | "中" | "低";

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

function pickCard(overview: GnOverview | null, keywords: string[], fallback = 0): number {
  const hit = overview?.cards?.find((c) => keywords.some((k) => c.name?.includes(k)));
  return hit?.value ?? fallback;
}

function formatRatio(v?: number): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "-";
  return `${v.toFixed(2)}x`;
}

function toPriority(value?: string | number): Priority {
  if (typeof value === "number") {
    if (value >= 1.5) return "高";
    if (value >= 1) return "中";
    return "低";
  }

  const s = String(value ?? "");
  if (s.includes("高") || s.includes("严重") || s.includes("high")) return "高";
  if (s.includes("中") || s.includes("关注") || s.includes("复核") || s.includes("medium")) return "中";
  return "低";
}

function isBadText(v?: string): boolean {
  if (!v) return true;
  return v.includes("?") || v.includes("�");
}

function stateText(code?: string, fallback?: string): string {
  if (code === "review_required") return "需复核";
  if (code === "attention") return "关注";
  if (code === "normal") return "正常";
  if (code === "unknown") return "未判定";
  return fallback && !fallback.includes("?") ? fallback : "未判定";
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

function labelText(code?: string, fallback?: string): string {
  if (code === "suspected_exceed") return "疑似超限";
  return fallback && !fallback.includes("?") ? fallback : "风险记录";
}

function reasonText(code?: string, fallback?: string): string {
  if (code === "design_limit_exceeded") return "超过设计限值，需复核是否形成正式预警。";
  return fallback && !fallback.includes("?") ? fallback : "需要人工确认。";
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

function priorityColor(p: Priority): string {
  if (p === "高") return "#e65100";
  if (p === "中") return "#d4a050";
  return "#00d4ff";
}

function stateColor(state?: string): string {
  const s = state || "";
  if (s.includes("严重") || s.includes("高")) return "#e65100";
  if (s.includes("预警") || s.includes("报警")) return "#d4a050";
  if (s.includes("复核") || s.includes("关注")) return "#00d4ff";
  if (s.includes("正常")) return "#2e7d32";
  return "#5a6d8a";
}

function zoneName(side?: string, part?: string, object?: string): string {
  const left = side || "未分侧";
  const right = part || object || "未分组";
  return `${left} · ${right}`;
}

function alertRatio(a: GnAlert): number {
  if (typeof a.exceed_ratio === "number") return a.exceed_ratio;
  if (a.design_limit) return Math.abs((a.cumulative_change ?? 0) / a.design_limit);
  return 0;
}

function riskFromQuick(r: GnQuickRiskRecord, index: number): RiskRecord {
  const parsedRatio = parseFloat(String(r.metric || "0").replace("x", ""));
  const ratio = r.ratio ?? (Number.isNaN(parsedRatio) ? 0 : parsedRatio);

  return {
    key: `quick-${index}-${r.point_code || "unknown"}-${r.monitoring_item || "item"}`,
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

function riskFromAlert(a: GnAlert, index: number): RiskRecord {
  const ratio = alertRatio(a);
  return {
    key: `alert-${index}-${a.point_code || "unknown"}-${a.monitoring_item || "item"}`,
    priority: toPriority(ratio),
    label: "疑似超限",
    pointCode: a.point_code,
    item: a.monitoring_item || "未知监测项",
    zone: zoneName(a.side, a.part, a.monitoring_object),
    metric: formatRatio(ratio),
    ratio,
    reason: "超过设计限值，需复核是否形成正式预警。",
  };
}

function heatFromQuick(h: GnQuickRiskHeat, index: number): HeatCell {
  const count = h.suspected_exceed ?? 0;
  const maxRatio = h.max_ratio ?? 0;

  return {
    key: `quick-heat-${index}-${h.side || "side"}-${h.part || "part"}`,
    group: zoneName(h.side, h.part),
    level: priorityText(h.level_code, maxRatio || count),
    count,
    points: h.points ?? 0,
    maxRatio,
  };
}

function aggregateHeat(records: RiskRecord[]): HeatCell[] {
  const map = new Map<string, { count: number; points: Set<string>; maxRatio: number }>();

  for (const r of records) {
    const old = map.get(r.zone) || { count: 0, points: new Set<string>(), maxRatio: 0 };
    old.count += 1;
    if (r.pointCode) old.points.add(r.pointCode);
    old.maxRatio = Math.max(old.maxRatio, r.ratio || 0);
    map.set(r.zone, old);
  }

  return Array.from(map.entries())
    .map(([group, v], idx) => ({
      key: `heat-${idx}-${group}`,
      group,
      level: toPriority(v.maxRatio),
      count: v.count,
      points: v.points.size,
      maxRatio: v.maxRatio,
    }))
    .sort((a, b) => b.count - a.count || b.maxRatio - a.maxRatio)
    .slice(0, 12);
}

function typeFromQuick(t: GnQuickRiskType, index: number): RiskTypeRow {
  const maxRatio = t.max_ratio ?? 0;

  return {
    key: `quick-type-${index}-${t.monitoring_item || "item"}`,
    item: t.monitoring_item || "未知类型",
    count: t.suspected_exceed ?? 0,
    points: t.points ?? 0,
    maxRatio,
    representativePoint: t.representative_point,
    level: priorityText(t.level_code, maxRatio),
  };
}

function aggregateTypes(records: RiskRecord[]): RiskTypeRow[] {
  const map = new Map<string, { count: number; points: Set<string>; maxRatio: number; representativePoint?: string }>();

  for (const r of records) {
    const old = map.get(r.item) || { count: 0, points: new Set<string>(), maxRatio: 0 };
    old.count += 1;
    if (r.pointCode) old.points.add(r.pointCode);
    if ((r.ratio || 0) > old.maxRatio) {
      old.maxRatio = r.ratio || 0;
      old.representativePoint = r.pointCode;
    }
    map.set(r.item, old);
  }

  return Array.from(map.entries())
    .map(([item, v], idx) => ({
      key: `type-${idx}-${item}`,
      item,
      count: v.count,
      points: v.points.size,
      maxRatio: v.maxRatio,
      representativePoint: v.representativePoint,
      level: toPriority(v.maxRatio),
    }))
    .sort((a, b) => b.count - a.count || b.maxRatio - a.maxRatio)
    .slice(0, 8);
}

function noteFromQuick(n: GnQuickRiskNote, index: number): DataNote {
  if (n.note_code) return noteText(n.note_code);

  const fallback = noteText(["unified_view", "design_limit", "group_heatmap"][index]);

  return {
    key: `quick-note-${index}-${n.title || fallback.key}`,
    title: n.title && !n.title.includes("?") ? n.title : fallback.title,
    status: n.status && !n.status.includes("?") ? n.status : fallback.status,
    description: n.description && !n.description.includes("?") ? n.description : fallback.description,
  };
}

function buildFallbackNotes(params: {
  dataGaps: GnDataGapsResponse | null;
  dataQuality: GnDataQualityResponse | null;
  coords: GnPointsNeedingCoordsResponse | null;
}): DataNote[] {
  const threshold = params.dataQuality?.data_gaps?.find((g) =>
    `${g.category}${g.description}`.includes("阈值") ||
    `${g.category}${g.description}`.includes("限值"),
  );

  return [
    {
      key: "threshold",
      title: "阈值口径",
      status: threshold?.affected_count ? `${threshold.affected_count} 项` : "需说明",
      description: "当前主要按设计限值识别疑似超限，正式预警/报警阈值未完全配置。",
    },
    {
      key: "space",
      title: "空间口径",
      status: `${params.coords?.missing_coords ?? 0} 点缺坐标`,
      description: "坐标不完整时，页面使用侧别和部位做分组热力，不作为真实空间热力图。",
    },
    {
      key: "review",
      title: "复核口径",
      status: `P1 ${params.dataGaps?.summary?.p1_count ?? 0} / P2 ${params.dataGaps?.summary?.p2_count ?? 0}`,
      description: "疑似超限不等于正式报警，需人工复核后闭环。",
    },
  ];
}

function buildTitle(quick: GnQuickRiskResponse | null, suspected: number, pending: number) {
  if (quick?.title && !quick.title.includes("?")) return quick.title;
  if (suspected > 0) return `今日有 ${suspected} 条疑似超限记录需要复核`;
  if (pending > 0) return `今日有 ${pending} 条数据需要确认`;
  return "今日未发现明显整体风险";
}

function buildReason(quick: GnQuickRiskResponse | null) {
  if (quick?.reason && !quick.reason.includes("?")) return quick.reason;
  return "当前研判基于统一风险视图；疑似超限尚不等同于正式报警，需要人工复核。";
}

function buildAction(quick: GnQuickRiskResponse | null) {
  if (quick?.action && !quick.action.includes("?")) return quick.action;
  return "优先查看高倍数疑似超限点位，再处理待确认数据。";
}

export default function Area1Monitoring() {
  const [date, setDate] = useState(DEFAULT_DATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dbDown, setDbDown] = useState(false);

  const [quick, setQuick] = useState<GnQuickRiskResponse | null>(null);
  const [overview, setOverview] = useState<GnOverview | null>(null);
  const [alerts, setAlerts] = useState<GnAlert[]>([]);
  const [dataGaps, setDataGaps] = useState<GnDataGapsResponse | null>(null);
  const [dataQuality, setDataQuality] = useState<GnDataQualityResponse | null>(null);
  const [coords, setCoords] = useState<GnPointsNeedingCoordsResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [healthRes, quickRes, overviewRes, alertsRes, gapsRes, qualityRes, coordsRes] = await Promise.all([
        fetchGnHealth(),
        fetchGnQuickRisk(date),
        fetchGnOverview(date),
        fetchGnAlerts({ date, limit: 100 }),
        fetchGnDataGaps(),
        fetchGnDataQualityTyped(),
        fetchGnPointsNeedingCoords(),
      ]);

      if (healthRes.ok && healthRes.data) {
        setDbDown(!healthRes.data.ok || healthRes.data.database !== "connected");
      }

      setQuick(quickRes.ok ? quickRes.data ?? null : null);
      if (overviewRes.ok) setOverview(overviewRes.data ?? null);
      if (alertsRes.ok) setAlerts(alertsRes.data?.alerts ?? []);
      if (gapsRes.ok) setDataGaps(gapsRes.data ?? null);
      if (qualityRes.ok) setDataQuality(qualityRes.data ?? null);
      if (coordsRes.ok) setCoords(coordsRes.data ?? null);
    } catch {
      setError("整体风险研判数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const fallbackRisks = useMemo(() => alerts.map(riskFromAlert), [alerts]);

  const riskRecords = useMemo(() => {
    const rows = quick?.risk_records?.length
      ? quick.risk_records.map(riskFromQuick)
      : fallbackRisks;

    return rows.sort((a, b) => b.ratio - a.ratio).slice(0, 8);
  }, [quick, fallbackRisks]);

  const heatCells = useMemo(() => {
    if (quick?.group_heatmap?.length) {
      return quick.group_heatmap.map(heatFromQuick).sort((a, b) => b.count - a.count || b.maxRatio - a.maxRatio);
    }
    return aggregateHeat(riskRecords);
  }, [quick, riskRecords]);

  const riskTypes = useMemo(() => {
    if (quick?.risk_types?.length) {
      return quick.risk_types.map(typeFromQuick).sort((a, b) => b.count - a.count || b.maxRatio - a.maxRatio);
    }
    return aggregateTypes(riskRecords);
  }, [quick, riskRecords]);

  const notes = useMemo(() => {
    if (quick?.data_notes?.length) return quick.data_notes.map(noteFromQuick);
    return buildFallbackNotes({ dataGaps, dataQuality, coords });
  }, [quick, dataGaps, dataQuality, coords]);

  const suspected = quick?.kpis?.suspected_exceed ?? pickCard(overview, ["超限", "超设计"], alerts.length);
  const pending = quick?.kpis?.pending_confirm ?? pickCard(overview, ["待确认", "未知"], 0);
  const pointCount = quick?.kpis?.monitoring_points ?? pickCard(overview, ["监测点", "点数"], 0);
  const readingCount = quick?.kpis?.readings ?? pickCard(overview, ["累计", "读数", "次数"], 0);
  const state = stateText(
    quick?.state_code,
    quick?.state || (suspected > 0 ? "需复核" : pending > 0 ? "关注" : "正常"),
  );

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
          <p style={styles.subtitle}>整体筛选、分组热力、风险排行与单点跳转。</p>
        </div>

        <div style={styles.toolbar}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={styles.input} />
          <button onClick={() => void load()} style={styles.button}>刷新</button>
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
        <Panel title="今日结论">
          <div style={styles.conclusion}>
            <span style={{ ...styles.stateBadge, color: stateColor(state), borderColor: stateColor(state) }}>
              {state}
            </span>
            <div>
              <div style={styles.conclusionTitle}>{buildTitle(quick, suspected, pending)}</div>
              <div style={styles.conclusionText}>{buildReason(quick)}</div>
            </div>
          </div>
          <div style={styles.nextStep}>{buildAction(quick)}</div>
        </Panel>

        <div style={styles.kpiGrid}>
          <Kpi title="疑似超限" value={suspected} unit="条" color="#e65100" />
          <Kpi title="待确认" value={pending} unit="条" color="#d4a050" />
          <Kpi title="监测覆盖" value={pointCount} unit="点" color="#2e7d32" />
          <Kpi title="累计读数" value={readingCount} unit="条" color="#00d4ff" />
        </div>
      </section>

      <section style={styles.twoCol}>
        <Panel title="重点风险记录">
          {riskRecords.length === 0 ? (
            <Empty text="暂无重点风险记录" />
          ) : (
            <div style={styles.riskList}>
              {riskRecords.map((r) => (
                <div key={r.key} style={styles.riskCard}>
                  <div style={styles.riskTop}>
                    <span style={{ ...styles.priorityOutline, color: priorityColor(r.priority), borderColor: priorityColor(r.priority) }}>
                      {r.priority}
                    </span>
                    <span style={styles.typeTag}>{r.label}</span>
                    <span style={styles.metricTag}>{r.metric}</span>
                  </div>

                  <div style={styles.riskTitle}>
                    {r.item}
                    {r.pointCode && <span style={styles.point}> / {r.pointCode}</span>}
                  </div>

                  <div style={styles.muted}>{r.zone}，{r.reason}</div>

                  {r.pointCode && (
                    <a style={styles.linkButton} href={`${POINT_PAGE}?point_code=${encodeURIComponent(r.pointCode)}`}>
                      查看单点分析
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="分组风险热力">
          {heatCells.length === 0 ? (
            <Empty text="暂无可聚合风险分组" />
          ) : (
            <div style={styles.heatGrid}>
              {heatCells.map((h) => (
                <div key={h.key} style={styles.heatCell}>
                  <div style={styles.rowBetween}>
                    <b>{h.group}</b>
                    <span style={{ ...styles.heatLevel, color: priorityColor(h.level) }}>{h.level}</span>
                  </div>
                  <div style={styles.heatNums}>
                    <span>疑似超限 {h.count}</span>
                    <span>点位 {h.points}</span>
                    <span>最大 {formatRatio(h.maxRatio)}</span>
                  </div>
                  <div style={styles.barTrack}>
                    <div
                      style={{
                        ...styles.barFill,
                        width: `${Math.min(100, Math.max(h.count * 8, h.maxRatio * 18))}%`,
                        background: priorityColor(h.level),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <section style={styles.twoCol}>
        <Panel title="风险类型排行">
          {riskTypes.length === 0 ? (
            <Empty text="暂无风险类型数据" />
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>类型</th>
                  <th style={styles.th}>疑似超限</th>
                  <th style={styles.th}>点位</th>
                  <th style={styles.th}>最大倍数</th>
                  <th style={styles.th}>代表点</th>
                </tr>
              </thead>
              <tbody>
                {riskTypes.map((r) => (
                  <tr key={r.key}>
                    <td style={styles.td}>{r.item}</td>
                    <td style={{ ...styles.td, color: "#e65100" }}>{r.count}</td>
                    <td style={styles.td}>{r.points}</td>
                    <td style={{ ...styles.td, color: priorityColor(r.level) }}>{formatRatio(r.maxRatio)}</td>
                    <td style={styles.td}>{r.representativePoint || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="数据口径">
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
      </section>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={styles.panel}>
      <h2 style={styles.h2}>{title}</h2>
      {children}
    </section>
  );
}

function Kpi({ title, value, unit, color }: { title: string; value: number | string; unit: string; color: string }) {
  return (
    <div style={styles.kpi}>
      <div style={styles.kpiTitle}>{title}</div>
      <div style={{ ...styles.kpiValue, color }}>
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
  h1: { margin: 0, fontSize: 24, fontWeight: 800, color: "#e6f2ff" },
  subtitle: { margin: "6px 0 0", color: "#5a6d8a", fontSize: 13 },
  toolbar: { display: "flex", gap: 10, alignItems: "center" },
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
  loading: { padding: 40, textAlign: "center", color: "#00d4ff" },
  topGrid: {
    display: "grid",
    gridTemplateColumns: "1.25fr 1fr",
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
  h2: { margin: "0 0 12px", fontSize: 16, color: "#e6f2ff", fontWeight: 800 },
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
  conclusionTitle: { fontSize: 21, lineHeight: 1.35, color: "#e6f2ff", fontWeight: 900, marginBottom: 6 },
  conclusionText: { color: "#98aec9", fontSize: 13, lineHeight: 1.6 },
  nextStep: {
    marginTop: 12,
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    lineHeight: 1.6,
    color: "#c8d6e5",
  },
  kpiGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  kpi: { background: "#0f1525", border: "1px solid #1a2640", borderRadius: 10, padding: 14 },
  kpiTitle: { color: "#98aec9", fontSize: 12, marginBottom: 6 },
  kpiValue: { fontSize: 26, fontWeight: 900 },
  kpiUnit: { fontSize: 13, color: "#5a6d8a", fontWeight: 500 },
  riskList: { display: "grid", gap: 10 },
  riskCard: { background: "#0b1020", border: "1px solid #1a2640", borderRadius: 8, padding: 12 },
  riskTop: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  priorityOutline: { border: "1px solid", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 800 },
  typeTag: { background: "#121e36", color: "#c8d6e5", borderRadius: 999, padding: "3px 8px", fontSize: 12 },
  metricTag: { background: "#102a43", color: "#00d4ff", borderRadius: 999, padding: "3px 8px", fontSize: 12 },
  riskTitle: { color: "#e6f2ff", fontWeight: 800, marginBottom: 4 },
  point: { color: "#98aec9", fontWeight: 500 },
  muted: { color: "#98aec9", fontSize: 12, lineHeight: 1.6 },
  linkButton: { display: "inline-block", marginTop: 8, color: "#00d4ff", textDecoration: "none", fontSize: 12 },
  heatGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  heatCell: { background: "#0b1020", border: "1px solid #1a2640", borderRadius: 8, padding: 12 },
  rowBetween: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" },
  heatLevel: { fontSize: 12, fontWeight: 900 },
  heatNums: { display: "flex", gap: 10, flexWrap: "wrap", color: "#98aec9", fontSize: 12, margin: "10px 0" },
  barTrack: { height: 6, background: "#121e36", borderRadius: 999, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { textAlign: "left", color: "#5a6d8a", borderBottom: "1px solid #1a2640", padding: "9px 7px", fontWeight: 800 },
  td: { borderBottom: "1px solid #1a2640", padding: "9px 7px", color: "#c8d6e5" },
  noteGrid: { display: "grid", gap: 10 },
  noteCard: { background: "#0b1020", border: "1px solid #1a2640", borderRadius: 8, padding: 12 },
  noteStatus: { color: "#00d4ff", fontSize: 12, whiteSpace: "nowrap" },
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