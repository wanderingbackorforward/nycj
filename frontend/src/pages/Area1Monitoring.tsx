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

type WarningRow = {
  key: string;
  priority: Priority;
  source: string;
  pointCode?: string;
  item?: string;
  side?: string;
  part?: string;
  value?: string;
  action: string;
};

type DataQualityGapItem = NonNullable<GnDataQualityResponse["data_gaps"]>[number];

type GapDisplayRow = {
  key: string;
  category: string;
  description: string;
  affectedCount?: number;
  priority?: string;
  impact?: string;
  resolution?: string;
  source: "data-quality" | "data-gaps";
};

type OverallAction = NonNullable<GnOverview["actions"]>[number];

type HeroActionView = {
  priorityLabel: string;
  title: string;
  description: string;
  linkLabel?: string;
  target?: string;
};

type OverallHeroView = {
  statusLabel: string;
  statusNote: string;
  fact: string;
  suggestion: string;
  actions: HeroActionView[];
};

function humanizeBackendText(text?: string): string {
  if (!text) return "";

  return text
    .replace(/重点复核记录/g, "需人工复核的监测记录")
    .replace(/重点复核/g, "需人工复核")
    .replace(/unknown 数据/g, "无法自动判断的数据")
    .replace(/unknown/g, "无法自动判断")
    .replace(/人工核对/g, "人工复核")
    .replace(/重点超标记录/g, "疑似超限数据");
}

function normalizeOverallStatus(raw?: string): { label: string; note: string } {
  const value = raw || "";

  if (value.includes("重点复核") || value.includes("复核")) {
    return {
      label: "需人工确认",
      note: "当前不是直接判定为严重风险，而是存在需要人工复核的数据。",
    };
  }

  if (value.includes("严重")) {
    return {
      label: "严重",
      note: "存在较高风险，应立即核查并处理。",
    };
  }

  if (value.includes("预警") || value.includes("报警") || value.includes("异常")) {
    return {
      label: "预警",
      note: "存在异常或超限信号，应优先核查。",
    };
  }

  if (value.includes("关注")) {
    return {
      label: "关注",
      note: "存在需要持续观察或复核的情况。",
    };
  }

  if (value.includes("正常")) {
    return {
      label: "正常",
      note: "当前未发现明显异常。",
    };
  }

  return {
    label: value || "未判定",
    note: "系统暂未形成明确风险判断。",
  };
}

function isDuplicatedRecommendation(fact: string, suggestion: string): boolean {
  if (!fact || !suggestion) return false;

  const normalizedFact = fact.replace(/[，。,.]/g, "");
  const normalizedSuggestion = suggestion.replace(/[，。,.]/g, "");

  return (
    normalizedFact.includes(normalizedSuggestion) ||
    normalizedSuggestion.includes(normalizedFact) ||
    /存在\s*\d+\s*条/.test(normalizedFact) && /存在\s*\d+\s*条/.test(normalizedSuggestion)
  );
}

function normalizeRouteLabel(target?: string): string | undefined {
  if (!target) return undefined;

  if (target.includes("monitoring-alerts")) return "查看待复核清单";
  if (target.includes("system-status")) return "查看数据缺口";
  if (target.includes("manual-review")) return "查看复核记录";
  if (target.includes("data-gaps")) return "查看数据缺口";

  return "查看详情";
}

function normalizePriority(priority?: string): string {
  if (!priority) return "建议";

  if (priority.includes("高")) return "高优先级";
  if (priority.includes("中")) return "中优先级";
  if (priority.includes("低")) return "低优先级";

  return priority;
}

function normalizeHeroAction(action: OverallAction): HeroActionView {
  const raw = action.action || "";
  const text = humanizeBackendText(raw);

  if (raw.includes("人工复核") || raw.includes("超标") || raw.includes("超限")) {
    return {
      priorityLabel: normalizePriority(action.priority),
      title: "复核疑似超限数据",
      description: "确认这些数据是否需要形成正式预警，避免把待确认数据误读成已确认风险。",
      target: action.target,
      linkLabel: normalizeRouteLabel(action.target),
    };
  }

  if (raw.includes("设计限值") || raw.includes("unknown") || raw.includes("未知")) {
    return {
      priorityLabel: normalizePriority(action.priority),
      title: "补充缺失限值或确认无法判断的数据",
      description: "部分数据因缺少设计限值或状态不明确，系统无法自动判断是否异常。",
      target: action.target,
      linkLabel: normalizeRouteLabel(action.target),
    };
  }

  return {
    priorityLabel: normalizePriority(action.priority),
    title: text || "处理待确认事项",
    description: action.target ? "请进入对应清单完成确认或补充。" : "请根据现场情况完成核查。",
    target: action.target,
    linkLabel: normalizeRouteLabel(action.target),
  };
}

