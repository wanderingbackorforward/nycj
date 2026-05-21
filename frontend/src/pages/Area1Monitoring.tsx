import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchGnHealth,
  fetchGnOverview,
  fetchGnMonitoringItems,
  fetchGnAlerts,
  fetchGnDailyBriefing,
  fetchGnEarlyWarning,
  fetchGnAnomalyDetection,
  fetchGnZoneHeatmap,
  fetchGnDataQualityTyped,
  fetchGnDataGaps,
  fetchGnPointsNeedingCoords,
} from "../api/area1";

import type {
  GnOverview,
  GnMonitoringItem,
  GnAlert,
  GnDailyBriefing,
  GnEarlyWarningResponse,
  GnEarlyWarningItem,
  GnAnomalyResponse,
  GnAnomalyItem,
  GnZoneHeatmapResponse,
  GnZoneHeatmapItem,
  GnDataQualityResponse,
  GnDataGapsResponse,
  GnPointsNeedingCoordsResponse,
} from "../api/area1";

const DEFAULT_DATE = "2026-04-14";
const POINT_PAGE = "/md/nycj/area1-point-analysis";

type Priority = "高" | "中" | "低";
type OverallState = "正常" | "关注" | "需复核" | "预警" | "严重" | "未判定";

type RiskRow = {
  key: string;
  priority: Priority;
  label: string;
  pointCode?: string;
  item?: string;
  zone?: string;
  metric?: string;
  reason: string;
};

type TodoRow = {
  key: string;
  priority: Priority;
  title: string;
  count: number;
  desc: string;
};

type HeatCell = {
  key: string;
  side: string;
  part: string;
  status: string;
  pointCount: number;
  readingCount: number;
  exceedCount: number;
  severeCount: number;
  score: number;
};

type BriefView = {
  state: OverallState;
  title: string;
  reason: string;
  action: string;
};

function pickCard(overview: GnOverview | null, keywords: string[], fallback = 0): number {
  const hit = overview?.cards?.find((c) => keywords.some((k) => c.name?.includes(k)));
  return hit?.value ?? fallback;
}

function num(v: number | null | undefined, digits = 1): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "-";
  return v.toFixed(digits);
}

function extractCount(...texts: Array<string | undefined | null>): number | null {
  for (const text of texts) {
    const match = text?.match(/(\d+)\s*条/);
    if (match) return Number(match[1]);
  }
  return null;
}

function colorByState(text?: string): string {
  const v = text || "";
  if (["严重", "高", "critical", "severe"].some((x) => v.includes(x))) return "#e65100";
  if (["预警", "报警", "异常", "warning"].some((x) => v.includes(x))) return "#d4a050";
  if (["需复核", "复核", "关注", "中"].some((x) => v.includes(x))) return "#00d4ff";
  if (["正常", "低", "normal", "ok"].some((x) => v.includes(x))) return "#2e7d32";
  return "#5a6d8a";
}

function colorByPriority(priority: Priority): string {
  if (priority === "高") return "#e65100";
  if (priority === "中") return "#d4a050";
  return "#00d4ff";
}

function zoneName(side?: string, part?: string): string {
  if (!side && !part) return "未标注区域";
  return `${side || "未知侧"} · ${part || "未知部位"}`;
}

function deriveState(params: {
  raw?: string;
  exceedCount: number;
  unknownCount: number;
  anomalyCount: number;
}): OverallState {
  const raw = params.raw || "";

  if (raw.includes("严重")) return "严重";
  if (raw.includes("预警") || raw.includes("报警") || raw.includes("异常")) return "预警";
  if (params.exceedCount > 0 || raw.includes("复核") || raw.includes("重点")) return "需复核";
  if (params.unknownCount > 0 || params.anomalyCount > 0 || raw.includes("关注")) return "关注";
  if (raw.includes("正常")) return "正常";

  return "未判定";
}

