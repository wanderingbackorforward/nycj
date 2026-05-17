import React, { useEffect, useState, useCallback, useRef } from "react";
import * as echarts from "echarts";
import LoadingState from "../components/status/LoadingState";
import ErrorState from "../components/status/ErrorState";
import { fetchArea2DiagnosisSlurryGrouting, fetchArea2TunnelingParams, fetchArea2MonitoringSummary, fetchArea2Rings } from "../api/area2";
import type { Area2DiagnosisSlurryGrouting, Area2TunnelingParameter, Area2MonitoringSummary, Area2Ring } from "../api/area2";

export default function Area2SlurryGrouting() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rings, setRings] = useState<Area2Ring[]>([]);
  const [selectedRing, setSelectedRing] = useState<number | null>(null);
  const [diagnosis, setDiagnosis] = useState<Area2DiagnosisSlurryGrouting | null>(null);
  const [slurryParams, setSlurryParams] = useState<Area2TunnelingParameter[]>([]);
  const [groutParams, setGroutParams] = useState<Area2TunnelingParameter[]>([]);
  const [monSummary, setMonSummary] = useState<Area2MonitoringSummary | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const loadMeta = useCallback(async () => {
    setLoading(true);
    const [ringRes, monRes] = await Promise.all([fetchArea2Rings(), fetchArea2MonitoringSummary()]);
    if (ringRes.ok && ringRes.data) {
      setRings(ringRes.data);
      const last = ringRes.data[ringRes.data.length - 1]?.ring_no;
      if (typeof last === "number") setSelectedRing(last);
    }
    if (monRes.ok) setMonSummary(monRes.data!);
    if (!ringRes.ok && !monRes.ok) setError("接口连接异常");
    setLoading(false);
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  const loadDiagnosis = useCallback(async (ringNo: number | null) => {
    if (ringNo == null) return;
    setDiagLoading(true); setDiagnosis(null);
    const [diagRes, slurRes, groutRes] = await Promise.all([
      fetchArea2DiagnosisSlurryGrouting(ringNo),
      fetchArea2TunnelingParams("group=slurry"),
      fetchArea2TunnelingParams("group=grouting"),
    ]);
    if (diagRes.ok) setDiagnosis(diagRes.data!);
    if (slurRes.ok && slurRes.data) setSlurryParams(slurRes.data);
    if (groutRes.ok && groutRes.data) setGroutParams(groutRes.data);
    setDiagLoading(false);
  }, []);

  useEffect(() => { if (selectedRing != null) loadDiagnosis(selectedRing); }, [selectedRing, loadDiagnosis]);

  // ---- 横向柱状图：土压/泥水 + 注浆参数 ----
  useEffect(() => {
    if (!chartRef.current || !diagnosis) return;
    if (!chartInstance.current) chartInstance.current = echarts.init(chartRef.current, "dark");

    const raw = diagnosis as Record<string,unknown>;
    const slurry = (raw.slurry_params || raw.slurry_parameters) as Array<Record<string,unknown>> || [];
    const grouting = (raw.grouting_params || raw.grouting_parameters) as Array<Record<string,unknown>> || [];
    const allParams = [...slurry, ...grouting];
    if (allParams.length === 0) return;

    const seen = new Set<string>();
    const unique: Array<{name: string; value: number; unit: string; isSlurry: boolean}> = [];
    for (const p of allParams) {
      const n = String(p.name || "");
      if (!seen.has(n) && typeof p.value === "number") {
        seen.add(n);
        unique.push({ name: n, value: p.value, unit: String(p.unit || ""), isSlurry: true });
      }
      if (unique.length >= 15) break;
    }
    const slurryCount = slurry.length;
    for (let i = 0; i < unique.length; i++) {
      unique[i].isSlurry = i < Math.min(slurryCount, unique.length);
    }

    chartInstance.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
      grid: { left: 160, right: 60, top: 10, bottom: 20 },
      xAxis: { type: "value", axisLabel: { color: "#5a6d8a", fontSize: 11 }, splitLine: { lineStyle: { color: "#121e36" } } },
      yAxis: { type: "category", data: unique.map(p => p.name + (p.unit ? " (" + p.unit + ")" : "")), axisLabel: { color: "#8a9bb5", fontSize: 10, width: 140, overflow: "truncate" }, axisLine: { lineStyle: { color: "#1a2845" } } },
      series: [{
        type: "bar",
        data: unique.map(p => ({ value: p.value, itemStyle: { color: p.isSlurry ? "#00d4ff" : "#ff8c42" } })),
        barWidth: 16, itemStyle: { borderRadius: [0, 3, 3, 0] },
        label: { show: true, position: "right", color: "#5a6d8a", fontSize: 10, formatter: "{c}" },
      }],
    }, true);
    const h = () => chartInstance.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [diagnosis]);

  useEffect(() => { return () => { chartInstance.current?.dispose(); }; }, []);

  if (loading) return <LoadingState message="正在加载泥水注浆数据..." />;
  if (error && rings.length === 0) return <ErrorState message={error} onRetry={loadMeta} />;

  const raw = diagnosis as Record<string,unknown> | null;
  const conclusionText = String(raw?.conclusion || raw?.summary || "");
  const actions = (raw?.actions || raw?.recommended_actions || []) as string[];
  const gaps = (raw?.gaps || raw?.data_gaps || []) as Array<Record<string,string>>;

  return (
    <div className="page-area2-slurry">
      <h2 className="page-title">2工区泥水注浆</h2>
      <p className="page-desc">选择环号查看该环的土压/泥水参数与注浆参数，评估与监测响应的关联性。</p>
      {error && <div className="page-warning-banner" style={{background:"#2a0a0a",border:"1px solid #5a1a1a",color:"#d47070",padding:"8px 16px",borderRadius:4,marginBottom:12}}>{"⚠ " + error}</div>}

      <div className="param-selector">
        <label>选择环号：</label>
        <select className="param-select" value={selectedRing ?? ""} onChange={e => setSelectedRing(Number(e.target.value) || null)}>
          {rings.map(r => (<option key={r.ring_no} value={r.ring_no}>{"第" + r.ring_no + " 环"}</option>))}
        </select>
        {diagLoading && <span className="loading-text">加载中...</span>}
      </div>

      {/* ======== 参数柱状图 ======== */}
      <section className="status-section">
        <h3>{"环号 " + (raw?.ring_no || selectedRing || "-") + " — 泥水/土压与注浆参数"}</h3>
        <div className="chart-container" ref={chartRef} style={{height:400}}>
          {!diagnosis && !diagLoading && <div className="chart-placeholder">选择环号后显示参数</div>}
        </div>
        <div style={{display:"flex", gap:20, marginTop:8}}>
          <span style={{fontSize:11, color:"#5a6d8a"}}>{"●"} <span style={{color:"#00d4ff"}}>蓝色</span> = 土压/泥水参数</span>
          <span style={{fontSize:11, color:"#5a6d8a"}}>{"●"} <span style={{color:"#ff8c42"}}>橙色</span> = 注浆参数</span>
        </div>
      </section>

      {/* ======== 数据量概览 ======== */}
      <section className="status-cards-row">
        <div className="status-cards-group"><h3 className="group-title">土压/泥水参数</h3>
          <div style={{display:"flex", gap:24}}>
            <div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:"#00d4ff"}}>{slurryParams.length.toLocaleString()}</div><div style={{fontSize:11,color:"#6a7d9e"}}>条数</div></div>
            <div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:"#00d4ff"}}>{[...new Set(slurryParams.map(p => p.ring_no))].length}</div><div style={{fontSize:11,color:"#6a7d9e"}}>环数</div></div>
          </div>
        </div>
        <div className="status-cards-group"><h3 className="group-title">注浆参数</h3>
          <div style={{display:"flex", gap:24}}>
            <div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:"#ff8c42"}}>{groutParams.length.toLocaleString()}</div><div style={{fontSize:11,color:"#6a7d9e"}}>条数</div></div>
            <div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:700,color:"#ff8c42"}}>{[...new Set(groutParams.map(p => p.ring_no))].length}</div><div style={{fontSize:11,color:"#6a7d9e"}}>环数</div></div>
          </div>
        </div>
      </section>

      {/* ======== 综合诊断（简洁2行） ======== */}
      {conclusionText && (
        <section style={{marginBottom:14, background:"#0f1525", border:"1px solid #1a2640", borderLeft:"3px solid #00d4ff", borderRadius:4, padding:12}}>
          <div style={{fontSize:12, color:"#6a7d9e", marginBottom:4}}>综合诊断</div>
          <div style={{fontSize:13, color:"#98aec9", lineHeight:1.6}}>{conclusionText}</div>
        </section>
      )}

      {/* ======== 监测响应概要 ======== */}
      <section style={{marginBottom:14}}>
        <h3 style={{color:"#6a7d9e", fontSize:14, marginBottom:8}}>当前监测响应</h3>
        <div className="mon-status-grid">
          <div className="mon-status-card unknown"><span className="mon-status-label">总读数</span><span className="mon-status-value">{monSummary?.total_readings?.toLocaleString() || "-"}</span></div>
          <div className="mon-status-card unknown"><span className="mon-status-label">待确认</span><span className="mon-status-value">{String(monSummary?.total_readings || "-")}</span></div>
        </div>
        <p className="mon-status-note">注意：当前缺少正式泥水环流数据（如进出泥流量、密度差）。仅展示土压传感器和注浆参数。不假装有完整环流数据。</p>
      </section>

      {/* ======== 数据缺口 ======== */}
      <section>
        <h3 style={{color:"#6a7d9e", fontSize:14, marginBottom:8}}>数据缺口</h3>
        <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
          {[
            { cat: "环流数据", desc: "缺少进出泥流量、密度差", impact: "无法评估泥水平衡", action: "从盾构PLC导出" },
            { cat: "阈值", desc: "缺少土压/注浆诊断阈值", impact: "无法自动判断异常", action: "补充设计规范限值" },
          ].map((g, i) => (
            <div key={i} style={{flex:"1 1 200px", background:"#1a1210", border:"1px solid #5a3a1a", borderRadius:4, padding:"10px 12px"}}>
              <div style={{fontSize:11, color:"#d4a050", fontWeight:600, marginBottom:4}}>{g.cat}</div>
              <div style={{fontSize:11, color:"#8a6d5a", marginBottom:2}}>{g.desc}</div>
              <div style={{fontSize:10, color:"#5a4a2a"}}>{"→ " + g.action}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}