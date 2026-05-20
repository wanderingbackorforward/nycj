import React, { useEffect, useState, useCallback, useRef } from "react";
import * as echarts from "echarts";
import StatusCard from "../components/cards/StatusCard";
import LoadingState from "../components/status/LoadingState";
import ErrorState from "../components/status/ErrorState";
import { fetchGnOverview, fetchGnMonitoringItems, fetchGnAlerts, fetchGnHealth, fetchGnAnomalyDetection, fetchGnZoneHeatmap, fetchGnCrossCorrelation } from "../api/area1";
import type { GnOverview, GnMonitoringItem, GnAlert, GnAnomalyResponse, GnZoneHeatmapResponse, GnCrossCorrelationResponse } from "../api/area1";

export default function Area1Monitoring() {
  const barRef = useRef<HTMLDivElement>(null);
  const pieRef = useRef<HTMLDivElement>(null);
  const exceedBarRef = useRef<HTMLDivElement>(null);
  const reviewPieRef = useRef<HTMLDivElement>(null);
  const barInst = useRef<echarts.ECharts | null>(null);
  const pieInst = useRef<echarts.ECharts | null>(null);
  const exceedInst = useRef<echarts.ECharts | null>(null);
  const reviewInst = useRef<echarts.ECharts | null>(null);

  const [loading, setLoading] = useState(true);
  const [dbDown, setDbDown] = useState(false);
  const [overview, setOverview] = useState<GnOverview | null>(null);
  const [items, setItems] = useState<GnMonitoringItem[]>([]);
  const [alerts, setAlerts] = useState<GnAlert[]>([]);
  const [anomaly, setAnomaly] = useState<GnAnomalyResponse | null>(null);
  const [heatmap, setHeatmap] = useState<GnZoneHeatmapResponse | null>(null);
  const [crossCorr, setCrossCorr] = useState<GnCrossCorrelationResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [healthRes, ovrRes, itemsRes, alertsRes] = await Promise.all([
      fetchGnHealth(), fetchGnOverview(), fetchGnMonitoringItems(), fetchGnAlerts(),
    ]);
    if (healthRes.ok) {
      const h = healthRes.data!;
      setDbDown(!h.ok || h.database !== "connected");
    }
    if (ovrRes.ok) setOverview(ovrRes.data!);
    if (itemsRes.ok && itemsRes.data) setItems(itemsRes.data.items || []);
    if (alertsRes.ok && alertsRes.data) setAlerts(alertsRes.data.alerts || []);
    setLoading(false);
    // 第二批：高级分析（非阻塞）
    fetchGnAnomalyDetection().then(r => { if (r.ok) setAnomaly(r.data!); });
    fetchGnZoneHeatmap().then(r => { if (r.ok) setHeatmap(r.data!); });
    fetchGnCrossCorrelation().then(r => { if (r.ok) setCrossCorr(r.data!); });
  }, []);

  useEffect(() => { load(); }, [load]);

  // ---- 监测项目堆叠柱状图 ----
  useEffect(() => {
    if (!barRef.current || items.length === 0) return;
    if (!barInst.current) barInst.current = echarts.init(barRef.current);
    const top = items.slice(0, 12);
    barInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
      legend: { top: 0, textStyle: { color: "#98aec9", fontSize: 10 } },
      grid: { left: 50, right: 20, top: 30, bottom: 70 },
      xAxis: { type: "category", data: top.map(i => (i.monitoring_item || "").replace("竖向位移","竖向").replace("水平位移","水平")), axisLabel: { color: "#5a6d8a", fontSize: 10, rotate: 40 }, axisLine: { lineStyle: { color: "#1a2640" } } },
      yAxis: { type: "value", axisLabel: { color: "#5a6d8a", fontSize: 11 }, splitLine: { lineStyle: { color: "#121e36" } } },
      series: [
        { name: "正常", type: "bar", data: top.map(i => i.normal_count || 0), stack: "total", itemStyle: { color: "#2e7d32" }, barWidth: 24 },
        { name: "超限", type: "bar", data: top.map(i => i.exceed_count || 0), stack: "total", itemStyle: { color: "#e65100" } },
        { name: "待确认", type: "bar", data: top.map(i => i.unknown_count || 0), stack: "total", itemStyle: { color: "#7a6a2a" } },
      ],
    }, true);
    const h = () => barInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [items]);

  // ---- 状态分布饼图 ----
  useEffect(() => {
    if (!pieRef.current || !overview?.status_distribution) return;
    if (!pieInst.current) pieInst.current = echarts.init(pieRef.current);
    const colors: Record<string, string> = { normal: "#2e7d32", exceed_design_limit: "#e65100", unknown: "#7a6a2a" };
    pieInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "item", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
      legend: { bottom: 0, textStyle: { color: "#98aec9", fontSize: 10 } },
      series: [{
        type: "pie", radius: ["40%", "65%"], center: ["50%", "45%"],
        data: overview.status_distribution.map(s => ({ name: s.status_display_cn || s.status_code, value: s.count, itemStyle: { color: colors[s.status_code] || "#5a6d8a" } })),
        label: { color: "#98aec9", fontSize: 10 },
        itemStyle: { borderColor: "#0a0e1a", borderWidth: 2 },
      }],
    }, true);
    const h = () => pieInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [overview]);

  // ---- 超限Top10横向柱状图（替代文字表格）----
  useEffect(() => {
    if (!exceedBarRef.current) return;
    const exceedAlerts = [...alerts].filter(a => a.exceed_ratio != null).sort((a,b) => (b.exceed_ratio||0) - (a.exceed_ratio||0)).slice(0, 10);
    if (exceedAlerts.length === 0) return;
    if (!exceedInst.current) exceedInst.current = echarts.init(exceedBarRef.current);

    exceedInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 },
        formatter: (p: { name: string; value: number; data: { designLimit: number; cumulative: number; current: number } }[]) => {
          const d = p[0].data;
          return p[0].name + "<br/>累计变化: " + (d.cumulative ?? "-") + " | 设计限值: " + (d.designLimit ?? "-") + "<br/>当前值: " + (d.current ?? "-");
        }
      },
      grid: { left: 140, right: 80, top: 10, bottom: 20 },
      xAxis: { type: "value", axisLabel: { color: "#5a6d8a", fontSize: 10, formatter: "{value}x" }, splitLine: { lineStyle: { color: "#121e36" } }, name: "超限倍数", nameTextStyle: { color: "#5a6d8a", fontSize: 10 } },
      yAxis: {
        type: "category",
        data: exceedAlerts.map(a => (a.point_code || "") + " " + (a.monitoring_item || "").replace("竖向位移","竖向").replace("水平位移","水平")),
        axisLabel: { color: "#98aec9", fontSize: 10, width: 130, overflow: "truncate" },
        axisLine: { lineStyle: { color: "#1a2640" } },
      },
      series: [{
        type: "bar",
        data: exceedAlerts.map(a => {
          const ratio = (a.design_limit && a.design_limit !== 0) ? Math.abs((a.cumulative_change || 0) / a.design_limit) : 0;
          return { value: Math.round(ratio * 10) / 10, designLimit: a.design_limit, cumulative: a.cumulative_change, current: a.current_value };
        }),
        barWidth: 18,
        itemStyle: { borderRadius: [0, 3, 3, 0], color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{offset:0,color:"#e65100"},{offset:1,color:"#e65100"}]) },
        label: { show: true, position: "right", color: "#e65100", fontSize: 10, formatter: "{c}x" },
        markLine: { silent: true, symbol: "none", data: [{ xAxis: 1, lineStyle: { color: "#5a4a2a", type: "dashed" }, label: { formatter: "设计限值", color: "#5a4a2a", fontSize: 10 } }] },
      }],
    }, true);
    const h = () => exceedInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [alerts]);

  // ---- 复核级别分布环形图 ----
  useEffect(() => {
    if (!reviewPieRef.current || alerts.length === 0) return;
    if (!reviewInst.current) reviewInst.current = echarts.init(reviewPieRef.current);
    const reviewCounts: Record<string, number> = {};
    for (const a of alerts) {
      const lvl = a.review_level || "unspecified";
      reviewCounts[lvl] = (reviewCounts[lvl] || 0) + 1;
    }
    const levelNames: Record<string, string> = { priority: "重点复核", routine: "常规复核", unspecified: "未指定", low: "低优先" };
    const levelColors: Record<string, string> = { priority: "#e65100", routine: "#00d4ff", unspecified: "#5a6d8a", low: "#2e7d32" };
    reviewInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "item", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
      legend: { bottom: 0, textStyle: { color: "#98aec9", fontSize: 10 } },
      series: [{
        type: "pie", radius: ["45%", "70%"], center: ["50%", "45%"],
        data: Object.entries(reviewCounts).map(([k, v]) => ({ name: levelNames[k] || k, value: v, itemStyle: { color: levelColors[k] || "#5a6d8a" } })),
        label: { color: "#98aec9", fontSize: 10 },
        itemStyle: { borderColor: "#0a0e1a", borderWidth: 2 },
      }],
    }, true);
    const h = () => reviewInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [alerts]);

  // cleanup
  useEffect(() => { return () => { barInst.current?.dispose(); pieInst.current?.dispose(); exceedInst.current?.dispose(); reviewInst.current?.dispose(); }; }, []);

  if (loading) return <LoadingState message="正在加载1工区监测数据..." />;

  const gnCards = overview?.cards || [];
  const cardMap: Record<string, number> = {};
  for (const c of gnCards) { cardMap[c.name] = c.value; }

  const exceedAlerts = [...alerts].filter(a => a.exceed_ratio != null).sort((a,b) => (b.exceed_ratio||0) - (a.exceed_ratio||0));
  const priorityFindings = overview?.priority_findings || [];

  return (
    <div className="page-area1-monitoring">
      <h2 className="page-title">1工区基坑监测</h2>
      <p className="page-desc">工农路站主体基坑施工监测，含地表、建筑物、管线、桩顶、支撑、地下水、深层水平位移。</p>
      {dbDown && <div className="page-warning-banner" style={{background:"#2a0a0a",border:"1px solid #5a1a1a",color:"#d47070",padding:"8px 16px",borderRadius:4,marginBottom:12}}>{"⛔ 数据库连接异常。"}</div>}

      {/* ======== Row 1: 状态卡片 ======== */}
      <section className="status-cards-row">
        <div className="status-cards-group"><h3 className="group-title">监测概览</h3>
          <div className="status-cards">
            <StatusCard label="监测点数" value={cardMap["监测点数量"] ?? "-"} unit="个" />
            <StatusCard label="累计读数" value={cardMap["读数数量"] ?? "-"} unit="条" />
            <StatusCard label="超设计限值" value={cardMap["超设计限值"] ?? "-"} unit="条" highlight />
            <StatusCard label="待确认" value={cardMap["待确认"] ?? "-"} unit="条" highlight />
          </div>
        </div>
      </section>

      {/* ======== Row 2: 监测项目堆叠柱状图 + 状态饼图 ======== */}
      <section style={{display:"flex", gap:16, marginBottom:16}}>
        <div style={{flex:1.5, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>监测项目分布（堆叠柱状）</h4>
          <div ref={barRef} style={{height:280}} />
        </div>
        <div style={{flex:1, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>状态分布</h4>
          <div ref={pieRef} style={{height:280}} />
        </div>
      </section>

      {/* ======== Row 3: 超限横向柱状图 + 复核级别环形图 ======== */}
      <section style={{display:"flex", gap:16, marginBottom:16}}>
        <div style={{flex:1.5, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>超设计限值 Top10（横轴=超限倍数）</h4>
          <p style={{color:"#5a6d8a", fontSize:11, marginBottom:4}}>虚线=设计限值线(1x)；悬停查看累计变化与当前值</p>
          {exceedAlerts.length === 0 && <div style={{height:200, display:"flex", alignItems:"center", justifyContent:"center", color:"#5a6d8a"}}>暂无超设计限值数据</div>}
          <div ref={exceedBarRef} style={{height: Math.max(200, exceedAlerts.slice(0,10).length * 32)}} />
        </div>
        <div style={{flex:1, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>复核级别分布</h4>
          <div ref={reviewPieRef} style={{height:240}} />
        </div>
      </section>

      {/* ======== Row 4: 重点发现（图表化卡片） ======== */}
      {priorityFindings.length > 0 && (
        <section style={{marginBottom:16}}>
          <h3 style={{color:"#6a7d9e", fontSize:14, marginBottom:10}}>重点发现（{priorityFindings.length} 条）</h3>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
            {priorityFindings.slice(0, 6).map((f, i) => (
              <div key={i} style={{
                background: f.level === "critical" ? "#2a0a0a" : "#0f1525",
                border: "1px solid " + (f.level === "critical" ? "#5a1a1a" : "#1a2640"),
                borderLeft: "4px solid " + (f.level === "critical" ? "#e65100" : "#00d4ff"),
                borderRadius: 4, padding: "12px 14px",
              }}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4}}>
                  <span style={{
                    fontSize:10, fontWeight:600, padding:"2px 6px", borderRadius:2, color:"#fff",
                    background: f.level === "critical" ? "#e65100" : "#00d4ff",
                  }}>{f.level === "critical" ? "! 重点" : "i 关注"}</span>
                  <span style={{fontSize:10, color:"#5a6d8a"}}>#{i+1}</span>
                </div>
                <div style={{fontSize:13, fontWeight:600, color:"#c8d6e5", marginBottom:3}}>{f.title}</div>
                <div style={{fontSize:11, color:"#98aec9", lineHeight:1.5}}>{f.detail}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ======== Row 5: 高级分析 ======== */}
      {(anomaly || heatmap || crossCorr) && (
        <section style={{display:"flex", gap:16, marginBottom:16, flexWrap:"wrap"}}>
          {/* 异常检测 */}
          {anomaly?.items && anomaly.items.length > 0 && (
            <div style={{flex:"1 1 300px", background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
              <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>异常检测（{anomaly.sigma_threshold}σ）</h4>
              <div style={{maxHeight:200, overflowY:"auto"}}>
                {anomaly.items.filter(a => a.is_anomaly).slice(0, 8).map((a, i) => (
                  <div key={i} style={{display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"1px solid #1a2640", fontSize:11}}>
                    <span style={{color:"#c8d6e5"}}>{a.point_code}</span>
                    <span style={{color:"#98aec9"}}>{a.monitoring_item}</span>
                    <span style={{color:"#e65100", fontWeight:600}}>Z={a.z_score?.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* 分区热力图 */}
          {heatmap?.items && heatmap.items.length > 0 && (
            <div style={{flex:"1 1 350px", background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
              <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>分区热力</h4>
              <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
                {heatmap.items.slice(0, 12).map((z, i) => {
                  const sev = z.zone_status === "严重" ? "#e65100" : z.zone_status === "异常" ? "#d4a050" : z.zone_status === "关注" ? "#1565c0" : "#2e7d32";
                  return (
                    <div key={i} style={{background:"#111e30", border:"1px solid #1a2640", borderRadius:4, padding:"6px 10px", minWidth:100}}>
                      <div style={{fontSize:11, color:"#c8d6e5"}}>{z.side}·{z.part}</div>
                      <div style={{fontSize:10, color:"#5a6d8a"}}>超限{z.exceed_count} 复核{z.severe_count}</div>
                      <span style={{fontSize:10, padding:"1px 5px", borderRadius:2, background:sev, color:"#fff", opacity:0.8}}>{z.zone_status}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {/* 交叉相关 */}
          {crossCorr?.correlations && crossCorr.correlations.length > 0 && (
            <div style={{flex:"1 1 250px", background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
              <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>测项交叉相关</h4>
              {crossCorr.correlations.slice(0, 4).map((c, i) => {
                const clr = c.strength === "强" ? "#e65100" : c.strength === "中等" ? "#d4a050" : "#5a6d8a";
                return (
                  <div key={i} style={{fontSize:11, color:"#98aec9", padding:"3px 0", borderBottom:"1px solid #1a2640"}}>
                    {c.item_a}↔{c.item_b} <span style={{color:clr, fontWeight:600}}>r={c.coefficient?.toFixed(2)}</span>
                    <span style={{color:"#5a6d8a", fontSize:10, marginLeft:6}}>{c.strength}{c.direction}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
      {old_note}
      <div className="mon-status-note">
        <strong>提示：</strong>DSW13 地下水位需人工复核。页面不将「超设计限值」称为「报警」——超限仅表示超过设计参考值，最终判定需结合现场工况。
      </div>
    </div>
  );
}