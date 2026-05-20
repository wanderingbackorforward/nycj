import React, { useEffect, useState, useCallback, useRef } from "react";
import * as echarts from "echarts";
import LoadingState from "../components/status/LoadingState";
import ErrorState from "../components/status/ErrorState";
import { fetchArea2MonitoringItems, fetchArea2MonitoringSummary } from "../api/area2";
import type { Area2MonitoringItem, Area2MonitoringSummary } from "../api/area2";

export default function Area2Monitoring() {
  const barRef = useRef<HTMLDivElement>(null);
  const pieRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLDivElement>(null);
  const barInst = useRef<echarts.ECharts | null>(null);
  const pieInst = useRef<echarts.ECharts | null>(null);
  const radarInst = useRef<echarts.ECharts | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Area2MonitoringItem[]>([]);
  const [summary, setSummary] = useState<Area2MonitoringSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [itemsRes, sumRes] = await Promise.all([fetchArea2MonitoringItems(), fetchArea2MonitoringSummary()]);
    if (itemsRes.ok && itemsRes.data) setItems(itemsRes.data);
    if (sumRes.ok && sumRes.data) setSummary(sumRes.data);
    if (!itemsRes.ok && !sumRes.ok) setError("监测数据接口连接异常");
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ---- 监测项目读数柱状图 ----
  useEffect(() => {
    if (!barRef.current || items.length === 0) return;
    if (!barInst.current) barInst.current = echarts.init(barRef.current);
    barInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "var(--color-panel-border)", textStyle: { color: "var(--color-text-primary)", fontSize: 12 } },
      grid: { left: 50, right: 40, top: 10, bottom: 70 },
      xAxis: { type: "category", data: items.map(i => (i.monitoring_item || "").replace("竖向位移","竖向").replace("水平位移","水平")), axisLabel: { color: "var(--color-text-dim)", fontSize: 10, rotate: 35 }, axisLine: { lineStyle: { color: "var(--color-panel-border)" } } },
      yAxis: { type: "value", axisLabel: { color: "var(--color-text-dim)", fontSize: 10 }, splitLine: { lineStyle: { color: "var(--color-bg-grid)" } } },
      series: [
        { name: "读数数", type: "bar", data: items.map(i => i.reading_count || 0), itemStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:"var(--color-accent)"},{offset:1,color:"var(--color-accent-dim)"}]), borderRadius: [4,4,0,0] }, barWidth: 24 },
      ],
    }, true);
    const h = () => barInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [items]);

  // ---- 解析置信度饼图 ----
  useEffect(() => {
    if (!pieRef.current || !summary) return;
    if (!pieInst.current) pieInst.current = echarts.init(pieRef.current);
    const raw = summary as Record<string,unknown>;
    const conf = (raw.parse_confidence_dist || {}) as Record<string,unknown>;
    const data = Object.entries(conf).map(([k, v]) => ({
      name: k === "high" ? "高" : k === "medium" ? "中" : k === "low" ? "低" : k,
      value: Number(v) || 0,
    }));
    if (data.length === 0) return;
    pieInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "item", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "var(--color-panel-border)", textStyle: { color: "var(--color-text-primary)", fontSize: 12 } },
      legend: { bottom: 0, textStyle: { color: "var(--color-text-secondary)", fontSize: 10 } },
      series: [{ type: "pie", radius: ["40%", "65%"], center: ["50%", "45%"], data, label: { color: "var(--color-text-secondary)", fontSize: 11 }, itemStyle: { borderColor: "var(--color-bg-deep)", borderWidth: 2 } }],
    }, true);
    const h = () => pieInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [summary]);

  // ---- 数据质量雷达图 ----
  useEffect(() => {
    if (!radarRef.current || !summary) return;
    if (!radarInst.current) radarInst.current = echarts.init(radarRef.current);
    const raw = summary as Record<string,unknown>;
    const confDist = (raw.parse_confidence_dist || {}) as Record<string,number>;
    const high = confDist.high || 0;
    const medium = confDist.medium || 0;
    const low = confDist.low || 0;
    const total = high + medium + low || 1;
    const confScore = Math.round(((high * 100 + medium * 60 + low * 20) / total));
    const indicators = [
      { name: "解析置信度", max: 100 },
      { name: "数据完整性", max: 100 },
      { name: "阈值覆盖", max: 100 },
      { name: "证据溯源", max: 100 },
      { name: "时效性", max: 100 },
    ];
    radarInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { backgroundColor: "rgba(15,21,37,0.95)", borderColor: "var(--color-panel-border)", textStyle: { color: "var(--color-text-primary)", fontSize: 12 } },
      radar: {
        center: ["50%", "50%"], radius: "65%",
        indicator: indicators,
        axisName: { color: "var(--color-text-secondary)", fontSize: 10 },
        splitArea: { areaStyle: { color: ["rgba(0,212,255,0.02)"] } },
        splitLine: { lineStyle: { color: "var(--color-panel-border)" } },
        axisLine: { lineStyle: { color: "var(--color-panel-border)" } },
      },
      series: [{
        type: "radar",
        data: [{ name: "2工区监测", value: [confScore, 75, 0, 70, 60], areaStyle: { color: "rgba(255,140,66,0.1)" }, lineStyle: { color: "var(--color-danger)" }, itemStyle: { color: "var(--color-danger)" } }],
      }],
    }, true);
    const h = () => radarInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [summary]);

  useEffect(() => { return () => { barInst.current?.dispose(); pieInst.current?.dispose(); radarInst.current?.dispose(); }; }, []);

  if (loading) return <LoadingState message="正在加载监测数据..." />;
  if (error && items.length === 0) return <ErrorState message={error} onRetry={load} />;

  const raw = summary as Record<string,unknown> | null;

  return (
    <div className="page-area2-monitoring">
      <h2 className="page-title">2工区监测响应</h2>
      <p className="page-desc">盾构区间监测数据状态。阈值来源：P95/P99统计推导，需人工复核确认报警。</p>
      {error && <div className="page-warning-banner" style={{background:"var(--color-danger-bg)",border:"1px solid var(--color-danger-border)",color:"#d47070",padding:"8px 16px",borderRadius:4,marginBottom:12}}>{"⚠ " + error}</div>}

      <div className="mon-status-note" style={{marginBottom:16}}>
        <strong>监测阈值均基于P99/P95统计推导（非工程设计值）。1,430条报警级读数需人工复核。</strong>1,430条报警级读数需人工复核确认是否为真实超限。
      </div>

      {/* ======== Row 1: 监测项目柱状图 + 解析置信度饼图 ======== */}
      <section style={{display:"flex", gap:16, marginBottom:16}}>
        <div style={{flex:1.5, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:12}}>
          <h4 style={{color:"var(--color-text-muted)", fontSize:13, marginBottom:4}}>监测项目读数分布</h4>
          <div ref={barRef} style={{height:280}} />
        </div>
        <div style={{flex:1, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:12}}>
          <h4 style={{color:"var(--color-text-muted)", fontSize:13, marginBottom:4}}>解析置信度</h4>
          <div ref={pieRef} style={{height:280}} />
        </div>
      </section>

      {/* ======== Row 2: 数据质量雷达图 + 数据量卡片 ======== */}
      <section style={{display:"flex", gap:16, marginBottom:16}}>
        <div style={{flex:1, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:12}}>
          <h4 style={{color:"var(--color-text-muted)", fontSize:13, marginBottom:4}}>数据质量五维雷达</h4>
          <div ref={radarRef} style={{height:260}} />
        </div>
        <div style={{flex:1, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:12}}>
          <h4 style={{color:"var(--color-text-muted)", fontSize:13, marginBottom:8}}>数据量总览</h4>
          <div className="mon-status-grid" style={{flexDirection:"column", gap:8}}>
            <div className="mon-status-card"><span className="mon-status-label">总读数</span><span className="mon-status-value">{summary?.total_readings?.toLocaleString() || "-"}</span></div>
            <div className="mon-status-card" style={{borderLeft:"3px solid var(--color-danger)"}}><span className="mon-status-label">报警级</span><span className="mon-status-value" style={{color:"var(--color-danger)"}}>{raw?.alert_summary ? (raw.alert_summary as Record<string,number>).alarm?.toLocaleString() || "-" : "-"}</span></div>
            <div className="mon-status-card"><span className="mon-status-label">监测项目数</span><span className="mon-status-value">{items.length}</span></div>
            <div className="mon-status-card" style={{borderLeft:"3px solid var(--color-warning)"}}><span className="mon-status-label">预警级</span><span className="mon-status-value" style={{color:"var(--color-warning)"}}>{raw?.alert_summary ? (raw.alert_summary as Record<string,number>).warning?.toLocaleString() || "-" : "-"}</span></div>
          </div>
        </div>
      </section>

      {/* ======== 待确认原因分布标签 ======== */}
      <section style={{marginBottom:14}}>
        <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:8}}>监测状态分布</h3>
        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <div style={{background:"var(--color-danger-bg)", border:"1px solid var(--color-danger-border)", borderRadius:4, padding:"8px 14px"}}>
            <span style={{fontSize:11, color:"var(--color-danger)"}}>报警</span>
            <span style={{fontSize:18, fontWeight:700, color:"var(--color-danger)", marginLeft:8}}>{raw?.alert_summary ? (raw.alert_summary as Record<string,number>).alarm?.toLocaleString() || "0" : "0"}</span>
          </div>
          <div style={{background:"#1a1a10", border:"1px solid #5a4a2a", borderRadius:4, padding:"8px 14px"}}>
            <span style={{fontSize:11, color:"var(--color-warning)"}}>预警</span>
            <span style={{fontSize:18, fontWeight:700, color:"var(--color-warning)", marginLeft:8}}>{raw?.alert_summary ? (raw.alert_summary as Record<string,number>).warning?.toLocaleString() || "0" : "0"}</span>
          </div>
          <div style={{background:"var(--color-success-bg)", border:"1px solid var(--color-success-border)", borderRadius:4, padding:"8px 14px"}}>
            <span style={{fontSize:11, color:"var(--color-success)"}}>正常</span>
            <span style={{fontSize:18, fontWeight:700, color:"var(--color-success)", marginLeft:8}}>{raw?.alert_summary ? (raw.alert_summary as Record<string,number>).normal?.toLocaleString() || "0" : "0"}</span>
          </div>
          <div style={{background:"var(--color-bg-hover)", border:"1px solid var(--color-panel-border)", borderRadius:4, padding:"8px 14px"}}>
            <span style={{fontSize:11, color:"var(--color-text-dim)"}}>待确认</span>
            <span style={{fontSize:18, fontWeight:700, color:"var(--color-text-dim)", marginLeft:8}}>{raw?.alert_summary ? (raw.alert_summary as Record<string,number>).unknown?.toLocaleString() || "0" : "0"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}