function buildOverallHeroView(
  overview: GnOverview | null,
  briefing: GnDailyBriefing | null,
  unknownCount: number,
): OverallHeroView {
  const status = normalizeOverallStatus(overview?.overall_level_cn || overview?.overall_level);

  const rawFact = humanizeBackendText(overview?.headline);
  const fact =
    rawFact ||
    (unknownCount > 0
      ? `今日有 ${unknownCount} 条监测数据需要人工确认。`
      : "今日暂无明确待复核事项。");

  const rawSuggestion = humanizeBackendText(briefing?.recommendation);
  const suggestion =
    rawSuggestion && !isDuplicatedRecommendation(fact, rawSuggestion)
      ? rawSuggestion
      : "建议先处理疑似超限项，再处理缺失限值或无法自动判断的数据。";

  return {
    statusLabel: status.label,
    statusNote: status.note,
    fact,
    suggestion,
    actions: (overview?.actions ?? []).slice(0, 3).map(normalizeHeroAction),
  };
}

function pickCard(overview: GnOverview | null, keywords: string[], fallback = 0): number {
  const cards = overview?.cards ?? [];
  const hit = cards.find((c) => keywords.some((k) => c.name?.includes(k)));
  return hit?.value ?? fallback;
}

function formatNum(v: number | null | undefined, digits = 1): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "-";
  return v.toFixed(digits);
}

