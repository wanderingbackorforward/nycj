import React, { useEffect, useState, useCallback, useRef } from "react";
import * as echarts from "echarts";
import StatusCard from "../components/cards/StatusCard";
import LoadingState from "../components/status/LoadingState";
import ErrorState from "../components/status/ErrorState";
import {
  fetchArea2Overview, fetchArea2Rings, fetchArea2RingMileage,
  fetchArea2RiskSourcesNearby, fetchArea2AnalyticsOverview, fetchArea2MonitoringSummary
} from "../api/area2";
import type {
  Area2Overview, Area2Ring, Area2RingMileageConfig,
  Area2RiskSource, Area2AnalyticsOverview as A2Analytics, Area2MonitoringSummary
} from "../api/area2";

// 中文映射
const LEVEL_CN: Record<string, string> = { alarm: "报警", warning: "预警", normal: "正常", caution: "注意" };
const LEVEL_COLOR: Record<string, string> = { alarm: "#e65100", warning: "#d4a050", normal: "#2e7d32", caution: "#00d4ff" };

export default function Area2Overview() {
  const gaugeRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const alertBarRef = useRef<HTMLDivElement>(null);
  const gaugeInst = useRef<echarts.ECharts | null>(null);
  const tlInst = useRef<echarts.ECharts | null>(null);
  const alertBarInst = useRef<echarts.ECharts | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Area2Overview | null>(null);
  const [rings, setRings] = useState<Area2Ring[]>([]);
  const [mileage, setMileage] = useState<Area2RingMileageConfig | null>(null);
  const [nearbyRisks, setNearbyRisks] = useState<Area2RiskSource[]>([]);
  const [analytics, setAnalytics] = useState<A2Analytics | null>(null);
  const [monSummary, setMonSummary] = useState<Area2MonitoringSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ovr, rng, ana, mons] = await Promise.all([
        fetchArea2Overview(), fetchArea2Rings(),
        fetchArea2AnalyticsOverview(), fetchArea2MonitoringSummary()
      ]);
      if (ovr.ok) setOverview(ovr.data!);
      if (rng.ok && rng.data) setRings(rng.data);
      if (ana.ok && ana.data) setAnalytics(ana.data);
      if (mons.ok && mons.data) setMonSummary(mons.data);
      if (!ovr.ok && !rng.ok) setError("接口连接异常");

      const currentRing = ovr.data?.position?.currentRing;
      if (currentRing) {
        const [mil, risks] = await Promise.all([
          fetchArea2RingMileage(),
          fetchArea2RiskSourcesNearby(currentRing),
        ]);
        if (mil.ok && mil.data) setMileage(mil.data);
        if (risks.ok && risks.data) setNearbyRisks(risks.data);
      }
    } catch { setError("接口连接异常"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ---- 环号仪表盘 ----
  useEffect(() => {
    if (!gaugeRef.current || !overview?.position) return;
    try {
      if (!gaugeInst.current) gaugeInst.current = echarts.init(gaugeRef.current);
      const pos = overview.position;
      const curr = pos.currentRing || 0;
      const range = pos.ringRange || [1717, 1749];
      const pct = range[1] > range[0] ? Math.round(((curr - range[0]) / (range[1] - range[0])) * 100) : 0;
      gaugeInst.current.setOption({
        backgroundColor: "transparent",
        series: [{
          type: "gauge", startAngle: 210, endAngle: -30, center: ["50%", "55%"], radius: "80%",
          min: range[0], max: range[1], splitNumber: 4,
          axisLine: { lineStyle: { width: 18, color: [[pct / 100, "#00d4ff"], [1, "#1a2640"]] } },
          axisTick: { show: false }, splitLine: { show: false },
          axisLabel: { color: "#5a6d8a", fontSize: 10, distance: 20, formatter: "{value}环" },
          pointer: { length: "65%", width: 6, itemStyle: { color: "#e65100" } },
          detail: { valueAnimation: true, formatter: "当前\n{value}环", color: "#c8d6e5", fontSize: 18, offsetCenter: [0, "55%"], lineHeight: 22 },
          data: [{ value: curr }],
        }],
      }, true);
    } catch { /* silent */ }
    const h = () => { try { gaugeInst.current?.resize(); } catch { /* ignore */ } };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [overview]);

  // ---- 环号时间轴 ----
  useEffect(() => {
    if (!timelineRef.current || rings.length === 0) return;
    try {
      if (!tlInst.current) tlInst.current = echarts.init(timelineRef.current);
      const ringNums = rings.map(r => r.ring_no).filter(n => typeof n === "number") as number[];
      const dates = rings.map(r => String((r as Record<string, unknown>).date || "")).map((d: string) => d.length > 10 ? d.substring(5, 10) : d);
      const chainLabels = rings.map(r => r.chainage ? r.chainage.substring(0, 10) : "");
      tlInst.current.setOption({
        backgroundColor: "transparent",
        tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 },
          formatter: (p: { name: string; value: number }[]) => { const idx = ringNums.indexOf(p[0].value); return "环号: " + p[0].value + (idx >= 0 && dates[idx] ? "<br/>日期: " + dates[idx] : "") + (idx >= 0 && chainLabels[idx] ? "<br/>里程: " + chainLabels[idx] : ""); }
        },
        grid: { left: 50, right: 50, top: 16, bottom: 24 },
        xAxis: { type: "category", data: dates, axisLabel: { color: "#5a6d8a", fontSize: 10 }, axisLine: { lineStyle: { color: "#1a2640" } } },
        yAxis: { type: "value", name: "环号", nameTextStyle: { color: "#5a6d8a" }, axisLabel: { color: "#5a6d8a", fontSize: 11 }, splitLine: { lineStyle: { color: "#121e36" } } },
        series: [{
          type: "line", data: ringNums, smooth: true,
          itemStyle: { color: "#00d4ff" }, lineStyle: { width: 2 },
          areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: "rgba(0,212,255,0.15)" }, { offset: 1, color: "rgba(0,0,0,0)" }]) },
        }],
      }, true);
    } catch { /* silent */ }
    const h = () => { try { tlInst.current?.resize(); } catch { /* ignore */ } };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [rings]);

  // ---- 监测报警柱状图（来自analytics）----
  useEffect(() => {
    if (!alertBarRef.current || !analytics?.monitoring?.by_item) return;
    try {
      if (!alertBarInst.current) alertBarInst.current = echarts.init(alertBarRef.current);
      const items = analytics.monitoring.by_item || [];
      alertBarInst.current.setOption({
        backgroundColor: "transparent",
        tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
        legend: { top: 4, textStyle: { color: "#98aec9", fontSize: 10 } },
        grid: { left: 50, right: 20, top: 30, bottom: 60 },
        xAxis: { type: "category", data: items.map(i => i.item || ""), axisLabel: { color: "#5a6d8a", fontSize: 10, rotate: 35 }, axisLine: { lineStyle: { color: "#1a2640" } } },
        yAxis: { type: "value", axisLabel: { color: "#5a6d8a", fontSize: 10 }, splitLine: { lineStyle: { color: "#121e36" } } },
        series: [
          { name: "报警", type: "bar", stack: "total", data: items.map(i => i.alarm || 0), itemStyle: { color: "#e65100" }, barWidth: 20 },
          { name: "预警", type: "bar", stack: "total", data: items.map(i => i.warning || 0), itemStyle: { color: "#d4a050" } },
          { name: "正常", type: "bar", stack: "total", data: items.map(i => i.normal || 0), itemStyle: { color: "#2e7d32" } },
        ],
      }, true);
    } catch { /* silent */ }
    const h = () => { try { alertBarInst.current?.resize(); } catch { /* ignore */ } };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [analytics]);

  useEffect(() => { return () => { try { gaugeInst.current?.dispose(); } catch { /* ignore */ } try { tlInst.current?.dispose(); } catch { /* ignore */ } try { alertBarInst.current?.dispose(); } catch { /* ignore */ } }; }, []);

  if (loading) return <LoadingState message="正在加载盾构区间数据..." />;
  if (error && !overview && rings.length === 0) return <ErrorState message={error} onRetry={load} />;

  const cards = overview?.cards || [];
  const pos = overview?.position;
  const headline = overview?.headline || "";
  const overallLevel = overview?.overallLevel || "normal";

  return (
    <div className="page-area2-overview">
      <h2 className="page-title">2工区盾构总览</h2>
      <p className="page-desc">
        工~天盾构区间，环号范围 1717~1749，当前 {pos?.currentRing || "-"}环
        {pos?.chainage && " · 里程 " + pos.chainage}
      </p>

      {/* Headline / 总体状态 */}
      {headline && (
        <div style={{
          background: overallLevel === "alarm" ? "#2a0a0a" : overallLevel === "warning" ? "#2a1a0a" : "#101a20",
          border: "1px solid " + (overallLevel === "alarm" ? "#5a1a1a" : overallLevel === "warning" ? "#5a3a1a" : "#1a4a6a"),
          borderLeft: "4px solid " + LEVEL_COLOR[overallLevel] || "#00d4ff",
          borderRadius: 4, padding: "10px 14px", marginBottom: 16
        }}>
          <span style={{ color: LEVEL_COLOR[overallLevel] || "#5a6d8a", fontSize: 13, fontWeight: 600 }}>
            {LEVEL_CN[overallLevel] || overallLevel}：{headline}
          </span>
        </div>
      )}

      {/* 顶部指标卡片 */}
      {cards.length > 0 && (
        <section style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {cards.map((card, i) => {
            const levelColor = LEVEL_COLOR[card.level] || "#5a6d8a";
            return (
              <div key={i} style={{
                flex: "1 1 180px", background: "#0f1525", border: "1px solid #1a2640",
                borderLeft: "4px solid " + levelColor, borderRadius: 4, padding: "12px 14px"
              }}>
                <div style={{ fontSize: 11, color: "#6a7d9e", marginBottom: 4 }}>{card.title}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: levelColor }}>{card.value}</div>
                <div style={{ fontSize: 10, color: "#5a6d8a", marginTop: 2 }}>{card.subtitle || ""}</div>
              </div>
            );
          })}
        </section>
      )}

      {/* Row 1: 环号仪表 + 环号时间轴 */}
      <section style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1, background: "#0f1525", border: "1px solid #1a2640", borderRadius: 6, padding: 12 }}>
          <h4 style={{ color: "#6a7d9e", fontSize: 13, marginBottom: 4 }}>环号进度</h4>
          <div ref={gaugeRef} style={{ height: 220 }} />
        </div>
        <div style={{ flex: 2, background: "#0f1525", border: "1px solid #1a2640", borderRadius: 6, padding: 12 }}>
          <h4 style={{ color: "#6a7d9e", fontSize: 13, marginBottom: 4 }}>环号时间轴（含里程标注）</h4>
          <div ref={timelineRef} style={{ height: 220 }} />
        </div>
      </section>

      {/* Row 2: 监测报警柱状图 + 参数分组 */}
      {overview?.parameterSummary && overview.parameterSummary.length > 0 && (
        <section style={{ display: "flex", gap: 16, marginBottom: 16 }}>
          {analytics?.monitoring?.by_item && (
            <div style={{ flex: 1.5, background: "#0f1525", border: "1px solid #1a2640", borderRadius: 6, padding: 12 }}>
              <h4 style={{ color: "#6a7d9e", fontSize: 13, marginBottom: 4 }}>监测项目报警分布</h4>
              <p style={{ color: "#5a6d8a", fontSize: 10, marginBottom: 4 }}>
                阈值来源：P95/P99统计推导，非工程设计值
              </p>
              <div ref={alertBarRef} style={{ height: 260 }} />
            </div>
          )}
          <div style={{ flex: 1, background: "#0f1525", border: "1px solid #1a2640", borderRadius: 6, padding: 12 }}>
            <h4 style={{ color: "#6a7d9e", fontSize: 13, marginBottom: 8 }}>掘进参数分组</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {overview.parameterSummary.map((g, i) => {
                const maxCount = Math.max(...(overview.parameterSummary || []).map(x => x.sample_count || 0), 1);
                const barPct = Math.round(((g.sample_count || 0) / maxCount) * 100);
                return (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                      <span style={{ color: "#98aec9" }}>{g.group_cn || g.group_code}</span>
                      <span style={{ color: "#5a6d8a" }}>{(g.sample_count || 0).toLocaleString()}条 / {g.ring_count || 0}环</span>
                    </div>
                    <div style={{ height: 5, background: "#1a2640", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: barPct + "%", background: "linear-gradient(90deg, #0d47a1, #00d4ff)", borderRadius: 2 }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                      <span style={{ color: "#00d4ff", fontWeight: 600 }}>{(g.sample_count || 0).toLocaleString()}条</span>
                      {g.exceed_count != null && g.exceed_count > 0 ? (
                        <span style={{ color: "#e65100" }}>{g.exceed_count}条超限</span>
                      ) : (
                        <span style={{ color: "#5a6d8a" }}>正常</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 监测摘要卡片 */}
      {monSummary?.alert_summary && (
        <section style={{ marginBottom: 16, background: "#0f1525", border: "1px solid #1a2640", borderRadius: 6, padding: 12 }}>
          <h4 style={{ color: "#6a7d9e", fontSize: 13, marginBottom: 8 }}>监测数据摘要</h4>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ background: "#2a0a0a", border: "1px solid #5a1a1a", borderRadius: 4, padding: "8px 14px", flex: "1 1 100px" }}>
              <span style={{ fontSize: 11, color: "#e65100" }}>报警</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#e65100", marginLeft: 8 }}>{(monSummary.alert_summary.alarm || 0).toLocaleString()}</span>
            </div>
            <div style={{ background: "#1a1a10", border: "1px solid #5a4a2a", borderRadius: 4, padding: "8px 14px", flex: "1 1 100px" }}>
              <span style={{ fontSize: 11, color: "#d4a050" }}>预警</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#d4a050", marginLeft: 8 }}>{(monSummary.alert_summary.warning || 0).toLocaleString()}</span>
            </div>
            <div style={{ background: "#101a10", border: "1px solid #2a5a2a", borderRadius: 4, padding: "8px 14px", flex: "1 1 100px" }}>
              <span style={{ fontSize: 11, color: "#2e7d32" }}>正常</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#2e7d32", marginLeft: 8 }}>{(monSummary.alert_summary.normal || 0).toLocaleString()}</span>
            </div>
            <div style={{ background: "#111e30", border: "1px solid #1a2640", borderRadius: 4, padding: "8px 14px", flex: "1 1 100px" }}>
              <span style={{ fontSize: 11, color: "#5a6d8a" }}>总读数</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#5a6d8a", marginLeft: 8 }}>{(monSummary.total_readings || 0).toLocaleString()}</span>
            </div>
          </div>
        </section>
      )}

      {/* 里程信息 */}
      {mileage?.rings && mileage.rings.length > 0 && (
        <section style={{ marginBottom: 16, background: "#0f1525", border: "1px solid #1a2640", borderRadius: 6, padding: 12 }}>
          <h4 style={{ color: "#6a7d9e", fontSize: 13, marginBottom: 4 }}>环号-里程映射（{mileage.rings.length}环）</h4>
          <p style={{ color: "#5a6d8a", fontSize: 11, marginBottom: 8 }}>区间里程：DK30+594 ~ DK30+543</p>
          <div style={{ maxHeight: 120, overflowY: "auto" }}>
            <table className="db-table" style={{ width: "100%", fontSize: 11 }}>
              <thead><tr><th>环号</th><th>里程</th><th>备注</th></tr></thead>
              <tbody>
                {mileage.rings.slice(0, 5).map((r, i) => (
                  <tr key={i}><td className="mono">{r.ring_no}</td><td className="mono">{r.chainage}</td><td style={{ fontSize: 10, color: "#5a6d8a" }}>{r.mileage}</td></tr>
                ))}
                {mileage.rings.length > 5 && <tr><td colSpan={3} style={{ textAlign: "center", color: "#5a6d8a", fontSize: 10 }}>... 共{mileage.rings.length}环</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 附近风险源 */}
      {nearbyRisks.length > 0 && (
        <section style={{ marginBottom: 16, background: "#0f1525", border: "1px solid #5a3a1a", borderLeft: "4px solid #e65100", borderRadius: 4, padding: 12 }}>
          <h4 style={{ color: "#e65100", fontSize: 13, marginBottom: 4 }}>附近风险源（{nearbyRisks.length}个）</h4>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {nearbyRisks.map((r, i) => {
              const rr = r as Record<string, unknown>;
              const cat = String(rr.risk_category_cn || "");
              const ringInfo = String(rr.ring_range || rr.ringRange || rr.ring_no || "");
              const mileInfo = rr.mileage_range ? String(rr.mileage_range) : "";
              const levelCn = String(rr.risk_level_cn || "");
              const levelColor = levelCn === "高" ? "#e65100" : "#5a6d8a";
              const desc = [cat, ringInfo ? "环" + ringInfo : "", mileInfo ? "· " + mileInfo : ""].filter(Boolean).join(" · ");
              return (
                <div key={i} style={{ background: "#1a1210", border: "1px solid #3a2a1a", borderRadius: 4, padding: "8px 12px", minWidth: 160 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#d4a050" }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: "#8a6d5a" }}>{desc}</div>
                  <div style={{ fontSize: 9, color: levelColor }}>{levelCn}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 研判发现 */}
      {overview?.findings && overview.findings.length > 0 && (
        <section style={{ marginBottom: 16, background: "#0f1525", border: "1px solid #1a2640", borderRadius: 6, padding: 12 }}>
          <h4 style={{ color: "#6a7d9e", fontSize: 13, marginBottom: 6 }}>关键发现</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {overview.findings.map((f, i) => {
              const fRec = f as Record<string, unknown>;
              const msg = String(fRec.message || fRec.description || fRec.title || fRec.detail || "");
              const lvl = String(fRec.level_cn || fRec.level || "i");
              const lvlColor = LEVEL_COLOR[String(fRec.level || "")] || "#00d4ff";
              return (
                <div key={i} style={{ fontSize: 12, color: "#98aec9", display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ background: lvlColor, color: "#fff", borderRadius: 2, padding: "1px 5px", fontSize: 10, whiteSpace: "nowrap", opacity: 0.9 }}>{lvl}</span>
                  <span>{msg}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 数据缺口 */}
      {overview?.dataGaps && overview.dataGaps.length > 0 && (
        <section style={{ marginBottom: 0, background: "#0f1525", border: "1px solid #1a2640", borderRadius: 6, padding: 12 }}>
          <h4 style={{ color: "#6a7d9e", fontSize: 13, marginBottom: 6 }}>数据缺口</h4>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {overview.dataGaps.map((g, i) => {
              const gRec = g as Record<string, unknown>;
              const field = String(gRec.field || gRec.category || "");
              const reason = String(gRec.reason || gRec.detail || "");
              const status = String(gRec.status || "");
              const statusColor = status === "P0" ? "#e65100" : status === "P1" ? "#d4a050" : "#5a6d8a";
              return (
                <div key={i} style={{ background: "#111e30", border: "1px solid #1a2640", borderRadius: 4, padding: "6px 12px" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#d4a050" }}>{field}</span>
                  <span style={{ fontSize: 10, color: "#8a6d5a", marginLeft: 8 }}>{reason}</span>
                  {status && <span style={{ fontSize: 9, color: statusColor, marginLeft: 6 }}>[{status}]</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