function buildBrief(params: {
  overview: GnOverview | null;
  briefing: GnDailyBriefing | null;
  exceedCount: number;
  unknownCount: number;
  anomalyCount: number;
}): BriefView {
  const state = deriveState({
    raw: params.overview?.overall_level_cn || params.overview?.overall_level,
    exceedCount: params.exceedCount,
    unknownCount: params.unknownCount,
    anomalyCount: params.anomalyCount,
  });

  const reviewCount =
    extractCount(params.overview?.headline, params.briefing?.recommendation) ||
    params.exceedCount ||
    params.unknownCount;

  if (state === "正常") {
    return {
      state,
      title: "今日未发现明显整体风险",
      reason: "超限、待确认和统计异常数量处于较低水平。",
      action: "保持日常监测，关注分区和类型排行变化。",
    };
  }

  if (state === "需复核") {
    return {
      state,
      title: reviewCount > 0 ? `今日有 ${reviewCount} 条记录需要复核` : "今日存在待复核记录",
      reason: "这些记录尚未等同于正式预警，需要先确认是否真实超限或属于数据口径问题。",
      action: "先处理疑似超限，再处理缺失限值、缺坐标和无法自动判断的数据。",
    };
  }

  if (state === "预警" || state === "严重") {
    return {
      state,
      title: state === "严重" ? "今日存在严重风险信号" : "今日存在预警风险信号",
      reason: `疑似超限 ${params.exceedCount} 条，统计异常 ${params.anomalyCount} 条，待确认 ${params.unknownCount} 条。`,
      action: "优先核查高优先级风险记录，并结合分区热力判断是否集中发生。",
    };
  }

  return {
    state,
    title: "今日存在需要关注的监测变化",
    reason: `待确认 ${params.unknownCount} 条，统计异常 ${params.anomalyCount} 条。`,
    action: "关注重点风险记录、分区热力和数据口径问题。",
  };
}

function riskFromWorsening(w: GnEarlyWarningItem): RiskRow {
  return {
    key: `worsening-${w.point_code || "unknown"}-${w.monitoring_item || "item"}`,
    priority: "高",
    label: "恶化加快",
    pointCode: w.point_code,
    item: w.monitoring_item,
    zone: zoneName(w.side, w.part),
    metric: `日变化 ${num(w.daily_chg, 2)}`,
    reason: "变化速度靠前，建议优先查看单点趋势。",
  };
}

function riskFromApproaching(w: GnEarlyWarningItem): RiskRow {
  const ratio = w.ratio ?? 0;

  return {
    key: `approach-${w.point_code || "unknown"}-${w.monitoring_item || "item"}`,
    priority: ratio >= 0.9 ? "高" : "中",
    label: "逼近限值",
    pointCode: w.point_code,
    item: w.monitoring_item,
    zone: zoneName(w.side, w.part),
    metric: `限值比 ${num(ratio * 100, 0)}%`,
    reason: "接近设计限值，建议确认趋势是否持续。",
  };
}

function riskFromAnomaly(a: GnAnomalyItem): RiskRow {
  return {
    key: `anomaly-${a.point_code || "unknown"}-${a.monitoring_item || "item"}`,
    priority: Math.abs(a.z_score ?? 0) >= 4 ? "高" : "中",
    label: "统计异常",
    pointCode: a.point_code,
    item: a.monitoring_item,
    zone: zoneName(a.side, a.part),
    metric: `Z=${num(a.z_score, 1)}`,
    reason: "偏离历史分布，需判断是真实变化还是数据质量问题。",
  };
}

function riskFromAlert(a: GnAlert, index: number): RiskRow {
  const ratio =
    typeof a.exceed_ratio === "number"
      ? a.exceed_ratio
      : a.design_limit
        ? Math.abs((a.cumulative_change ?? 0) / a.design_limit)
        : 0;

  return {
    key: `alert-${index}-${a.point_code || "unknown"}-${a.monitoring_item || "item"}`,
    priority: ratio >= 1.5 ? "高" : "中",
    label: "疑似超限",
    pointCode: a.point_code,
    item: a.monitoring_item,
    zone: zoneName(a.side, a.part),
    metric: `超限 ${num(ratio, 2)}x`,
    reason: "需复核是否形成正式预警。",
  };
}

function zoneScore(z: GnZoneHeatmapItem): number {
  return (
    (z.severe_count ?? 0) * 5 +
    (z.exceed_count ?? 0) * 3 +
    (z.avg_exceed_ratio ?? 0)
  );
}

function heatFromZone(z: GnZoneHeatmapItem, idx: number): HeatCell {
  return {
    key: `${z.side || "side"}-${z.part || "part"}-${idx}`,
    side: z.side || "未知侧",
    part: z.part || "未标注部位",
    status: z.zone_status || "未判定",
    pointCount: z.point_count ?? 0,
    readingCount: z.reading_count ?? 0,
    exceedCount: z.exceed_count ?? 0,
    severeCount: z.severe_count ?? 0,
    score: zoneScore(z),
  };
}