function riskColor(level?: string): string {
  const value = level ?? "";

  if (["严重", "critical", "severe", "高"].some((x) => value.includes(x))) {
    return "#ef4444";
  }

  if (["预警", "异常", "warning", "alarm"].some((x) => value.includes(x))) {
    return "#f97316";
  }

  if (["关注", "中", "medium"].some((x) => value.includes(x))) {
    return "#eab308";
  }

  if (["正常", "低", "normal", "ok"].some((x) => value.includes(x))) {
    return "#22c55e";
  }

  return "#64748b";
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

function riskText(score: number): Priority {
  if (score >= 80) return "高";
  if (score >= 30) return "中";
  return "低";
}

function normalizeQualityGap(g: DataQualityGapItem, index: number): GapDisplayRow {
  return {
    key: `quality-${index}-${g.category || "gap"}`,
    category: g.category || "数据质量问题",
    description: g.description || "-",
    affectedCount: g.affected_count,
    source: "data-quality",
  };
}

function normalizeDataGap(g: GnDataGap, index: number): GapDisplayRow {
  return {
    key: `gap-${g.id || index}-${g.title || "gap"}`,
    category: g.title || "数据缺口",
    description: g.description || g.impact || "-",
    priority: g.priority,
    impact: g.impact,
    resolution: g.resolution,
    source: "data-gaps",
  };
}

function warningFromWorsening(w: GnEarlyWarningItem): WarningRow {
  return {
    key: `worsening-${w.point_code || "unknown"}-${w.monitoring_item || "item"}`,
    priority: "高",
    source: "恶化加快",
    pointCode: w.point_code,
    item: w.monitoring_item,
    side: w.side,
    part: w.part,
    value: `日变化 ${formatNum(w.daily_chg, 2)}`,
    action: "纳入重点观察，必要时派单复核",
  };
}

function warningFromApproaching(w: GnEarlyWarningItem): WarningRow {
  const ratio = w.ratio ?? 0;

  return {
    key: `approaching-${w.point_code || "unknown"}-${w.monitoring_item || "item"}`,
    priority: ratio >= 0.9 ? "高" : "中",
    source: "逼近阈值",
    pointCode: w.point_code,
    item: w.monitoring_item,
    side: w.side,
    part: w.part,
    value: `阈值比 ${formatNum(ratio * 100, 0)}%`,
    action: "关注阈值逼近，优先核查趋势是否持续",
  };
}

function warningFromAnomaly(a: GnAnomalyItem): WarningRow {
  return {
    key: `anomaly-${a.point_code || "unknown"}-${a.monitoring_item || "item"}`,
    priority: Math.abs(a.z_score ?? 0) >= 4 ? "高" : "中",
    source: "统计异常",
    pointCode: a.point_code,
    item: a.monitoring_item,
    side: a.side,
    part: a.part,
    value: `Z=${formatNum(a.z_score, 1)}`,
    action: "核查是否为真实异常或数据质量问题",
  };
}

function warningFromAlert(a: GnAlert, index: number): WarningRow {
  const ratio =
    typeof a.exceed_ratio === "number"
      ? a.exceed_ratio
      : a.design_limit
        ? Math.abs((a.cumulative_change ?? 0) / a.design_limit)
        : 0;

  return {
    key: `alert-${index}-${a.point_code || "unknown"}-${a.monitoring_item || "item"}`,
    priority: ratio >= 1.5 ? "高" : "中",
    source: "超设计限值",
    pointCode: a.point_code,
    item: a.monitoring_item,
    side: a.side,
    part: a.part,
    value: `超限 ${formatNum(ratio, 2)}x`,
    action: "进入人工复核清单，确认是否形成报警",
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

  const hero = useMemo(
    () => buildOverallHeroView(overview, briefing, unknownCount),
    [overview, briefing, unknownCount],
  );

  const warningRows = useMemo<WarningRow[]>(() => {
    const rows: WarningRow[] = [];

    for (const w of earlyWarning?.top_worsening ?? []) {
      rows.push(warningFromWorsening(w));
    }

    for (const w of earlyWarning?.top_approaching ?? []) {
      rows.push(warningFromApproaching(w));
    }

    for (const a of (anomaly?.items ?? []).filter((x) => x.is_anomaly)) {
      rows.push(warningFromAnomaly(a));
    }

    alerts.slice(0, 30).forEach((a, index) => {
      rows.push(warningFromAlert(a, index));
    });

    const uniq = new Map<string, WarningRow>();

    for (const row of rows) {
      const key = `${row.source}-${row.pointCode ?? "unknown"}-${row.item ?? "item"}`;
      if (!uniq.has(key)) uniq.set(key, row);
    }

    return Array.from(uniq.values()).slice(0, 12);
  }, [earlyWarning, anomaly, alerts]);

  const zoneRows = useMemo(() => {
    return [...(heatmap?.items ?? [])]
      .sort((a, b) => zoneScore(b) - zoneScore(a))
      .slice(0, 12);
  }, [heatmap]);

  const riskTypeRows = useMemo(() => {
    return [...items]
      .map((i) => ({
        ...i,
        riskScore: itemRiskScore(i),
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);
  }, [items]);

  const gapRows = useMemo<GapDisplayRow[]>(() => {
    const qualityRows = (dataQuality?.data_gaps ?? []).map(normalizeQualityGap);
    const dataGapRows = (dataGaps?.gaps ?? []).map(normalizeDataGap);

    return [...qualityRows, ...dataGapRows].slice(0, 8);
  }, [dataQuality, dataGaps]);

  const criticalFindings = overview?.priority_findings ?? [];
  const anomalyCount = anomaly?.items?.filter((x) => x.is_anomaly).length ?? 0;
  const reviewedRecordCount = manualReviews?.reviews?.length ?? 0;

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
            面向整体监测、分区预警、风险类型分布与数据质量闭环；单点趋势与证据链请进入单点分析页。
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

          <span style={{ ...styles.statusPill, borderColor: dbDown ? "#ef4444" : "#22c55e" }}>
            {dbDown ? "数据库异常" : "系统正常"}
          </span>
        </div>
      </header>

      {error && <div style={styles.error}>{error}</div>}
      {dbDown && <div style={styles.error}>数据库连接异常，当前研判结果可能不完整。</div>}

      <section style={styles.heroGrid}>
        <div style={styles.conclusionCard}>
          <div style={styles.kicker}>当前处理状态</div>

          <div
            style={{
              ...styles.level,
              color: riskColor(hero.statusLabel),
            }}
          >
            {hero.statusLabel}
          </div>

          <div style={styles.statusNote}>{hero.statusNote}</div>

          <div style={styles.headline}>{hero.fact}</div>

          <div style={styles.recommendation}>
            <b>建议：</b>
            {hero.suggestion}
          </div>

          {hero.actions.length > 0 && (
            <div style={styles.actionList}>
              {hero.actions.map((a, idx) => (
                <div key={`${a.title}-${idx}`} style={styles.actionItemV2}>
                  <span
                    style={{
                      ...styles.actionPriority,
                      background: a.priorityLabel.includes("高") ? "#7f1d1d" : "#1e3a8a",
                    }}
                  >
                    {a.priorityLabel}
                  </span>

                  <div style={styles.actionContent}>
                    <b>{a.title}</b>
                    <div style={styles.muted}>{a.description}</div>

                    {a.target && a.linkLabel && (
                      <a href={a.target} style={styles.actionLink}>
                        {a.linkLabel}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.metricGrid}>
          <MetricCard title="超限计算值" value={exceedCount} unit="条" intent="danger" />
          <MetricCard title="待确认事项" value={unknownCount} unit="条" intent="warning" />
          <MetricCard title="监测点位" value={pointCount} unit="个" />
          <MetricCard title="累计读数" value={readingCount} unit="条" />
        </div>
      </section>

      <section style={styles.twoCol}>
        <Panel
          title="重点预警队列"
          desc="跨全区汇总恶化、逼近阈值、统计异常与超设计限值，不展开单点详情。"
        >
          {warningRows.length === 0 ? (
            <Empty text="暂无重点预警项" />
          ) : (
            <div style={styles.warningList}>
              {warningRows.map((w) => (
                <div key={w.key} style={styles.warningRow}>
                  <div style={styles.warningTop}>
                    <span
                      style={{
                        ...styles.priorityBadge,
                        background: w.priority === "高" ? "#7f1d1d" : "#713f12",
                      }}
                    >
                      {w.priority}优先级
                    </span>

                    <span style={styles.sourceBadge}>{w.source}</span>

                    {w.value && <span style={styles.valueBadge}>{w.value}</span>}
                  </div>

                  <div style={styles.warningTitle}>
                    {w.item || "未知监测项"}
                    {w.side || w.part ? (
                      <span style={styles.muted}> · {w.side || "-"} / {w.part || "-"}</span>
                    ) : null}
                  </div>

                  <div style={styles.warningMeta}>
                    {w.pointCode && (
                      <a
                        style={styles.link}
                        href={`/md/nycj/area1-point-analysis?point_code=${encodeURIComponent(
                          w.pointCode,
                        )}`}
                      >
                        {w.pointCode}
                      </a>
                    )}

                    <span>{w.action}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="待处理事项" desc="把“待确认”拆成可处理任务，避免用户只看到一个大数字。">
          <div style={styles.todoGrid}>
            <TodoItem label="待确认事项" value={unknownCount} desc="需要人工确认或系统补充条件后闭环" />

            <TodoItem
              label="已复核记录"
              value={reviewedRecordCount}
              desc="人工复核表中已有的处理记录"
            />

            <TodoItem
              label="数据质量问题"
              value={dataQuality?.data_gaps?.length ?? 0}
              desc="阈值、证据、解析或状态原因待处理"
            />

            <TodoItem
              label="数据缺口"
              value={dataGaps?.summary?.total_gaps ?? dataGaps?.gaps?.length ?? 0}
              desc="影响整体研判可信度"
            />

            <TodoItem
              label="缺坐标测点"
              value={missingCoords?.missing_coords ?? 0}
              desc="影响分区热力与空间定位"
            />
          </div>
        </Panel>
      </section>

      <Panel
        title="分区风险热力"
        desc="回答“风险集中在哪个区域”。按严重数、超限数与平均超限比综合排序。"
      >
        {zoneRows.length === 0 ? (
          <Empty text="暂无分区热力数据" />
        ) : (
          <div style={styles.zoneGrid}>
            {zoneRows.map((z, idx) => (
              <div key={`${z.side || "side"}-${z.part || "part"}-${idx}`} style={styles.zoneCard}>
                <div style={styles.zoneHeader}>
                  <b>
                    {z.side || "未知侧"} · {z.part || "未知部位"}
                  </b>

                  <span style={{ ...styles.zoneStatus, color: riskColor(z.zone_status) }}>
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
                      width: `${Math.min(100, zoneScore(z) * 2)}%`,
                      background: riskColor(z.zone_status),
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="风险类型分布"
        desc="把原来的“监测项目分布”改成风险排行，按超限、待确认与点位规模综合排序。"
      >
        {riskTypeRows.length === 0 ? (
          <Empty text="暂无监测项目数据" />
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>监测类型</th>
                  <th style={styles.th}>监测对象</th>
                  <th style={styles.th}>点位</th>
                  <th style={styles.th}>正常</th>
                  <th style={styles.th}>超限</th>
                  <th style={styles.th}>待确认</th>
                  <th style={styles.th}>风险判断</th>
                </tr>
              </thead>

              <tbody>
                {riskTypeRows.map((i, idx) => {
                  const risk = riskText(i.riskScore);

                  return (
                    <tr key={`${i.monitoring_item || "item"}-${i.monitoring_object || "object"}-${idx}`}>
                      <td style={styles.td}>{i.monitoring_item || "-"}</td>
                      <td style={styles.td}>{i.monitoring_object || "-"}</td>
                      <td style={styles.td}>{i.point_count ?? 0}</td>
                      <td style={styles.td}>{i.normal_count ?? 0}</td>
                      <td style={{ ...styles.td, color: "#fb923c" }}>{i.exceed_count ?? 0}</td>
                      <td style={{ ...styles.td, color: "#facc15" }}>{i.unknown_count ?? 0}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.riskBadge, color: riskColor(risk) }}>{risk}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <section style={styles.twoCol}>
        <Panel title="数据质量与缺口" desc="解释待确认和不确定性：哪些是真风险，哪些是数据治理问题。">
          {gapRows.map((g) => (
            <div key={g.key} style={styles.gapItem}>
              <div>
                <b>{g.category}</b>
                <div style={styles.muted}>{g.description}</div>

                {(g.priority || g.resolution) && (
                  <div style={styles.muted}>
                    {g.priority ? `优先级：${g.priority}` : ""}
                    {g.priority && g.resolution ? " / " : ""}
                    {g.resolution ? `建议：${g.resolution}` : ""}
                  </div>
                )}
              </div>

              {g.affectedCount != null && (
                <span style={styles.valueBadge}>{g.affectedCount} 项</span>
              )}
            </div>
          ))}

          {gapRows.length === 0 && <Empty text="暂无数据质量缺口" />}
        </Panel>

        <Panel title="重点发现" desc="来自 overall 的优先发现，只保留整体结论，不展开单点诊断。">
          {criticalFindings.length === 0 ? (
            <Empty text="暂无重点发现" />
          ) : (
            criticalFindings.slice(0, 6).map((f, idx) => (
              <div key={`${f.title}-${idx}`} style={styles.findingItem}>
                <span
                  style={{
                    ...styles.priorityBadge,
                    background: f.level === "critical" ? "#7f1d1d" : "#1e3a8a",
                  }}
                >
                  {f.level === "critical" ? "重点" : "关注"}
                </span>

                <div>
                  <b>{f.title}</b>
                  <div style={styles.muted}>{f.detail}</div>
                </div>
              </div>
            ))
          )}
        </Panel>
      </section>

      <section style={styles.twoCol}>
        <Panel title="统计异常概览" desc="只做整体异常概览；单点原因请跳转单点分析。">
          <div style={styles.proGrid}>
            <MetricMini label="异常点数量" value={anomalyCount} />
            <MetricMini label="Sigma 阈值" value={anomaly?.sigma_threshold ?? "-"} />
          </div>

          {(anomaly?.items ?? [])
            .filter((x) => x.is_anomaly)
            .slice(0, 6)
            .map((x, idx) => (
              <div key={`${x.point_code || "point"}-${x.monitoring_item || "item"}-${idx}`} style={styles.compactRow}>
                <span>{x.monitoring_item || "-"}</span>
                <span style={styles.muted}>
                  {x.side || "-"} / {x.part || "-"}
                </span>
                <span style={styles.valueBadge}>Z={formatNum(x.z_score, 1)}</span>
              </div>
            ))}

          {anomalyCount === 0 && <Empty text="暂无统计异常点" />}
        </Panel>

        <Panel title="测项关联分析" desc="仅展示强/中等相关，用于提示系统性联动风险。">
          {(crossCorr?.correlations ?? [])
            .filter((c) => ["强", "中等"].includes(c.strength || ""))
            .slice(0, 6)
            .map((c, idx) => (
              <div key={`${c.item_a || "a"}-${c.item_b || "b"}-${idx}`} style={styles.corrRow}>
                <div>
                  <b>
                    {c.item_a || "-"} ↔ {c.item_b || "-"}
                  </b>

                  <div style={styles.muted}>
                    {c.description || `${c.strength || ""}${c.direction || ""}相关`}
                  </div>
                </div>

                <span style={styles.valueBadge}>r={formatNum(c.coefficient, 2)}</span>
              </div>
            ))}

          {(crossCorr?.correlations ?? []).length === 0 && <Empty text="暂无相关性分析结果" />}
        </Panel>
      </section>

      <footer style={styles.footer}>
        当前页面定位：整体风险研判与预警。单点趋势、单点诊断、单点证据链统一跳转至「1工区单点分析」。
      </footer>
    </div>
  );
}

function MetricCard({
  title,
  value,
  unit,
  intent,
}: {
  title: string;
  value: number | string;
  unit?: string;
  intent?: "danger" | "warning";
}) {
  const color = intent === "danger" ? "#fb923c" : intent === "warning" ? "#facc15" : "#38bdf8";

  return (
    <div style={styles.metricCard}>
      <div style={styles.metricTitle}>{title}</div>
      <div style={{ ...styles.metricValue, color }}>
        {value}
        {unit && <span style={styles.metricUnit}> {unit}</span>}
      </div>
    </div>
  );
}

function MetricMini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={styles.metricMini}>
      <div style={styles.metricTitle}>{label}</div>
      <div style={styles.metricMiniValue}>{value}</div>
    </div>
  );
}

function TodoItem({ label, value, desc }: { label: string; value: number | string; desc: string }) {
  return (
    <div style={styles.todoItem}>
      <div style={styles.todoValue}>{value}</div>

      <div>
        <b>{label}</b>
        <div style={styles.muted}>{desc}</div>
      </div>
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

function Empty({ text }: { text: string }) {
  return <div style={styles.empty}>{text}</div>;
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#050816",
    color: "#dbeafe",
    padding: 24,
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 20,
  },
  h1: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#94a3b8",
    fontSize: 14,
  },
  toolbar: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },
  input: {
    background: "#0f172a",
    color: "#dbeafe",
    border: "1px solid #1e293b",
    borderRadius: 8,
    padding: "8px 10px",
  },
  button: {
    background: "#2563eb",
    color: "#fff",
    border: 0,
    borderRadius: 8,
    padding: "9px 14px",
    cursor: "pointer",
  },
  statusPill: {
    border: "1px solid",
    borderRadius: 999,
    padding: "7px 10px",
    color: "#cbd5e1",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  error: {
    background: "#450a0a",
    border: "1px solid #7f1d1d",
    color: "#fecaca",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  loading: {
    padding: 40,
    textAlign: "center",
    color: "#93c5fd",
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr",
    gap: 16,
    marginBottom: 16,
  },
  conclusionCard: {
    background: "linear-gradient(135deg, #0f172a, #111827)",
    border: "1px solid #1e293b",
    borderRadius: 16,
    padding: 20,
  },
  kicker: {
    color: "#93c5fd",
    fontSize: 13,
    marginBottom: 8,
  },
  level: {
    fontSize: 40,
    fontWeight: 900,
    marginBottom: 10,
  },
  headline: {
    fontSize: 17,
    lineHeight: 1.7,
    color: "#e2e8f0",
    marginBottom: 14,
  },
  recommendation: {
    background: "#0b1220",
    border: "1px solid #1e293b",
    borderRadius: 12,
    padding: 12,
    lineHeight: 1.6,
    color: "#cbd5e1",
  },
  actionList: {
    marginTop: 14,
    display: "grid",
    gap: 8,
  },
  actionItem: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    color: "#cbd5e1",
  },
  statusNote: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 1.6,
    marginBottom: 12,
  },
  actionItemV2: {
    display: "grid",
    gridTemplateColumns: "82px 1fr",
    gap: 10,
    alignItems: "flex-start",
    background: "#0b1220",
    border: "1px solid #1e293b",
    borderRadius: 12,
    padding: 12,
  },
  actionContent: {
    display: "grid",
    gap: 4,
  },
  actionLink: {
    color: "#38bdf8",
    textDecoration: "none",
    fontSize: 13,
    marginTop: 4,
  },
  actionPriority: {
    background: "#1e3a8a",
    color: "#bfdbfe",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 12,
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  metricCard: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 16,
    padding: 16,
  },
  metricTitle: {
    color: "#94a3b8",
    fontSize: 13,
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 30,
    fontWeight: 800,
  },
  metricUnit: {
    fontSize: 14,
    color: "#94a3b8",
    fontWeight: 500,
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 16,
  },
  panel: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  panelHeader: {
    marginBottom: 14,
  },
  h2: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
  },
  panelDesc: {
    margin: "6px 0 0",
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 1.6,
  },
  warningList: {
    display: "grid",
    gap: 10,
  },
  warningRow: {
    background: "#0b1220",
    border: "1px solid #1e293b",
    borderRadius: 12,
    padding: 12,
  },
  warningTop: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 8,
    flexWrap: "wrap",
  },
  priorityBadge: {
    color: "#fff",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  sourceBadge: {
    background: "#1e293b",
    color: "#cbd5e1",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  valueBadge: {
    background: "#172554",
    color: "#bfdbfe",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  warningTitle: {
    fontWeight: 700,
    marginBottom: 6,
  },
  warningMeta: {
    display: "flex",
    gap: 10,
    color: "#94a3b8",
    fontSize: 13,
  },
  link: {
    color: "#38bdf8",
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  muted: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 1.6,
  },
  todoGrid: {
    display: "grid",
    gap: 10,
  },
  todoItem: {
    display: "grid",
    gridTemplateColumns: "72px 1fr",
    gap: 12,
    alignItems: "center",
    background: "#0b1220",
    border: "1px solid #1e293b",
    borderRadius: 12,
    padding: 12,
  },
  todoValue: {
    fontSize: 24,
    fontWeight: 900,
    color: "#facc15",
  },
  zoneGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
  },
  zoneCard: {
    background: "#0b1220",
    border: "1px solid #1e293b",
    borderRadius: 12,
    padding: 12,
  },
  zoneHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  zoneStatus: {
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  zoneStats: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 6,
    color: "#94a3b8",
    fontSize: 13,
    marginBottom: 10,
  },
  barTrack: {
    height: 7,
    background: "#1e293b",
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
    fontSize: 13,
  },
  th: {
    textAlign: "left",
    color: "#94a3b8",
    borderBottom: "1px solid #1e293b",
    padding: "10px 8px",
    fontWeight: 600,
  },
  td: {
    borderBottom: "1px solid #1e293b",
    padding: "10px 8px",
    color: "#dbeafe",
  },
  riskBadge: {
    fontWeight: 800,
  },
  gapItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    background: "#0b1220",
    border: "1px solid #1e293b",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  findingItem: {
    display: "grid",
    gridTemplateColumns: "56px 1fr",
    gap: 10,
    background: "#0b1220",
    border: "1px solid #1e293b",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  proGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginBottom: 12,
  },
  metricMini: {
    background: "#0b1220",
    border: "1px solid #1e293b",
    borderRadius: 12,
    padding: 12,
  },
  metricMiniValue: {
    fontSize: 22,
    fontWeight: 900,
    color: "#38bdf8",
  },
  compactRow: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr auto",
    gap: 10,
    alignItems: "center",
    padding: "9px 0",
    borderBottom: "1px solid #1e293b",
  },
  corrRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    background: "#0b1220",
    border: "1px solid #1e293b",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  empty: {
    color: "#64748b",
    background: "#0b1220",
    border: "1px dashed #334155",
    borderRadius: 12,
    padding: 16,
    textAlign: "center",
  },
  footer: {
    color: "#64748b",
    fontSize: 13,
    padding: "12px 0 4px",
  },
};