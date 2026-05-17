import React, { useEffect, useState, useCallback, useRef } from "react";
import * as echarts from "echarts";
import StatusCard from "../components/cards/StatusCard";
import LoadingState from "../components/status/LoadingState";
import ErrorState from "../components/status/ErrorState";
import { fetchArea2Overview, fetchArea2Rings, fetchArea2RingMileage, fetchArea2RiskSourcesNearby } from "../api/area2";
import type { Area2Overview, Area2Ring, Area2RingMileageConfig, Area2RiskSource } from "../api/area2";

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

  const load = useCallback(async () => {
    setLoading(true);
    const [ovr, rng] = await Promise.all([fetchArea2Overview(), fetchArea2Rings()]);
    if (ovr.ok) setOverview(ovr.data!);
    if (rng.ok && rng.data) setRings(rng.data);
    if (!ovr.ok && !rng.ok) setError("接口连接异常");
    setLoading(false);

    // 异步加载里程和风险源
    const currentRing = ovr.data?.position?.currentRing;
    if (currentRing) {
      const [mil, risks] = await Promise.all([
        fetchArea2RingMileage(),
        fetchArea2RiskSourcesNearby(currentRing),
      ]);
      if (mil.ok && mil.data) setMileage(mil.data);
      if (risks.ok && risks.data) setNearbyRisks(risks.data);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 环形进度仪表盘
  useEffect(() => {
    if (!gaugeRef.current || !overview?.position) return;
    if (!gaugeInst.current) gaugeInst.current = echarts.init(gaugeRef.current, "dark");
    const pos = overview.position;
    const curr = pos.currentRing || 0;
    const range = pos.ringRange || [1717, 1749];
    const pct = range[1] > range[0] ? Math.round(((curr - range[0]) / (range[1] - range[0])) * 100) : 0;
    gaugeInst.current.setOption({
      backgroundColor: "transparent",
      series: [{
        type: "gauge", startAngle: 210, endAngle: -30, center: ["50%", "55%"], radius: "80%",
        min: range[0], max: range[1], splitNumber: 4,
        axisLine: { lineStyle: { width: 18, color: [[pct/100, "#00d4ff"], [1, "#1a2845"]] } },
        axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { color: "#5a6d8a", fontSize: 10, distance: 20, formatter: "{value}环" },
        pointer: { length: "65%", width: 6, itemStyle: { color: "#ff8c42" } },
        detail: { valueAnimation: true, formatter: "当前\n{value}环", color: "#e0e8f0", fontSize: 18, offsetCenter: [0, "55%"], lineHeight: 22 },
        data: [{ value: curr }],
      }],
    }, true);
    const h = () => gaugeInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [overview]);

  // 环号时间轴（含里程标注）
  useEffect(() => {
    if (!timelineRef.current || rings.length === 0) return;
    if (!tlInst.current) tlInst.current = echarts.init(timelineRef.current, "dark");
    const ringNums = rings.map(r => r.ring_no).filter(n => typeof n === "number") as number[];
    const dates = rings.map(r => String((r as Record<string,unknown>).date || "")).map((d: string) => d.length > 10 ? d.substring(5, 10) : d);
    const chainLabels = rings.map(r => r.chainage ? r.chainage.substring(0,10) : "");
    tlInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 },
        formatter: (p: { name: string; value: number }[]) => { const idx = ringNums.indexOf(p[0].value); return "环号: " + p[0].value + (idx>=0 && dates[idx] ? "<br/>日期: "+dates[idx] : "") + (idx>=0 && chainLabels[idx] ? "<br/>里程: "+chainLabels[idx] : ""); }
      },
      grid: { left: 50, right: 50, top: 16, bottom: 24 },
      xAxis: { type: "category", data: dates, axisLabel: { color: "#5a6d8a", fontSize: 10 }, axisLine: { lineStyle: { color: "#1a2845" } } },
      yAxis: { type: "value", name: "环号", nameTextStyle: { color: "#5a6d8a" }, axisLabel: { color: "#5a6d8a", fontSize: 11 }, splitLine: { lineStyle: { color: "#121e36" } } },
      series: [{
        type: "line", data: ringNums, smooth: true, symbol: "circle", symbolSize: 8,
        lineStyle: { width: 2, color: "#00d4ff" }, itemStyle: { color: "#00d4ff" },
        areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:"rgba(0,212,255,0.15)"},{offset:1,color:"rgba(0,212,255,0)"}]) },
        markLine: ringNums[0] !== ringNums[ringNums.length-1] ? { silent: true, symbol: "none", lineStyle: { color: "#ff8c42", type: "dashed", width: 1 }, label: { formatter: "首环 {c}", color: "#ff8c42", fontSize: 10 }, data: [{ xAxis: dates[0] }, { xAxis: dates[dates.length-1] }] } : undefined,
      }],
    }, true);
    const h = () => tlInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [rings]);

  // 报警/预警/正常 三色柱状图
  useEffect(() => {
    if (!alertBarRef.current || !overview?.monitoringSummary) return;
    if (!alertBarInst.current) alertBarInst.current = echarts.init(alertBarRef.current, "dark");
    const items = overview.monitoringSummary.slice(0, 10);
    alertBarInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
      grid: { left: 80, right: 20, top: 30, bottom: 50 },
      legend: { top: 0, textStyle: { color: "#7a8ba8", fontSize: 10 } },
      xAxis: { type: "category", data: items.map(m => m.item), axisLabel: { color: "#5a6d8a", fontSize: 10, rotate: 30 } },
      yAxis: { type: "value", axisLabel: { color: "#5a6d8a", fontSize: 10 }, splitLine: { lineStyle: { color: "#121e36" } } },
      series: [
        { name: "报警", type: "bar", data: items.map(m => (m as Record<string,unknown>).alarm_cnt as number || 0), stack: "total", itemStyle: { color: "#e65100" }, barWidth: 24 },
        { name: "预警", type: "bar", data: items.map(m => (m as Record<string,unknown>).warning_cnt as number || 0), stack: "total", itemStyle: { color: "#d4a050" }, barWidth: 24 },
        { name: "正常", type: "bar", data: items.map(m => (m as Record<string,unknown>).normal_cnt as number || 0), stack: "total", itemStyle: { color: "#2e7d32" }, barWidth: 24 },
      ],
    }, true);
    const h = () => alertBarInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [overview]);

  useEffect(() => { return () => { gaugeInst.current?.dispose(); tlInst.current?.dispose(); alertBarInst.current?.dispose(); }; }, []);

  if (loading) return <LoadingState message="正在加载2工区盾构数据..." />;
  if (error && !overview) return <ErrorState message={error} onRetry={load} />;

  const pos = overview?.position;
  const paramGroups = overview?.parameterSummary || [];
  const paramTotal = paramGroups.reduce((s, g) => s + (g.sample_count || 0), 0);
  const monTotal = (overview?.monitoringSummary || []).reduce((s, m) => s + (m.readings || 0), 0);
  const ovCards = overview?.cards || [];
  const cardMap: Record<string,number> = {};
  for (const c of ovCards) cardMap[c.name] = c.value;
  const alarmCount = cardMap["监测报警"] || 0;

  return (
    <div className="page-area2-overview">
      <h2 className="page-title">2工区盾构总览</h2>
      <p className="page-desc">工~天盾构区间，环号1717~1749。{overview?.headline || ""}</p>
      {error && <div className="page-warning-banner" style={{background:"#2a0a0a",border:"1px solid #5a1a1a",color:"#d47070",padding:"8px 16px",borderRadius:4,marginBottom:12}}>{"⚠ " + error}</div>}

      {/* 状态卡片 */}
      <section className="status-cards-row">
        <div className="status-cards-group"><h3 className="group-title">掘进概况</h3>
          <div className="status-cards">
            <StatusCard label="当前环号" value={pos?.currentRing ?? "-"} unit="环" highlight />
            <StatusCard label="环号范围" value={pos?.ringRange ? pos.ringRange[0] + "~" + pos.ringRange[1] : "1717~1749"} />
            <StatusCard label="当前里程" value={pos?.chainage || mileage?.rings?.[0]?.chainage || "-"} />
            <StatusCard label="参数分组" value={paramGroups.length} unit="组" />
          </div>
        </div>
        <div className="status-cards-group"><h3 className="group-title">数据概览</h3>
          <div className="status-cards">
            <StatusCard label="掘进参数" value={paramTotal > 0 ? (paramTotal/1000).toFixed(0)+"k" : "-"} unit="条" />
            <StatusCard label="监测读数" value={monTotal.toLocaleString()} unit="条" />
            <StatusCard label="监测报警" value={alarmCount || cardMap["监测报警级读数"] || "-"} unit="条" highlight />
            <StatusCard label="阈值状态" value="已配置" subLabel={alarmCount > 0 ? "统计推导" : "待确认"} />
          </div>
        </div>
      </section>

      {/* 环号进度 + 时间轴 */}
      <section style={{display:"flex", gap:16, marginBottom:16}}>
        <div style={{flex:1, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>当前环号进度</h4>
          <p style={{color:"#4a5a6e", fontSize:11}}>范围 {pos?.ringRange ? pos.ringRange[0]+"~"+pos.ringRange[1] : "1717~1749"}{pos?.chainage ? " · 里程 " + pos.chainage : ""}</p>
          <div ref={gaugeRef} style={{height:200}} />
        </div>
        <div style={{flex:1.5, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>环号时间轴</h4>
          <p style={{color:"#4a5a6e", fontSize:11}}>悬停查看里程</p>
          <div ref={timelineRef} style={{height:220}} />
        </div>
      </section>

      {/* 报警/预警/正常 三色柱状图 */}
      <section style={{marginBottom:16, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
        <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>监测状态分布（按监测项目）</h4>
        <p style={{color:"#4a5a6e", fontSize:11}}>阈值来源：P95/P99统计推导（非工程设计值），1,430条报警需人工复核确认。</p>
        <div ref={alertBarRef} style={{height:260}} />
      </section>

      {/* 参数分组进度网格 */}
      <section style={{marginBottom:16}}>
        <h3 style={{color:"#6a7d9e", fontSize:14, marginBottom:8}}>参数分组（{paramGroups.length} 组）</h3>
        <div className="groups-grid" style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(170px, 1fr))", gap:8}}>
          {paramGroups.map((g, i) => {
            const barPct = Math.min(100, Math.round(((g.ring_count || 0) / Math.max(rings.length, 1)) * 100));
            return (
              <div key={i} className="group-card" style={{flexDirection:"column", alignItems:"stretch", gap:4, padding:"10px 12px"}}>
                <div style={{display:"flex", justifyContent:"space-between"}}>
                  <span className="group-name" style={{fontSize:12}}>{g.group_cn || g.group_code}</span>
                  <span style={{fontSize:10, color:"#5a6d8a"}}>{g.ring_count}环</span>
                </div>
                <div style={{height:5, background:"#1a2845", borderRadius:2, overflow:"hidden"}}>
                  <div style={{height:"100%", width:barPct+"%", background:"linear-gradient(90deg, #0d47a1, #00d4ff)", borderRadius:2}} />
                </div>
                <div style={{display:"flex", justifyContent:"space-between", fontSize:10}}>
                  <span style={{color:"#00d4ff", fontWeight:600}}>{g.sample_count.toLocaleString()}条</span>
                  {g.exceed_count != null && <span style={{color: g.exceed_count > 0 ? "#e65100" : "#5a6d8a"}}>{g.exceed_count > 0 ? g.exceed_count+"条超限" : "正常"}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 里程信息 */}
      {mileage?.rings && mileage.rings.length > 0 && (
        <section style={{marginBottom:16, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>环号-里程映射（{mileage.rings.length}环）</h4>
          <p style={{color:"#4a5a6e", fontSize:11, marginBottom:8}}>方向：{mileage.direction || "decreasing"} · {mileage.status || ""}</p>
          <div style={{maxHeight:120, overflowY:"auto"}}>
            <table className="db-table" style={{width:"100%", fontSize:11}}>
              <thead><tr><th>环号</th><th>里程</th><th>备注</th></tr></thead>
              <tbody>
                {mileage.rings.slice(0, 5).map((r, i) => (
                  <tr key={i}><td className="mono">{r.ring_no}</td><td className="mono">{r.chainage}</td><td style={{fontSize:10, color:"#5a6d8a"}}>{r.mileage}</td></tr>
                ))}
                {mileage.rings.length > 5 && <tr><td colSpan={3} style={{textAlign:"center", color:"#5a6d8a", fontSize:10}}>... 共{mileage.rings.length}环</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 附近风险源 */}
      {nearbyRisks.length > 0 && (
        <section style={{marginBottom:16, background:"#0f1525", border:"1px solid #5a3a1a", borderLeft:"4px solid #e65100", borderRadius:4, padding:12}}>
          <h4 style={{color:"#e65100", fontSize:13, marginBottom:4}}>附近风险源（{nearbyRisks.length}个）</h4>
          <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
            {nearbyRisks.map((r, i) => (
              <div key={i} style={{background:"#1a1210", border:"1px solid #3a2a1a", borderRadius:4, padding:"8px 12px", minWidth:140}}>
                <div style={{fontSize:11, fontWeight:600, color:"#d4a050"}}>{r.name}</div>
                <div style={{fontSize:10, color:"#8a6d5a"}}>{r.type_cn || r.type} · 环{r.ring_no}{r.chainage ? " · "+r.chainage : ""}</div>
                <div style={{fontSize:9, color: r.risk_level === "高" ? "#e65100" : "#5a8aaa"}}>{r.risk_level || r.status}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 研判发现 */}
      {overview?.findings && overview.findings.length > 0 && (
        <section style={{marginBottom:16, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:6}}>关键发现</h4>
          <div style={{display:"flex", flexDirection:"column", gap:6}}>
            {overview.findings.map((f, i) => {
              const fRecord = f as Record<string,unknown>;
              return (
                <div key={i} style={{fontSize:12, color:"#98aec9", display:"flex", alignItems:"flex-start", gap:8}}>
                  <span style={{background:"#1565c0", color:"#fff", borderRadius:2, padding:"1px 5px", fontSize:10, whiteSpace:"nowrap"}}>{String(fRecord.level_cn || fRecord.level || "i")}</span>
                  <span>{String(fRecord.message || fRecord.description || "")}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 数据缺口 */}
      {overview?.dataGaps && overview.dataGaps.length > 0 && (
        <section style={{marginBottom:0, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:6}}>数据缺口</h4>
          <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
            {overview.dataGaps.map((g, i) => (
              <div key={i} style={{background:"#111a2e", border:"1px solid #1a2845", borderRadius:4, padding:"6px 12px"}}>
                <span style={{fontSize:10, fontWeight:600, color:"#d4a050"}}>{g.field}</span>
                <span style={{fontSize:10, color:"#8a6d5a", marginLeft:8}}>{g.reason}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}