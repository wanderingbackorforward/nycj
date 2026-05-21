import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useECharts } from "../components/charts/useECharts";
import {
  fetchGnMonitoringPoints,
  fetchGnPointAnalysis,
  fetchGnDiagnose,
} from "../api/area1";

import type {
  GnPoint,
  GnPointAnalysisResponse,
  GnDiagnoseResponse,
} from "../api/area1";

type AnyRecord = Record<string, any>;

type NormalizedTrend = {
  date: string;
  currentValue: number | null;
  cumulativeChange: number | null;
  dailyChange: number | null;
  source?: string;
};

type ReviewLevel = "high" | "medium" | "low" | "unknown";

type ReviewView = {
  level: ReviewLevel;
  statusLabel: string;
  title: string;
  conclusion: string;
  primaryAction: string;
  ratio: number | null;
  latestCumulative: number | null;
  latestCurrent: number | null;
  latestDaily: number | null;
  maxDaily: number | null;
  jumpShare: number | null;
  findings: Array<{
    title: string;
    text: string;
    tone: "danger" | "warning" | "info";
  }>;
  actions: string[];
};

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function fmt(v: unknown, digits = 2): string {
  const n = asNumber(v);
  if (n == null) return "-";
  return n.toFixed(digits);
}

function fmtMaybeUnit(v: unknown, unit?: string, digits = 2): string {
  const n = asNumber(v);
  if (n == null) return "-";
  return `${n.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

function getDateText(row: AnyRecord): string {
  const d = row.date || row.measured_at || row.created_at || "";
  if (typeof d !== "string") return "";
  return d.length > 10 ? d.substring(0, 10) : d;
}

function normalizeTrend(raw: unknown): NormalizedTrend[] {
  const rows = Array.isArray(raw) ? raw : [];

  return rows
    .map((r: AnyRecord) => ({
      date: getDateText(r),
      currentValue: asNumber(r.current_value) ?? asNumber(r.value),
      cumulativeChange: asNumber(r.cumulative_change),
      dailyChange: asNumber(r.daily_change),
      source: r.source || r.source_file || r.file_name,
    }))
    .filter((r) => r.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function maxAbs(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), nums[0]);
}

function rangeAbs(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length < 2) return null;
  return Math.max(...nums) - Math.min(...nums);
}

function levelColor(level: ReviewLevel): string {
  if (level === "high") return "#e65100";
  if (level === "medium") return "#d4a050";
  if (level === "low") return "#2e7d32";
  return "#00d4ff";
}

function toneColor(tone: "danger" | "warning" | "info"): string {
  if (tone === "danger") return "#e65100";
  if (tone === "warning") return "#d4a050";
  return "#00d4ff";
}

function buildReviewView(params: {
  point: AnyRecord;
  trend: NormalizedTrend[];
  diagnosis: GnDiagnoseResponse | null;
}): ReviewView {
  const { point, trend, diagnosis } = params;
  const unit = point.unit || "mm";
  const latest = trend[trend.length - 1];

  const latestCumulative = latest?.cumulativeChange ?? null;
  const latestCurrent = latest?.currentValue ?? null;
  const latestDaily = latest?.dailyChange ?? null;
  const designLimit = asNumber(point.design_limit);

  const ratio =
    latestCumulative != null && designLimit && designLimit !== 0
      ? Math.abs(latestCumulative / designLimit)
      : null;

  const maxDaily = maxAbs(trend.map((r) => r.dailyChange));
  const totalRange = rangeAbs(trend.map((r) => r.cumulativeChange));
  const jumpShare =
    maxDaily != null && totalRange != null && totalRange > 0
      ? Math.abs(maxDaily) / totalRange
      : null;

  const reviewCount =
    Array.isArray((diagnosis as AnyRecord | null)?.readings)
      ? ((diagnosis as AnyRecord).readings || []).filter((r: AnyRecord) =>
          String(r.review_level || r.status || "").includes("review") ||
          String(r.review_level || r.status || "").includes("复核"),
        ).length
      : 0;

  let level: ReviewLevel = "unknown";
  let statusLabel = "未判定";
  let title = "该点暂无明确复核结论";
  let conclusion = "当前趋势数据不足或缺少设计限值，系统暂不能形成明确判断。";
  let primaryAction = "补齐趋势数据或设计限值后再判断。";

  if (ratio != null && ratio >= 1) {
    level = "high";
    statusLabel = "疑似超设计限值";
    title = "该点累计变化已超过设计限值";
    conclusion = `累计变化 ${fmtMaybeUnit(latestCumulative, unit, 2)}，约为设计限值 ${fmtMaybeUnit(
      designLimit,
      unit,
      2,
    )} 的 ${ratio.toFixed(2)} 倍。该结果不等同于正式报警，需先做人工复核。`;
    primaryAction = "优先核对原始记录，确认单位、正负号、小数点和录入口径。";
  } else if (ratio != null && ratio >= 0.7) {
    level = "medium";
    statusLabel = "接近设计限值";
    title = "该点累计变化接近设计限值";
    conclusion = `累计变化约为设计限值的 ${ratio.toFixed(2)} 倍，需要持续观察变化趋势。`;
    primaryAction = "关注后续变化，必要时核对最近几日原始记录。";
  } else if (ratio != null) {
    level = "low";
    statusLabel = "未超设计限值";
    title = "该点暂未超过设计限值";
    conclusion = `累计变化约为设计限值的 ${ratio.toFixed(2)} 倍，当前未达到疑似超限条件。`;
    primaryAction = "保持日常监测。";
  }

  const findings: ReviewView["findings"] = [];

  if (ratio != null && designLimit != null && latestCumulative != null) {
    findings.push({
      title: ratio >= 1 ? "超限依据" : "限值对比",
      text:
        ratio >= 1
          ? `累计变化 ${fmtMaybeUnit(latestCumulative, unit, 2)} 已超过设计限值 ${fmtMaybeUnit(
              designLimit,
              unit,
              2,
            )}，超限倍数约 ${ratio.toFixed(2)}x。`
          : `累计变化 ${fmtMaybeUnit(latestCumulative, unit, 2)}，设计限值 ${fmtMaybeUnit(
              designLimit,
              unit,
              2,
            )}，当前比例约 ${ratio.toFixed(2)}x。`,
      tone: ratio >= 1 ? "danger" : ratio >= 0.7 ? "warning" : "info",
    });
  } else {
    findings.push({
      title: "限值依据",
      text: "当前缺少累计变化或设计限值，无法完成限值对比。",
      tone: "info",
    });
  }

  if (maxDaily != null) {
    const dayRatio = designLimit ? Math.abs(maxDaily / designLimit) : null;
    findings.push({
      title: "趋势状态",
      text:
        dayRatio != null
          ? `最大单日变化 ${fmtMaybeUnit(maxDaily, unit, 2)}，约为设计限值的 ${(
              dayRatio * 100
            ).toFixed(0)}%。如果该变化集中出现在少数日期，应优先核对对应日期附近的原始记录。`
          : `最大单日变化 ${fmtMaybeUnit(maxDaily, unit, 2)}。建议结合原始记录判断是否为真实变化。`,
      tone: dayRatio != null && dayRatio >= 0.15 ? "warning" : "info",
    });
  }

  if (jumpShare != null && jumpShare >= 0.5) {
    findings.push({
      title: "突变特征",
      text: `大部分累计变化集中发生在少数日期，最大单日变化约占总变化幅度的 ${(
        jumpShare * 100
      ).toFixed(0)}%。建议优先核对跳变日前后的原始记录。`,
      tone: "warning",
    });
  }

  if (reviewCount > 0) {
    findings.push({
      title: "复核状态",
      text: `系统已识别到 ${reviewCount} 条需复核记录。该数量代表需要人工确认的数据，不等同于已确认风险。`,
      tone: "info",
    });
  } else if ((diagnosis as AnyRecord | null)?.reading_count) {
    findings.push({
      title: "复核状态",
      text: `该点共有 ${(diagnosis as AnyRecord).reading_count} 条诊断读数，建议结合最近数据和证据链完成复核。`,
      tone: "info",
    });
  }

  return {
    level,
    statusLabel,
    title,
    conclusion,
    primaryAction,
    ratio,
    latestCumulative,
    latestCurrent,
    latestDaily,
    maxDaily,
    jumpShare,
    findings,
    actions: [
      "核对原始 Excel 中该点的小数点、正负号、单位和日期口径。",
      "若排除录入问题，联系现场监测人员确认是否为真实变化。",
      "若确认真实异常，在人工复核流程中提交结论并持续跟踪后续读数。",
    ],
  };
}

export default function Area1PointAnalysis() {
  const trendRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [points, setPoints] = useState<GnPoint[]>([]);
  const [selectedPoint, setSelectedPoint] = useState("");
  const [analysis, setAnalysis] = useState<GnPointAnalysisResponse | null>(null);
  const [diagnosis, setDiagnosis] = useState<GnDiagnoseResponse | null>(null);

  const [analysisLoading, setAnalysisLoading] = useState(false);

  const loadPoints = useCallback(async () => {
    setLoading(true);
    setError("");

    const res = await fetchGnMonitoringPoints();

    if (res.ok && res.data) {
      const pts = res.data.points || [];
      const queryPoint = new URLSearchParams(window.location.search).get("point_code") || "";
      const defaultPoint =
        queryPoint && pts.some((p) => p.point_code === queryPoint)
          ? queryPoint
          : pts[0]?.point_code || "";

      setPoints(pts);
      setSelectedPoint(defaultPoint);
    } else {
      setError("监测点列表获取失败");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPoints();
  }, [loadPoints]);

  const loadPoint = useCallback(async (code: string) => {
    if (!code) return;

    setAnalysisLoading(true);
    setAnalysis(null);
    setDiagnosis(null);


    const [analysisRes, diagRes] = await Promise.all([
      fetchGnPointAnalysis(code),
      fetchGnDiagnose(code),
    ]);

    if (analysisRes.ok && analysisRes.data) {
      setAnalysis(analysisRes.data);
    }

    if (diagRes.ok && diagRes.data) {
      setDiagnosis(diagRes.data);
    }

    setAnalysisLoading(false);
  }, []);

  useEffect(() => {
    if (selectedPoint) void loadPoint(selectedPoint);
  }, [selectedPoint, loadPoint]);

  const point = (analysis?.point || {}) as AnyRecord;
  const trend = useMemo(() => normalizeTrend((analysis as AnyRecord | null)?.trend), [analysis]);
  const evidence = ((analysis as AnyRecord | null)?.evidence || []) as AnyRecord[];
  const diagnosisReadings = ((diagnosis as AnyRecord | null)?.readings || []) as AnyRecord[];

  const review = useMemo(
    () =>
      buildReviewView({
        point,
        trend,
        diagnosis,
      }),
    [point, trend, diagnosis],
  );

  const unit = point.unit || "mm";
  const trendCount = trend.length;

  const trendOption = useMemo(() => {
    if (trend.length === 0) return null;

    const dates = trend.map((t) => (t.date.length > 5 ? t.date.substring(5) : t.date));
    const currentVals = trend.map((t) => t.currentValue);
    const cumulativeVals = trend.map((t) => t.cumulativeChange);
    const designLimit = asNumber(point.design_limit);

    const series: any[] = [
      {
        name: "当前值",
        type: "line",
        yAxisIndex: 0,
        data: currentVals,
        smooth: false,
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { width: 2, color: "#00d4ff" },
        itemStyle: { color: "#00d4ff" },
      },
      {
        name: "累计变化",
        type: "line",
        yAxisIndex: 1,
        data: cumulativeVals,
        smooth: false,
        symbol: "diamond",
        symbolSize: 5,
        lineStyle: { width: 2.5, color: "#e65100" },
        itemStyle: { color: "#e65100" },
      },
    ];

    if (designLimit != null) {
      series.push({
        name: "设计限值",
        type: "line",
        yAxisIndex: 1,
        data: Array(cumulativeVals.length).fill(designLimit),
        symbol: "none",
        lineStyle: { type: "dashed", width: 2, color: "#d4a050" },
        itemStyle: { color: "#d4a050" },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: "#d4a050", type: "dashed" },
          label: {
            formatter: `设计限值 ${designLimit}${unit}`,
            color: "#d4a050",
            fontSize: 12,
          },
          data: [{ yAxis: designLimit }],
        },
      });
    }

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15,21,37,0.95)",
        borderColor: "#1a2640",
        textStyle: { color: "#c8d6e5", fontSize: 12 },
      },
      legend: {
        top: 8,
        textStyle: { color: "#98aec9", fontSize: 11 },
      },
      grid: {
        left: 60,
        right: 70,
        top: 48,
        bottom: 42,
      },
      xAxis: {
        type: "category",
        data: dates,
        axisLabel: { color: "#5a6d8a", fontSize: 12, rotate: 30 },
        axisLine: { lineStyle: { color: "#1a2640" } },
      },
      yAxis: [
        {
          type: "value",
          name: "当前值",
          nameTextStyle: { color: "#00d4ff", fontSize: 11 },
          axisLabel: { color: "#00d4ff", fontSize: 12 },
          splitLine: { lineStyle: { color: "#121e36" } },
        },
        {
          type: "value",
          name: "累计变化 / 设计限值",
          nameTextStyle: { color: "#e65100", fontSize: 11 },
          axisLabel: { color: "#e65100", fontSize: 12 },
          splitLine: { show: false },
        },
      ],
      series,
    };
  }, [trend, point.design_limit, unit]);

  useECharts(trendRef, trendOption, trend.length > 0);

  const selectedLabel =
    points.find((p) => p.point_code === selectedPoint)?.monitoring_item || point.monitoring_item || "";

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loading}>正在加载 1工区单点分析...</div>
      </div>
    );
  }

  if (error && points.length === 0) {
    return (
      <div style={styles.page}>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>1工区单点复核工作台</h1>
          <p style={styles.subtitle}>
            用于核对单个测点的累计变化、设计限值、趋势特征和原始证据。
          </p>
        </div>

        <div style={styles.selectorWrap}>
          <span style={styles.selectorLabel}>选择监测点</span>
          <select
            value={selectedPoint}
            onChange={(e) => {
              const code = e.target.value;
              setSelectedPoint(code);
              const url = new URL(window.location.href);
              url.searchParams.set("point_code", code);
              window.history.replaceState(null, "", url.toString());
            }}
            style={styles.select}
          >
            {points.map((p) => (
              <option key={p.point_code} value={p.point_code}>
                {p.point_code}
                {p.monitoring_item ? ` · ${p.monitoring_item}` : ""}
              </option>
            ))}
          </select>
        </div>
      </header>

      {analysisLoading && <div style={styles.notice}>正在加载 {selectedPoint} 的趋势与诊断...</div>}

      <section style={styles.topGrid}>
        <Panel title="单点结论">
          <div style={styles.conclusion}>
            <span
              style={{
                ...styles.statusBadge,
                color: levelColor(review.level),
                borderColor: levelColor(review.level),
              }}
            >
              {review.statusLabel}
            </span>

            <div>
              <div style={styles.conclusionTitle}>{review.title}</div>
              <div style={styles.conclusionText}>{review.conclusion}</div>
            </div>
          </div>

          <div style={styles.actionBox}>
            <b>建议动作：</b>
            {review.primaryAction}
          </div>
        </Panel>

        <div style={styles.kpiGrid}>
          <Kpi title="监测点" value={String(point.point_code || selectedPoint || "-")} />
          <Kpi title="监测项目" value={String(point.monitoring_item || selectedLabel || "-")} />
          <Kpi title="累计变化" value={fmtMaybeUnit(review.latestCumulative, unit, 2)} tone={review.level} />
          <Kpi title="设计限值" value={fmtMaybeUnit(point.design_limit, unit, 2)} />
          <Kpi title="超限倍数" value={review.ratio != null ? `${review.ratio.toFixed(2)}x` : "-"} tone={review.level} />
          <Kpi title="趋势点数" value={`${trendCount}`} />
        </div>
      </section>

      <Panel title="累计变化趋势与设计限值">
        <div style={styles.chartHint}>
          图中“设计限值”与“累计变化”使用同一坐标轴；当前值仅作为辅助参考，不直接与设计限值比较。
        </div>

        <div ref={trendRef} style={styles.chart} />

        {trendCount === 0 && <Empty text="该监测点暂无趋势数据" />}
      </Panel>

      <section style={styles.twoCol}>
        <Panel title="复核依据">
          <div style={styles.findingList}>
            {review.findings.map((f, idx) => (
              <div key={`${f.title}-${idx}`} style={styles.findingItem}>
                <span
                  style={{
                    ...styles.findingIcon,
                    background: toneColor(f.tone),
                  }}
                >
                  {idx + 1}
                </span>

                <div>
                  <div style={styles.findingTitle}>{f.title}</div>
                  <div style={styles.muted}>{f.text}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="处理建议">
          <div style={styles.actionList}>
            {review.actions.map((a, idx) => (
              <div key={a} style={styles.actionItem}>
                <span style={styles.actionIndex}>{idx + 1}</span>
                <span>{a}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <Panel title="数据摘要">
        <div style={styles.summaryGrid}>
          <Summary label="最新当前值" value={fmtMaybeUnit(review.latestCurrent, unit, 2)} />
          <Summary label="最新累计变化" value={fmtMaybeUnit(review.latestCumulative, unit, 2)} />
          <Summary label="最新日变化" value={fmtMaybeUnit(review.latestDaily, unit, 2)} />
          <Summary label="最大日变化" value={fmtMaybeUnit(review.maxDaily, unit, 2)} />
          <Summary
            label="跳变占比"
            value={review.jumpShare != null ? `${(review.jumpShare * 100).toFixed(0)}%` : "-"}
          />
          <Summary
            label="复核等级"
            value={review.statusLabel}
          />
        </div>
      </Panel>

      <details style={styles.details}>
        <summary style={styles.summaryTitle}>原始数据（最近 10 条）</summary>

        {diagnosisReadings.length > 0 ? (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>日期</th>
                  <th style={styles.th}>当前值</th>
                  <th style={styles.th}>累计变化</th>
                  <th style={styles.th}>日变化</th>
                  <th style={styles.th}>来源</th>
                </tr>
              </thead>

              <tbody>
                {diagnosisReadings
                  .slice(-10)
                  .reverse()
                  .map((r: AnyRecord, idx: number) => (
                    <tr key={`${r.date || idx}-${idx}`}>
                      <td style={styles.td}>{r.date || "-"}</td>
                      <td style={styles.td}>{fmtMaybeUnit(r.current_value, unit, 2)}</td>
                      <td style={styles.td}>{fmtMaybeUnit(r.cumulative_change, unit, 2)}</td>
                      <td style={styles.td}>{fmtMaybeUnit(r.daily_change, unit, 2)}</td>
                      <td style={styles.tdMuted}>{r.source || "-"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="暂无原始数据" />
        )}
      </details>

      <details style={styles.details}>
        <summary style={styles.summaryTitle}>关联证据（{evidence.length} 条）</summary>

        {evidence.length > 0 ? (
          <div style={styles.evidenceGrid}>
            {evidence.map((e, idx) => (
              <div key={`${e.file_name || "file"}-${idx}`} style={styles.evidenceCard}>
                <div style={styles.evidenceTitle}>证据 #{idx + 1}</div>
                <div style={styles.evidenceFile}>{String(e.file_name || "-")}</div>
                <div style={styles.muted}>
                  {e.sheet_name ? `工作表：${String(e.sheet_name)}` : ""}
                  {e.row_index != null ? ` 行 ${String(e.row_index)}` : ""}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="暂无关联证据" />
        )}
      </details>
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
  tone,
}: {
  title: string;
  value: React.ReactNode;
  tone?: ReviewLevel;
}) {
  return (
    <div style={styles.kpi}>
      <div style={styles.kpiTitle}>{title}</div>
      <div style={{ ...styles.kpiValue, color: tone ? levelColor(tone) : "#e6f2ff" }}>{value}</div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={styles.summaryBox}>
      <div style={styles.kpiTitle}>{label}</div>
      <div style={styles.summaryValue}>{value}</div>
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
  selectorWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  selectorLabel: {
    color: "#98aec9",
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  select: {
    minWidth: 320,
    background: "#0f1525",
    color: "#c8d6e5",
    border: "1px solid #1a2640",
    borderRadius: 6,
    padding: "8px 10px",
    outline: "none",
  },
  loading: {
    padding: 40,
    textAlign: "center",
    color: "#00d4ff",
  },
  error: {
    background: "#2a0a0a",
    border: "1px solid #e65100",
    color: "#ffb089",
    borderRadius: 8,
    padding: 12,
  },
  notice: {
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 10,
    color: "#00d4ff",
    marginBottom: 14,
    fontSize: 13,
  },
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
  h2: {
    margin: "0 0 12px",
    fontSize: 16,
    color: "#e6f2ff",
    fontWeight: 800,
  },
  conclusion: {
    display: "grid",
    gridTemplateColumns: "120px 1fr",
    gap: 14,
    alignItems: "start",
  },
  statusBadge: {
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
    lineHeight: 1.7,
  },
  actionBox: {
    marginTop: 14,
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
    color: "#c8d6e5",
    fontSize: 13,
    lineHeight: 1.7,
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
    fontSize: 20,
    fontWeight: 900,
    wordBreak: "break-word",
  },
  chartHint: {
    color: "#98aec9",
    fontSize: 12,
    marginBottom: 8,
  },
  chart: {
    height: 410,
    width: "100%",
  },
  findingList: {
    display: "grid",
    gap: 10,
  },
  findingItem: {
    display: "grid",
    gridTemplateColumns: "30px 1fr",
    gap: 10,
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
  },
  findingIcon: {
    width: 24,
    height: 24,
    borderRadius: 999,
    color: "#050816",
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 900,
  },
  findingTitle: {
    color: "#e6f2ff",
    fontWeight: 800,
    marginBottom: 4,
  },
  actionList: {
    display: "grid",
    gap: 10,
  },
  actionItem: {
    display: "grid",
    gridTemplateColumns: "28px 1fr",
    gap: 10,
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    lineHeight: 1.7,
  },
  actionIndex: {
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
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  summaryBox: {
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
  },
  summaryValue: {
    color: "#e6f2ff",
    fontSize: 18,
    fontWeight: 900,
  },
  auxList: {
    display: "grid",
    gap: 10,
  },
  auxItem: {
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
  },
  auxTitle: {
    color: "#e6f2ff",
    fontWeight: 800,
    marginBottom: 4,
  },
  details: {
    background: "#0f1525",
    border: "1px solid #1a2640",
    borderRadius: 10,
    padding: 15,
    marginBottom: 14,
  },
  summaryTitle: {
    cursor: "pointer",
    color: "#e6f2ff",
    fontWeight: 800,
    fontSize: 15,
  },
  tableWrap: {
    overflowX: "auto",
    marginTop: 12,
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
    whiteSpace: "nowrap",
  },
  tdMuted: {
    borderBottom: "1px solid #1a2640",
    padding: "9px 7px",
    color: "#98aec9",
    verticalAlign: "top",
    lineHeight: 1.5,
  },
  evidenceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginTop: 12,
  },
  evidenceCard: {
    background: "#0b1020",
    border: "1px solid #1a2640",
    borderRadius: 8,
    padding: 12,
  },
  evidenceTitle: {
    color: "#00d4ff",
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 4,
  },
  evidenceFile: {
    color: "#e6f2ff",
    fontWeight: 800,
    marginBottom: 4,
    wordBreak: "break-word",
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