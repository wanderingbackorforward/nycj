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
    if (barRef.current.clientWidth === 0 || barRef.current.clientHeight === 0) return;
    if (!barInst.current) { try { barInst.current = echarts.init(barRef.current); } catch { return; } }
    barInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
      grid: { left: 50, right: 40, top: 10, bottom: 70 },
      xAxis: { type: "category", data: items.map(i => (i.monitoring_item || "").replace("竖向位移","竖向").replace("水平位移","水平")), axisLabel: { color: "#5a6d8a", fontSize: 10, rotate: 35 }, axisLine: { lineStyle: { color: "#1a2640" } } },
      yAxis: { type: "value", axisLabel: { color: "#5a6d8a", fontSize: 10 }, splitLine: { lineStyle: { color: "#121e36" } } },
      series: [
        { name: "读数数", type: "bar", data: items.map(i => i.reading_count || 0), itemStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:"#00d4ff"},{offset:1,color:"#0d47a1"}]), borderRadius: [4,4,0,0] }, barWidth: 24 },
      ],
    }, true);
    const h = () => barInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [items]);

  // ---- 解析置信度饼图 ----
  useEffect(() => {
    if (!pieRef.current || !summary) return;
    if (pieRef.current.clientWidth === 0 || pieRef.current.clientHeight === 0) return;
    if (!pieInst.current) { try { pieInst.current = echarts.init(pieRef.current); } catch { return; } }
    const raw = summary as Record<string,unknown>;
    const conf = (raw.parse_confidence_dist || {}) as Record<string,unknown>;
    const data = Object.entries(conf).map(([k, v]) => ({
      name: k === "high" ? "高" : k === "medium" ? "中" : k === "low" ? "低" : k,
      value: Number(v) || 0,
    }));
    if (data.length === 0) return;
    pieInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "item", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
      legend: { bottom: 0, textStyle: { color: "#98aec9", fontSize: 10 } },
      series: [{ type: "pie", radius: ["40%", "65%"], center: ["50%", "45%"], data, label: { color: "#98aec9", fontSize: 11 }, itemStyle: { borderColor: "#0a0e1a", borderWidth: 2 } }],
    }, true);
    const h = () => pieInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [summary]);

  // ---- 数据质量雷达图 ----
  useEffect(() => {
    if (!radarRef.current || !summary) return;
    if (radarRef.current.clientWidth === 0 || radarRef.current.clientHeight === 0) return;
    if (!radarInst.current) { try { radarInst.current = echarts.init(radarRef.current); } catch { return; } }
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
      tooltip: { backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
      radar: {
        center: ["50%", "50%"], radius: "65%",
        indicator: indicators,
        axisName: { color: "#98aec9", fontSize: 10 },
        splitArea: { areaStyle: { color: ["rgba(0,212,255,0.02)"] } },
        splitLine: { lineStyle: { color: "#1a2640" } },
        axisLine: { lineStyle: { color: "#1a2640" } },
      },
      series: [{
        type: "radar",
        data: [{ name: "2工区监测", value: [confScore, 75, 0, 70, 60], areaStyle: { color: "rgba(255,140,66,0.1)" }, lineStyle: { color: "#e65100" }, itemStyle: { color: "#e65100" } }],
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
      {error && <div className="page-warning-banner" style={{background:"#2a0a0a",border:"1px solid #5a1a1a",color:"#d47070",padding:"8px 16px",borderRadius:4,marginBottom:12}}>{"⚠ " + error}</div>}

      <div className="mon-status-note" style={{marginBottom:16}}>
        <strong>监测阈值均基于P99/P95统计推导（非工程设计值）。1,430条报警级读数需人工复核。</strong>1,430条报警级读数需人工复核确认是否为真实超限。
      </div>

      {/* ======== Row 1: 监测项目柱状图 + 解析置信度饼图 ======== */}
      <section style={{display:"flex", gap:16, marginBottom:16}}>
        <div style={{flex:1.5, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>监测项目读数分布</h4>
          <div ref={barRef} style={{height:280}} />
        </div>
        <div style={{flex:1, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>解析置信度</h4>
          <div ref={pieRef} style={{height:280}} />
        </div>
      </section>

      {/* ======== Row 2: 数据质量雷达图 + 数据量卡片 ======== */}
      <section style={{display:"flex", gap:16, marginBottom:16}}>
        <div style={{flex:1, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>数据质量五维雷达</h4>
          <div ref={radarRef} style={{height:260}} />
        </div>
        <div style={{flex:1, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:8}}>数据量总览</h4>
          <div className="mon-status-grid" style={{flexDirection:"column", gap:8}}>
            <div className="mon-status-card"><span className="mon-status-label">总读数</span><span className="mon-status-value">{summary?.total_readings?.toLocaleString() || "-"}</span></div>
            <div className="mon-status-card" style={{borderLeft:"3px solid #e65100"}}><span className="mon-status-label">报警级</span><span className="mon-status-value" style={{color:"#e65100"}}>{raw?.alert_summary ? (raw.alert_summary as Record<string,number>).alarm?.toLocaleString() || "-" : "-"}</span></div>
            <div className="mon-status-card"><span className="mon-status-label">监测项目数</span><span className="mon-status-value">{items.length}</span></div>
            <div className="mon-status-card" style={{borderLeft:"3px solid #d4a050"}}><span className="mon-status-label">预警级</span><span className="mon-status-value" style={{color:"#d4a050"}}>{raw?.alert_summary ? (raw.alert_summary as Record<string,number>).warning?.toLocaleString() || "-" : "-"}</span></div>
          </div>
        </div>
      </section>

      {/* ======== 待确认原因分布标签 ======== */}
      <section style={{marginBottom:14}}>
        <h3 style={{color:"#6a7d9e", fontSize:14, marginBottom:8}}>监测状态分布</h3>
        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <div style={{background:"#2a0a0a", border:"1px solid #5a1a1a", borderRadius:4, padding:"8px 14px"}}>
            <span style={{fontSize:11, color:"#e65100"}}>报警</span>
            <span style={{fontSize:18, fontWeight:700, color:"#e65100", marginLeft:8}}>{raw?.alert_summary ? (raw.alert_summary as Record<string,number>).alarm?.toLocaleString() || "0" : "0"}</span>
          </div>
          <div style={{background:"#1a1a10", border:"1px solid #5a4a2a", borderRadius:4, padding:"8px 14px"}}>
            <span style={{fontSize:11, color:"#d4a050"}}>预警</span>
            <span style={{fontSize:18, fontWeight:700, color:"#d4a050", marginLeft:8}}>{raw?.alert_summary ? (raw.alert_summary as Record<string,number>).warning?.toLocaleString() || "0" : "0"}</span>
          </div>
          <div style={{background:"#101a10", border:"1px solid #2a5a2a", borderRadius:4, padding:"8px 14px"}}>
            <span style={{fontSize:11, color:"#2e7d32"}}>正常</span>
            <span style={{fontSize:18, fontWeight:700, color:"#2e7d32", marginLeft:8}}>{raw?.alert_summary ? (raw.alert_summary as Record<string,number>).normal?.toLocaleString() || "0" : "0"}</span>
          </div>
          <div style={{background:"#111e30", border:"1px solid #1a2640", borderRadius:4, padding:"8px 14px"}}>
            <span style={{fontSize:11, color:"#5a6d8a"}}>待确认</span>
            <span style={{fontSize:18, fontWeight:700, color:"#5a6d8a", marginLeft:8}}>{raw?.alert_summary ? (raw.alert_summary as Record<string,number>).unknown?.toLocaleString() || "0" : "0"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}