function heatFromSide(side: string, exceedCnt: number, idx: number): HeatCell {
  return {
    key: `side-${side}-${idx}`,
    side: side || "未知侧",
    part: "全部",
    status: exceedCnt > 0 ? "需复核" : "正常",
    pointCount: 0,
    readingCount: 0,
    exceedCount: exceedCnt,
    severeCount: 0,
    score: exceedCnt * 3,
  };
}

function itemRiskScore(i: GnMonitoringItem): number {
  return (i.exceed_count ?? 0) * 3 + (i.unknown_count ?? 0) + (i.point_count ?? 0) * 0.05;
}

function riskLevel(score: number): Priority {
  if (score >= 80) return "高";
  if (score >= 30) return "中";
  return "低";
}

function buildTodos(params: {
  exceedCount: number;
  unknownCount: number;
  dataGapCount: number;
  missingCoordCount: number;
}): TodoRow[] {
  const rows: TodoRow[] = [];

  if (params.exceedCount > 0) {
    rows.push({
      key: "exceed",
      priority: "高",
      title: "复核疑似超限",
      count: params.exceedCount,
      desc: "确认是否形成正式预警。",
    });
  }

  if (params.unknownCount > 0) {
    rows.push({
      key: "unknown",
      priority: "中",
      title: "确认待判断数据",
      count: params.unknownCount,
      desc: "处理状态不明或限值缺失的数据。",
    });
  }

  if (params.dataGapCount > 0) {
    rows.push({
      key: "gap",
      priority: "中",
      title: "补齐数据口径",
      count: params.dataGapCount,
      desc: "补阈值、证据、坐标等基础信息。",
    });
  }

  if (params.missingCoordCount > 0) {
    rows.push({
      key: "coord",
      priority: "低",
      title: "补测点坐标",
      count: params.missingCoordCount,
      desc: "坐标缺失会影响空间热力判断。",
    });
  }

  return rows;
}

function getThresholdGapCount(dataQuality: GnDataQualityResponse | null): number | undefined {
  const hit = dataQuality?.data_gaps?.find((g) =>
    `${g.category}${g.description}`.includes("阈值") ||
    `${g.category}${g.description}`.includes("限值"),
  );
  return hit?.affected_count;
}

function getQualitySummary(params: {
  dataQuality: GnDataQualityResponse | null;
  dataGaps: GnDataGapsResponse | null;
  unknownCount: number;
  missingCoordCount: number;
}) {
  const thresholdCount = getThresholdGapCount(params.dataQuality);
  const p1 = params.dataGaps?.summary?.p1_count ?? 0;
  const p2 = params.dataGaps?.summary?.p2_count ?? 0;

  return [
    {
      key: "threshold",
      title: "限值口径",
      value: thresholdCount != null ? `${thresholdCount} 项` : "待补充",
      desc: "部分数据只能按设计限值判断，缺少正式预警/报警阈值。",
    },
    {
      key: "unknown",
      title: "待确认数据",
      value: `${params.unknownCount} 条`,
      desc: "这些数据不是已确认风险，需要复核后才能闭环。",
    },
    {
      key: "gap",
      title: "数据缺口",
      value: `P1 ${p1} / P2 ${p2}`,
      desc: "影响整体研判可信度，优先补 P1。",
    },
    {
      key: "coord",
      title: "空间坐标",
      value: `${params.missingCoordCount} 点`,
      desc: "坐标缺失会影响真实空间热力图。",
    },
  ];
}

