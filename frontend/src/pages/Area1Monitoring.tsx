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
  fetchGnCrossCorrelation,
  fetchGnDataQualityTyped,
  fetchGnDataGaps,
  fetchGnManualReviews,
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
  GnCrossCorrelationResponse,
  GnDataQualityResponse,
  GnDataGapsResponse,
  GnDataGap,
  GnManualReviewResponse,
  GnPointsNeedingCoordsResponse,
} from "../api/area1";

const DEFAULT_DATE = "2026-04-14";

type Priority = "高" | "中" | "低";
type OverallStatus = "正常" | "关注" | "需复核" | "预警" | "严重" | "未判定";

type RiskQueueRow = {
  key: string;
  priority: Priority;
  type: string;
  pointCode?: string;
  item?: string;
  zone?: string;
  metric?: string;
  explanation: string;
};

type TodoRow = {
  key: string;
  priority: Priority;
  title: string;
  count?: number;
  description: string;
};

type GapRow = {
  key: string;
  title: string;
  description: string;
  count?: number;
  priority?: string;
};

type BriefView = {
  status: OverallStatus;
  title: string;
  description: string;
  reason: string;
  nextStep: string;
};

type DataQualityGapItem = NonNullable<GnDataQualityResponse["data_gaps"]>[number];

function pickCard(overview: GnOverview | null, keywords: string[], fallback = 0): number {
  const cards = overview?.cards ?? [];
  const hit = cards.find((c) => keywords.some((k) => c.name?.includes(k)));
  return hit?.value ?? fallback;
}