export default function Area1Monitoring() {
  const [date, setDate] = useState(DEFAULT_DATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dbDown, setDbDown] = useState(false);

  const [overview, setOverview] = useState<GnOverview | null>(null);
  const [briefing, setBriefing] = useState<GnDailyBriefing | null>(null);
  const [earlyWarning, setEarlyWarning] = useState<GnEarlyWarningResponse | null>(null);
  const [items, setItems] = useState<GnMonitoringItem[]>([]);
  const [alerts, setAlerts] = useState<GnAlert[]>([]);
  const [anomaly, setAnomaly] = useState<GnAnomalyResponse | null>(null);
  const [heatmap, setHeatmap] = useState<GnZoneHeatmapResponse | null>(null);
  const [dataQuality, setDataQuality] = useState<GnDataQualityResponse | null>(null);
  const [dataGaps, setDataGaps] = useState<GnDataGapsResponse | null>(null);
  const [missingCoords, setMissingCoords] = useState<GnPointsNeedingCoordsResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [
        healthRes,
        overviewRes,
        briefingRes,
        earlyRes,
        itemsRes,
        alertsRes,
        anomalyRes,
        heatmapRes,
        qualityRes,
        gapsRes,
        coordsRes,
      ] = await Promise.all([
        fetchGnHealth(),
        fetchGnOverview(date),
        fetchGnDailyBriefing(date),
        fetchGnEarlyWarning(date),
        fetchGnMonitoringItems(),
        fetchGnAlerts({ date, limit: 100 }),
        fetchGnAnomalyDetection(date),
        fetchGnZoneHeatmap(date),
        fetchGnDataQualityTyped(),
        fetchGnDataGaps(),
        fetchGnPointsNeedingCoords(),
      ]);

      if (healthRes.ok && healthRes.data) {
        setDbDown(!healthRes.data.ok || healthRes.data.database !== "connected");
      }

      if (overviewRes.ok) setOverview(overviewRes.data ?? null);
      if (briefingRes.ok) setBriefing(briefingRes.data ?? null);
      if (earlyRes.ok) setEarlyWarning(earlyRes.data ?? null);
      if (itemsRes.ok) setItems(itemsRes.data?.items ?? []);
      if (alertsRes.ok) setAlerts(alertsRes.data?.alerts ?? []);
      if (anomalyRes.ok) setAnomaly(anomalyRes.data ?? null);
      if (heatmapRes.ok) setHeatmap(heatmapRes.data ?? null);
      if (qualityRes.ok) setDataQuality(qualityRes.data ?? null);
      if (gapsRes.ok) setDataGaps(gapsRes.data ?? null);
      if (coordsRes.ok) setMissingCoords(coordsRes.data ?? null);
    } catch {
      setError("整体风险研判数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const pointCount = pickCard(overview, ["监测点", "点数"]);
  const readingCount = pickCard(overview, ["累计", "读数", "次数"]);
  const exceedCount = pickCard(overview, ["超限", "超设计"]) || alerts.length;
  const unknownCount = pickCard(overview, ["待确认", "未知"]);
  const anomalyCount = anomaly?.items?.filter((x) => x.is_anomaly).length ?? 0;
  const dataGapCount = dataGaps?.summary?.total_gaps ?? dataGaps?.gaps?.length ?? 0;
  const missingCoordCount = missingCoords?.missing_coords ?? 0;

  const brief = useMemo(
    () =>
      buildBrief({
        overview,
        briefing,
        exceedCount,
        unknownCount,
        anomalyCount,
      }),
    [overview, briefing, exceedCount, unknownCount, anomalyCount],
  );

  const todos = useMemo(
    () =>
      buildTodos({
        exceedCount,
        unknownCount,
        dataGapCount,
        missingCoordCount,
      }),
    [exceedCount, unknownCount, dataGapCount, missingCoordCount],
  );

  const risks = useMemo<RiskRow[]>(() => {
    const rows: RiskRow[] = [];

    for (const w of earlyWarning?.top_worsening ?? []) rows.push(riskFromWorsening(w));
    for (const w of earlyWarning?.top_approaching ?? []) rows.push(riskFromApproaching(w));
    for (const a of (anomaly?.items ?? []).filter((x) => x.is_anomaly)) rows.push(riskFromAnomaly(a));
    alerts.slice(0, 30).forEach((a, idx) => rows.push(riskFromAlert(a, idx)));

    const weight: Record<Priority, number> = { 高: 3, 中: 2, 低: 1 };
    const uniq = new Map<string, RiskRow>();

    for (const row of rows) {
      const key = `${row.pointCode ?? "unknown"}-${row.item ?? "item"}-${row.label}`;
      const old = uniq.get(key);
      if (!old || weight[row.priority] > weight[old.priority]) uniq.set(key, row);
    }

    return Array.from(uniq.values())
      .sort((a, b) => weight[b.priority] - weight[a.priority])
      .slice(0, 8);
  }, [earlyWarning, anomaly, alerts]);

  const heatCells = useMemo<HeatCell[]>(() => {
    const fromHeatmap = (heatmap?.items ?? [])
      .map(heatFromZone)
      .filter((x) => x.side || x.part);

    if (fromHeatmap.length > 0) {
      return fromHeatmap.sort((a, b) => b.score - a.score).slice(0, 12);
    }

    return (earlyWarning?.zone_summary ?? [])
      .map((z, idx) => heatFromSide(z.side, z.exceed_cnt, idx))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }, [heatmap, earlyWarning]);

  const riskTypes = useMemo(() => {
    return [...items]
      .map((i) => ({
        ...i,
        riskScore: itemRiskScore(i),
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 6);
  }, [items]);

  const qualitySummary = useMemo(
    () =>
      getQualitySummary({
        dataQuality,
        dataGaps,
        unknownCount,
        missingCoordCount,
      }),
    [dataQuality, dataGaps, unknownCount, missingCoordCount],
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
          <p style={styles.subtitle}>整体研判、风险排序、分区热力与单点跳转。</p>
        </div>

        <div style={styles.toolbar}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={styles.input}
          />
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
          <div style={styles.briefLine}>
            <span
              style={{
                ...styles.stateBadge,
                borderColor: colorByState(brief.state),
                color: colorByState(brief.state),
              }}
            >
              {brief.state}
            </span>
            <div>
              <div style={styles.briefTitle}>{brief.title}</div>
              <div style={styles.briefText}>{brief.reason}</div>
            </div>
          </div>
          <div style={styles.nextStep}>{brief.action}</div>
        </Panel>

        <div style={styles.kpiGrid}>
          <Kpi title="疑似超限" value={exceedCount} unit="条" color="#e65100" />
          <Kpi title="待确认" value={unknownCount} unit="条" color="#d4a050" />
          <Kpi title="统计异常" value={anomalyCount} unit="条" color="#00d4ff" />
          <Kpi title="监测覆盖" value={pointCount} unit="点" color="#2e7d32" sub={`${readingCount} 条读数`} />
        </div>
      </section>

      <section style={styles.twoCol}>
        <Panel title="优先处理">
          {todos.length === 0 ? (
            <Empty text="暂无待处理事项" />
          ) : (
            <div style={styles.todoGrid}>
              {todos.map((t) => (
                <div key={t.key} style={styles.todo}>
                  <span style={{ ...styles.priority, background: colorByPriority(t.priority) }}>
                    {t.priority}
                  </span>
                  <div>
                    <div style={styles.rowBetween}>
                      <b>{t.title}</b>
                      <span style={styles.count}>{t.count} 项</span>
                    </div>
                    <div style={styles.muted}>{t.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="重点风险记录">
          {risks.length === 0 ? (
            <Empty text="暂无重点风险记录" />
          ) : (
            <div style={styles.riskGrid}>
              {risks.map((r) => (
                <div key={r.key} style={styles.risk}>
                  <div style={styles.riskTop}>
                    <span
                      style={{
                        ...styles.priorityOutline,
                        color: colorByPriority(r.priority),
                        borderColor: colorByPriority(r.priority),
                      }}
                    >
                      {r.priority}
                    </span>
                    <span style={styles.typeTag}>{r.label}</span>
                    {r.metric && <span style={styles.metricTag}>{r.metric}</span>}
                  </div>

                  <div style={styles.riskTitle}>
                    {r.item || "未知监测项"}
                    {r.pointCode && <span style={styles.point}> / {r.pointCode}</span>}
                  </div>

                  <div style={styles.muted}>{r.zone}，{r.reason}</div>

                  {r.pointCode && (
                    <a
                      style={styles.linkButton}
                      href={`${POINT_PAGE}?point_code=${encodeURIComponent(r.pointCode)}`}
                    >
                      查看单点
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <Panel title="分区风险热力">
        {heatCells.length === 0 ? (
          <div style={styles.notice}>
            暂无可用分区热力数据。{missingCoordCount > 0 ? `当前还有 ${missingCoordCount} 个测点缺少坐标。` : ""}
          </div>
        ) : (
          <div style={styles.heatGrid}>
            {heatCells.map((cell) => (
              <div key={cell.key} style={styles.heatCell}>
                <div style={styles.rowBetween}>
                  <b>{cell.side}</b>
                  <span style={{ ...styles.heatStatus, color: colorByState(cell.status) }}>
                    {cell.status}
                  </span>
                </div>
                <div style={styles.heatPart}>{cell.part}</div>
                <div style={styles.heatNums}>
                  <span>超限 {cell.exceedCount}</span>
                  <span>严重 {cell.severeCount}</span>
                  {cell.pointCount > 0 && <span>点位 {cell.pointCount}</span>}
                </div>
                <div style={styles.barTrack}>
                  <div
                    style={{
                      ...styles.barFill,
                      width: `${Math.min(100, cell.score * 2)}%`,
                      background: colorByState(cell.status),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <section style={styles.twoCol}>
        <Panel title="风险类型排行">
          {riskTypes.length === 0 ? (
            <Empty text="暂无监测类型数据" />
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>类型</th>
                  <th style={styles.th}>点位</th>
                  <th style={styles.th}>超限</th>
                  <th style={styles.th}>待确认</th>
                  <th style={styles.th}>等级</th>
                </tr>
              </thead>
              <tbody>
                {riskTypes.map((i, idx) => {
                  const level = riskLevel(i.riskScore);
                  return (
                    <tr key={`${i.monitoring_item || "item"}-${idx}`}>
                      <td style={styles.td}>{i.monitoring_item || "-"}</td>
                      <td style={styles.td}>{i.point_count ?? 0}</td>
                      <td style={{ ...styles.td, color: "#e65100" }}>{i.exceed_count ?? 0}</td>
                      <td style={{ ...styles.td, color: "#d4a050" }}>{i.unknown_count ?? 0}</td>
                      <td style={{ ...styles.td, color: colorByPriority(level), fontWeight: 800 }}>{level}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="数据口径">
          <div style={styles.qualityGrid}>
            {qualitySummary.map((q) => (
              <div key={q.key} style={styles.quality}>
                <div style={styles.qualityTop}>
                  <b>{q.title}</b>
                  <span style={styles.count}>{q.value}</span>
                </div>
                <div style={styles.muted}>{q.desc}</div>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={styles.panel}>
      <h2 style={styles.h2}>{title}</h2>
      {children}
    </section>
  );
}

function Kpi({
  title,
  value,
  unit,
  color,
  sub,
}: {
  title: string;
  value: number | string;
  unit: string;
  color: string;
  sub?: string;
}) {
  return (
    <div style={styles.kpi}>
      <div style={styles.kpiTitle}>{title}</div>
      <div style={{ ...styles.kpiValue, color }}>
        {value}
        <span style={styles.kpiUnit}> {unit}</span>
      </div>
      {sub && <div style={styles.muted}>{sub}</div>}
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
    gridTemplateColumns: "1.35fr 1fr",
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
  h2: {
    margin: "0 0 12px",
    fontSize: 16,
    color: "#e6f2ff",
    fontWeight: 800,
  },
  briefLine: {
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
  briefTitle: {
    fontSize: 22,
    lineHeight: 1.35,
    color: "#e6f2ff",
    fontWeight: 900,
    marginBottom: 6,
  },
  briefText: {
    color: "#98aec9",
    fontSize: 13,
    lineHeight: 1.6,
  },
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
  todoGrid: {
    display: "grid",
    gap: 10,
  },
  todo: {
    display: "grid",
    gridTemplateColumns: "52px 1fr",
    gap: 10,
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
  },
  priority: {
    color: "#050816",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 12,
    fontWeight: 900,
    textAlign: "center",
    alignSelf: "start",
  },
  priorityOutline: {
    border: "1px solid",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 12,
    fontWeight: 800,
  },
  rowBetween: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
  },
  count: {
    color: "#00d4ff",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  muted: {
    color: "#98aec9",
    fontSize: 12,
    lineHeight: 1.6,
  },
  riskGrid: {
    display: "grid",
    gap: 10,
  },
  risk: {
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
  },
  riskTop: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 8,
  },
  typeTag: {
    background: "#121e36",
    color: "#c8d6e5",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 12,
  },
  metricTag: {
    background: "#102a43",
    color: "#00d4ff",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 12,
  },
  riskTitle: {
    color: "#e6f2ff",
    fontWeight: 800,
    marginBottom: 4,
  },
  point: {
    color: "#98aec9",
    fontWeight: 500,
  },
  linkButton: {
    display: "inline-block",
    marginTop: 8,
    color: "#00d4ff",
    textDecoration: "none",
    fontSize: 12,
  },
  heatGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 10,
  },
  heatCell: {
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
  },
  heatStatus: {
    fontSize: 12,
    fontWeight: 900,
  },
  heatPart: {
    color: "#98aec9",
    fontSize: 12,
    marginTop: 6,
  },
  heatNums: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    color: "#98aec9",
    fontSize: 12,
    margin: "10px 0",
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
  },
  td: {
    borderBottom: "1px solid #1a2640",
    padding: "9px 7px",
    color: "#c8d6e5",
  },
  qualityGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  quality: {
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
  },
  qualityTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  notice: {
    color: "#98aec9",
    background: "#0b1020",
    border: "1px dashed #1a2640",
    borderRadius: 8,
    padding: 16,
    fontSize: 13,
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