function formatNumber(v: number | null | undefined, digits = 1): string {
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

function statusColor(status?: string): string {
  const value = status ?? "";

  if (["严重", "高", "critical", "severe"].some((x) => value.includes(x))) {
    return "#e65100";
  }

  if (["预警", "报警", "异常", "warning", "alarm"].some((x) => value.includes(x))) {
    return "#d4a050";
  }

  if (["需复核", "复核", "关注", "中"].some((x) => value.includes(x))) {
    return "#00d4ff";
  }

  if (["正常", "低", "normal", "ok"].some((x) => value.includes(x))) {
    return "#2e7d32";
  }

  return "#5a6d8a";
}

function priorityColor(priority: Priority): string {
  if (priority === "高") return "#e65100";
  if (priority === "中") return "#d4a050";
  return "#00d4ff";
}

function zoneLabel(side?: string, part?: string): string {
  if (!side && !part) return "未标注区域";
  return `${side || "未知侧"} · ${part || "未知部位"}`;
}

function zoneScore(z: GnZoneHeatmapItem): number {
  return (
    (z.severe_count ?? 0) * 5 +
    (z.exceed_count ?? 0) * 3 +
    (z.avg_exceed_ratio ?? 0)
  );
}

function itemRiskScore(i: GnMonitoringItem): number {
  return (
    (i.exceed_count ?? 0) * 3 +
    (i.unknown_count ?? 0) +
    (i.point_count ?? 0) * 0.05
  );
}

function riskLevelFromScore(score: number): Priority {
  if (score >= 80) return "高";
  if (score >= 30) return "中";
  return "低";
}

function deriveStatus(params: {
  rawLevel?: string;
  exceedCount: number;
  unknownCount: number;
  anomalyCount: number;
}): OverallStatus {
  const raw = params.rawLevel ?? "";

  if (raw.includes("严重")) return "严重";
  if (raw.includes("预警") || raw.includes("报警") || raw.includes("异常")) return "预警";
  if (params.exceedCount > 0 || raw.includes("复核") || raw.includes("重点")) return "需复核";
  if (params.unknownCount > 0 || params.anomalyCount > 0 || raw.includes("关注")) return "关注";
  if (raw.includes("正常")) return "正常";

  return "未判定";
}

function buildBriefView(params: {
  overview: GnOverview | null;
  briefing: GnDailyBriefing | null;
  exceedCount: number;
  unknownCount: number;
  anomalyCount: number;
}): BriefView {
  const count =
    extractCount(params.overview?.headline, params.briefing?.recommendation) ??
    params.unknownCount ??
    0;

  const status = deriveStatus({
    rawLevel: params.overview?.overall_level_cn || params.overview?.overall_level,
    exceedCount: params.exceedCount,
    unknownCount: params.unknownCount,
    anomalyCount: params.anomalyCount,
  });

  if (status === "正常") {
    return {
      status,
      title: "今日未发现明显整体风险",
      description: "当前监测数据未显示需要优先处理的整体性异常。",
      reason: "超限、待确认和统计异常数量处于较低水平。",
      nextStep: "保持日常监测，继续观察分区变化和监测类型趋势。",
    };
  }

  if (status === "需复核") {
    return {
      status,
      title: count > 0 ? `今日有 ${count} 条记录需要复核` : "今日存在需要复核的监测记录",
      description: "这些记录尚未等同于已确认预警，需要先完成复核判断。",
      reason:
        params.exceedCount > 0
          ? `当前存在 ${params.exceedCount} 条疑似超限记录，同时有 ${params.unknownCount} 条待确认数据。`
          : `当前有 ${params.unknownCount} 条待确认数据，部分数据可能因限值缺失或状态不明确而无法自动判断。`,
      nextStep: "先复核疑似超限记录，再处理缺失限值、缺坐标或无法自动判断的数据。",
    };
  }

  if (status === "预警" || status === "严重") {
    return {
      status,
      title: status === "严重" ? "今日存在严重风险信号" : "今日存在预警风险信号",
      description: "系统检测到异常或超限信号，需要优先核查重点区域与重点监测类型。",
      reason: `当前疑似超限 ${params.exceedCount} 条，统计异常 ${params.anomalyCount} 条，待确认 ${params.unknownCount} 条。`,
      nextStep: "优先核查高优先级风险队列，并结合分区热力判断是否存在集中风险。",
    };
  }

  return {
    status,
    title: "今日存在需要关注的监测变化",
    description: "当前未形成明确严重预警，但存在需要持续观察或补充确认的数据。",
    reason: `待确认 ${params.unknownCount} 条，统计异常 ${params.anomalyCount} 条。`,
    nextStep: "关注异常集中区域、风险类型分布和数据质量缺口。",
  };
}

function riskFromWorsening(w: GnEarlyWarningItem): RiskQueueRow {
  return {
    key: `worsening-${w.point_code || "unknown"}-${w.monitoring_item || "item"}`,
    priority: "高",
    type: "恶化加快",
    pointCode: w.point_code,
    item: w.monitoring_item,
    zone: zoneLabel(w.side, w.part),
    metric: `日变化 ${formatNumber(w.daily_chg, 2)}`,
    explanation: "变化速度靠前，建议纳入重点观察。",
  };
}

function riskFromApproaching(w: GnEarlyWarningItem): RiskQueueRow {
  const ratio = w.ratio ?? 0;

  return {
    key: `approaching-${w.point_code || "unknown"}-${w.monitoring_item || "item"}`,
    priority: ratio >= 0.9 ? "高" : "中",
    type: "逼近阈值",
    pointCode: w.point_code,
    item: w.monitoring_item,
    zone: zoneLabel(w.side, w.part),
    metric: `阈值比 ${formatNumber(ratio * 100, 0)}%`,
    explanation: "接近设计限值，建议确认趋势是否持续。",
  };
}

function riskFromAnomaly(a: GnAnomalyItem): RiskQueueRow {
  return {
    key: `anomaly-${a.point_code || "unknown"}-${a.monitoring_item || "item"}`,
    priority: Math.abs(a.z_score ?? 0) >= 4 ? "高" : "中",
    type: "统计异常",
    pointCode: a.point_code,
    item: a.monitoring_item,
    zone: zoneLabel(a.side, a.part),
    metric: `Z=${formatNumber(a.z_score, 1)}`,
    explanation: "偏离历史分布，需判断是真实变化还是数据质量问题。",
  };
}

function riskFromAlert(a: GnAlert, index: number): RiskQueueRow {
  const ratio =
    typeof a.exceed_ratio === "number"
      ? a.exceed_ratio
      : a.design_limit
        ? Math.abs((a.cumulative_change ?? 0) / a.design_limit)
        : 0;

  return {
    key: `alert-${index}-${a.point_code || "unknown"}-${a.monitoring_item || "item"}`,
    priority: ratio >= 1.5 ? "高" : "中",
    type: "疑似超限",
    pointCode: a.point_code,
    item: a.monitoring_item,
    zone: zoneLabel(a.side, a.part),
    metric: `超限 ${formatNumber(ratio, 2)}x`,
    explanation: "需要复核是否形成正式预警。",
  };
}

function buildTodoRows(params: {
  exceedCount: number;
  unknownCount: number;
  dataGapCount: number;
  missingCoordCount: number;
  manualReviewCount: number;
}): TodoRow[] {
  const rows: TodoRow[] = [];

  if (params.exceedCount > 0) {
    rows.push({
      key: "exceed",
      priority: "高",
      title: "复核疑似超限记录",
      count: params.exceedCount,
      description: "确认是否形成正式预警，避免把待确认记录误读成已确认风险。",
    });
  }

  if (params.unknownCount > 0) {
    rows.push({
      key: "unknown",
      priority: "中",
      title: "确认待判断数据",
      count: params.unknownCount,
      description: "处理状态不明确、缺少限值或无法自动识别的数据。",
    });
  }

  if (params.dataGapCount > 0) {
    rows.push({
      key: "gaps",
      priority: "中",
      title: "补齐数据缺口",
      count: params.dataGapCount,
      description: "完善阈值、证据、坐标等信息，提高整体研判可信度。",
    });
  }

  if (params.missingCoordCount > 0) {
    rows.push({
      key: "coords",
      priority: "低",
      title: "补充测点坐标",
      count: params.missingCoordCount,
      description: "坐标缺失会影响分区热力与空间定位分析。",
    });
  }

  if (rows.length === 0 && params.manualReviewCount > 0) {
    rows.push({
      key: "reviewed",
      priority: "低",
      title: "查看已复核记录",
      count: params.manualReviewCount,
      description: "当前主要是复核记录归档，可按需查看处理结果。",
    });
  }

  return rows;
}

function normalizeQualityGap(g: DataQualityGapItem, index: number): GapRow {
  return {
    key: `quality-${index}-${g.category || "gap"}`,
    title: g.category || "数据质量问题",
    description: g.description || "-",
    count: g.affected_count,
  };
}

function normalizeDataGap(g: GnDataGap, index: number): GapRow {
  return {
    key: `gap-${g.id || index}-${g.title || "gap"}`,
    title: g.title || "数据缺口",
    description: g.description || g.impact || "-",
    priority: g.priority,
  };
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
  const [crossCorr, setCrossCorr] = useState<GnCrossCorrelationResponse | null>(null);
  const [dataQuality, setDataQuality] = useState<GnDataQualityResponse | null>(null);
  const [dataGaps, setDataGaps] = useState<GnDataGapsResponse | null>(null);
  const [manualReviews, setManualReviews] = useState<GnManualReviewResponse | null>(null);
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
        corrRes,
        qualityRes,
        gapsRes,
        reviewsRes,
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
        fetchGnCrossCorrelation(),
        fetchGnDataQualityTyped(),
        fetchGnDataGaps(),
        fetchGnManualReviews(),
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
      if (corrRes.ok) setCrossCorr(corrRes.data ?? null);
      if (qualityRes.ok) setDataQuality(qualityRes.data ?? null);
      if (gapsRes.ok) setDataGaps(gapsRes.data ?? null);
      if (reviewsRes.ok) setManualReviews(reviewsRes.data ?? null);
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
  const exceedCount = pickCard(overview, ["超限", "超设计"]);
  const unknownCount = pickCard(overview, ["待确认", "未知"]);

  const anomalyCount = anomaly?.items?.filter((x) => x.is_anomaly).length ?? 0;
  const manualReviewCount = manualReviews?.reviews?.length ?? 0;
  const dataGapCount = dataGaps?.summary?.total_gaps ?? dataGaps?.gaps?.length ?? 0;
  const missingCoordCount = missingCoords?.missing_coords ?? 0;

  const brief = useMemo(
    () =>
      buildBriefView({
        overview,
        briefing,
        exceedCount,
        unknownCount,
        anomalyCount,
      }),
    [overview, briefing, exceedCount, unknownCount, anomalyCount],
  );

  const todoRows = useMemo(
    () =>
      buildTodoRows({
        exceedCount,
        unknownCount,
        dataGapCount,
        missingCoordCount,
        manualReviewCount,
      }),
    [exceedCount, unknownCount, dataGapCount, missingCoordCount, manualReviewCount],
  );

  const riskRows = useMemo<RiskQueueRow[]>(() => {
    const rows: RiskQueueRow[] = [];

    for (const w of earlyWarning?.top_worsening ?? []) rows.push(riskFromWorsening(w));
    for (const w of earlyWarning?.top_approaching ?? []) rows.push(riskFromApproaching(w));
    for (const a of (anomaly?.items ?? []).filter((x) => x.is_anomaly)) rows.push(riskFromAnomaly(a));
    alerts.slice(0, 30).forEach((a, index) => rows.push(riskFromAlert(a, index)));

    const priorityWeight: Record<Priority, number> = { 高: 3, 中: 2, 低: 1 };
    const uniq = new Map<string, RiskQueueRow>();

    for (const row of rows) {
      const key = `${row.type}-${row.pointCode ?? "unknown"}-${row.item ?? "item"}`;
      const old = uniq.get(key);
      if (!old || priorityWeight[row.priority] > priorityWeight[old.priority]) {
        uniq.set(key, row);
      }
    }

    return Array.from(uniq.values())
      .sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority])
      .slice(0, 10);
  }, [earlyWarning, anomaly, alerts]);

  const zoneRows = useMemo(() => {
    return [...(heatmap?.items ?? [])]
      .sort((a, b) => zoneScore(b) - zoneScore(a))
      .slice(0, 9);
  }, [heatmap]);

  const riskTypeRows = useMemo(() => {
    return [...items]
      .map((i) => ({
        ...i,
        riskScore: itemRiskScore(i),
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 8);
  }, [items]);

  const gapRows = useMemo<GapRow[]>(() => {
    const qualityRows = (dataQuality?.data_gaps ?? []).map(normalizeQualityGap);
    const gapRowsFromApi = (dataGaps?.gaps ?? []).map(normalizeDataGap);

    return [...qualityRows, ...gapRowsFromApi].slice(0, 8);
  }, [dataQuality, dataGaps]);

  const strongCorrelations = useMemo(() => {
    return (crossCorr?.correlations ?? [])
      .filter((c) => ["强", "中等"].includes(c.strength || ""))
      .slice(0, 5);
  }, [crossCorr]);

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
          <p style={styles.subtitle}>
            面向整体监测、分区预警、风险类型分布与数据质量闭环；单点趋势请进入单点分析页。
          </p>
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
              borderColor: dbDown ? "#e65100" : "#2e7d32",
              color: dbDown ? "#e65100" : "#2e7d32",
            }}
          >
            {dbDown ? "数据库异常" : "系统正常"}
          </span>
        </div>
      </header>

      {error && <div style={styles.error}>{error}</div>}
      {dbDown && <div style={styles.error}>数据库连接异常，当前研判结果可能不完整。</div>}

      <section style={styles.topGrid}>
        <Panel title="今日整体研判" desc="先说明整体判断，再说明为什么，以及下一步做什么。">
          <div style={styles.briefHeader}>
            <span
              style={{
                ...styles.levelBadge,
                borderColor: statusColor(brief.status),
                color: statusColor(brief.status),
              }}
            >
              {brief.status}
            </span>
            <div>
              <div style={styles.briefTitle}>{brief.title}</div>
              <div style={styles.briefDesc}>{brief.description}</div>
            </div>
          </div>

          <div style={styles.briefBody}>
            <InfoLine label="判断依据" text={brief.reason} />
            <InfoLine label="建议动作" text={brief.nextStep} />
          </div>
        </Panel>

        <div style={styles.kpiGrid}>
          <KpiCard title="疑似超限" value={exceedCount} unit="条" desc="需复核是否形成正式预警" tone="danger" />
          <KpiCard title="待确认" value={unknownCount} unit="条" desc="尚未完成状态判断" tone="warning" />
          <KpiCard title="统计异常" value={anomalyCount} unit="条" desc="偏离历史分布的记录" tone="info" />
          <KpiCard title="监测覆盖" value={pointCount} unit="点" desc={`累计读数 ${readingCount} 条`} tone="normal" />
        </div>
      </section>

      <section style={styles.twoCol}>
        <Panel title="优先待办" desc="把待确认数据拆成可以处理的任务，不直接暴露系统内部路径。">
          {todoRows.length === 0 ? (
            <Empty text="暂无优先待办" />
          ) : (
            <div style={styles.todoList}>
              {todoRows.map((todo) => (
                <div key={todo.key} style={styles.todoItem}>
                  <span
                    style={{
                      ...styles.priorityBadge,
                      background: priorityColor(todo.priority),
                    }}
                  >
                    {todo.priority}
                  </span>

                  <div style={styles.todoContent}>
                    <div style={styles.rowBetween}>
                      <b>{todo.title}</b>
                      {todo.count != null && <span style={styles.countText}>{todo.count} 项</span>}
                    </div>
                    <div style={styles.muted}>{todo.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="重点风险队列" desc="汇总全区恶化、逼近阈值、统计异常和疑似超限；这里只排序，不展开单点诊断。">
          {riskRows.length === 0 ? (
            <Empty text="暂无重点风险项" />
          ) : (
            <div style={styles.riskList}>
              {riskRows.map((r) => (
                <div key={r.key} style={styles.riskItem}>
                  <div style={styles.riskMeta}>
                    <span
                      style={{
                        ...styles.priorityOutline,
                        borderColor: priorityColor(r.priority),
                        color: priorityColor(r.priority),
                      }}
                    >
                      {r.priority}
                    </span>
                    <span style={styles.typeBadge}>{r.type}</span>
                    {r.metric && <span style={styles.metricBadge}>{r.metric}</span>}
                  </div>

                  <div style={styles.riskTitle}>
                    {r.item || "未知监测项"}
                    {r.pointCode && <span style={styles.pointCode}> / {r.pointCode}</span>}
                  </div>

                  <div style={styles.muted}>{r.zone}，{r.explanation}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <Panel title="分区风险热力" desc="回答“风险集中在哪里”。按严重数、超限数和平均超限比综合排序。">
        {zoneRows.length === 0 ? (
          <Empty text="暂无分区热力数据" />
        ) : (
          <div style={styles.zoneGrid}>
            {zoneRows.map((z, idx) => {
              const score = zoneScore(z);
              return (
                <div key={`${z.side || "side"}-${z.part || "part"}-${idx}`} style={styles.zoneCard}>
                  <div style={styles.rowBetween}>
                    <b>{zoneLabel(z.side, z.part)}</b>
                    <span style={{ ...styles.zoneStatus, color: statusColor(z.zone_status) }}>
                      {z.zone_status || "未判定"}
                    </span>
                  </div>

                  <div style={styles.zoneStats}>
                    <span>点位 {z.point_count ?? 0}</span>
                    <span>读数 {z.reading_count ?? 0}</span>
                    <span>超限 {z.exceed_count ?? 0}</span>
                    <span>严重 {z.severe_count ?? 0}</span>
                  </div>

                  <div style={styles.barTrack}>
                    <div
                      style={{
                        ...styles.barFill,
                        width: `${Math.min(100, score * 2)}%`,
                        background: statusColor(z.zone_status),
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <section style={styles.twoCol}>
        <Panel title="风险类型排行" desc="按超限、待确认和点位规模综合排序，回答“哪类监测问题最突出”。">
          {riskTypeRows.length === 0 ? (
            <Empty text="暂无监测项目数据" />
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>监测类型</th>
                    <th style={styles.th}>对象</th>
                    <th style={styles.th}>点位</th>
                    <th style={styles.th}>超限</th>
                    <th style={styles.th}>待确认</th>
                    <th style={styles.th}>风险</th>
                  </tr>
                </thead>

                <tbody>
                  {riskTypeRows.map((i, idx) => {
                    const risk = riskLevelFromScore(i.riskScore);
                    return (
                      <tr key={`${i.monitoring_item || "item"}-${i.monitoring_object || "object"}-${idx}`}>
                        <td style={styles.td}>{i.monitoring_item || "-"}</td>
                        <td style={styles.td}>{i.monitoring_object || "-"}</td>
                        <td style={styles.td}>{i.point_count ?? 0}</td>
                        <td style={{ ...styles.td, color: "#e65100" }}>{i.exceed_count ?? 0}</td>
                        <td style={{ ...styles.td, color: "#d4a050" }}>{i.unknown_count ?? 0}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.riskLevel, color: priorityColor(risk) }}>{risk}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="数据质量说明" desc="解释哪些不是已确认风险，而是因为限值、证据、坐标或状态不完整导致的不确定。">
          {gapRows.length === 0 ? (
            <Empty text="暂无数据质量缺口" />
          ) : (
            <div style={styles.gapList}>
              {gapRows.map((g) => (
                <div key={g.key} style={styles.gapItem}>
                  <div>
                    <b>{g.title}</b>
                    <div style={styles.muted}>{g.description}</div>
                    {g.priority && <div style={styles.muted}>优先级：{g.priority}</div>}
                  </div>

                  {g.count != null && <span style={styles.countText}>{g.count} 项</span>}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <section style={styles.twoCol}>
        <Panel title="统计异常概览" desc="只做整体概览，不替代单点分析。">
          <div style={styles.miniGrid}>
            <MiniStat label="异常记录" value={anomalyCount} />
            <MiniStat label="Sigma 阈值" value={anomaly?.sigma_threshold ?? "-"} />
          </div>

          {(anomaly?.items ?? [])
            .filter((x) => x.is_anomaly)
            .slice(0, 5)
            .map((x, idx) => (
              <div key={`${x.point_code || "point"}-${idx}`} style={styles.compactRow}>
                <span>{x.monitoring_item || "-"}</span>
                <span style={styles.muted}>{zoneLabel(x.side, x.part)}</span>
                <span style={styles.metricBadge}>Z={formatNumber(x.z_score, 1)}</span>
              </div>
            ))}

          {anomalyCount === 0 && <Empty text="暂无统计异常记录" />}
        </Panel>

        <Panel title="测项关联分析" desc="仅展示强/中等相关，用于提示系统性联动风险。">
          {strongCorrelations.length === 0 ? (
            <Empty text="暂无强相关或中等相关结果" />
          ) : (
            strongCorrelations.map((c, idx) => (
              <div key={`${c.item_a || "a"}-${c.item_b || "b"}-${idx}`} style={styles.correlationItem}>
                <div>
                  <b>{c.item_a || "-"} ↔ {c.item_b || "-"}</b>
                  <div style={styles.muted}>
                    {c.description || `${c.strength || ""}${c.direction || ""}相关`}
                  </div>
                </div>
                <span style={styles.metricBadge}>r={formatNumber(c.coefficient, 2)}</span>
              </div>
            ))
          )}
        </Panel>
      </section>

      <footer style={styles.footer}>
        当前页面定位：整体风险研判与预警。单点趋势、阈值逼近、证据链和诊断请进入「1工区单点分析」。
      </footer>
    </div>
  );
}

function Panel({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={styles.panel}>
      <div style={styles.panelHeader}>
        <h2 style={styles.h2}>{title}</h2>
        {desc && <p style={styles.panelDesc}>{desc}</p>}
      </div>
      {children}
    </section>
  );
}

function KpiCard({
  title,
  value,
  unit,
  desc,
  tone,
}: {
  title: string;
  value: number | string;
  unit?: string;
  desc: string;
  tone: "danger" | "warning" | "info" | "normal";
}) {
  const colorMap: Record<typeof tone, string> = {
    danger: "#e65100",
    warning: "#d4a050",
    info: "#00d4ff",
    normal: "#2e7d32",
  };

  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiTitle}>{title}</div>
      <div style={{ ...styles.kpiValue, color: colorMap[tone] }}>
        {value}
        {unit && <span style={styles.kpiUnit}> {unit}</span>}
      </div>
      <div style={styles.kpiDesc}>{desc}</div>
    </div>
  );
}

function InfoLine({ label, text }: { label: string; text: string }) {
  return (
    <div style={styles.infoLine}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={styles.infoText}>{text}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={styles.miniStat}>
      <div style={styles.kpiTitle}>{label}</div>
      <div style={styles.miniValue}>{value}</div>
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
    marginBottom: 18,
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
    whiteSpace: "nowrap",
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
    padding: 16,
    marginBottom: 14,
  },
  panelHeader: {
    marginBottom: 14,
  },
  h2: {
    margin: 0,
    fontSize: 16,
    color: "#e6f2ff",
    fontWeight: 800,
  },
  panelDesc: {
    margin: "6px 0 0",
    color: "#5a6d8a",
    fontSize: 12,
    lineHeight: 1.6,
  },
  briefHeader: {
    display: "grid",
    gridTemplateColumns: "92px 1fr",
    gap: 14,
    alignItems: "start",
    marginBottom: 14,
  },
  levelBadge: {
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
  briefDesc: {
    color: "#98aec9",
    fontSize: 14,
    lineHeight: 1.7,
  },
  briefBody: {
    display: "grid",
    gap: 10,
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
  },
  infoLine: {
    display: "grid",
    gridTemplateColumns: "76px 1fr",
    gap: 10,
    alignItems: "start",
  },
  infoLabel: {
    color: "#00d4ff",
    fontSize: 13,
    fontWeight: 800,
  },
  infoText: {
    color: "#c8d6e5",
    fontSize: 13,
    lineHeight: 1.7,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  kpiCard: {
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
    marginBottom: 4,
  },
  kpiUnit: {
    fontSize: 13,
    color: "#5a6d8a",
    fontWeight: 500,
  },
  kpiDesc: {
    color: "#5a6d8a",
    fontSize: 12,
    lineHeight: 1.5,
  },
  todoList: {
    display: "grid",
    gap: 10,
  },
  todoItem: {
    display: "grid",
    gridTemplateColumns: "52px 1fr",
    gap: 10,
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
  },
  priorityBadge: {
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
    whiteSpace: "nowrap",
  },
  todoContent: {
    display: "grid",
    gap: 4,
  },
  rowBetween: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
  },
  countText: {
    color: "#00d4ff",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  muted: {
    color: "#98aec9",
    fontSize: 12,
    lineHeight: 1.6,
  },
  riskList: {
    display: "grid",
    gap: 10,
  },
  riskItem: {
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
  },
  riskMeta: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  typeBadge: {
    background: "#121e36",
    color: "#c8d6e5",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 12,
  },
  metricBadge: {
    background: "#102a43",
    color: "#00d4ff",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  riskTitle: {
    color: "#e6f2ff",
    fontWeight: 800,
    marginBottom: 4,
  },
  pointCode: {
    color: "#98aec9",
    fontWeight: 500,
  },
  zoneGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },
  zoneCard: {
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
  },
  zoneStatus: {
    fontWeight: 900,
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  zoneStats: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 6,
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
  tableWrap: {
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
    whiteSpace: "nowrap",
  },
  riskLevel: {
    fontWeight: 900,
  },
  gapList: {
    display: "grid",
    gap: 10,
  },
  gapItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
  },
  miniGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginBottom: 12,
  },
  miniStat: {
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
  },
  miniValue: {
    fontSize: 22,
    color: "#00d4ff",
    fontWeight: 900,
  },
  compactRow: {
    display: "grid",
    gridTemplateColumns: "1.1fr 1fr auto",
    gap: 10,
    alignItems: "center",
    padding: "9px 0",
    borderBottom: "1px solid #1a2640",
  },
  correlationItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
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
  footer: {
    color: "#5a6d8a",
    fontSize: 12,
    padding: "10px 0 4px",
  },
};