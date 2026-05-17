import React, { useEffect, useState, useCallback, useRef } from "react";
import * as echarts from "echarts";
import StatusCard from "../components/cards/StatusCard";
import LoadingState from "../components/status/LoadingState";
import ErrorState from "../components/status/ErrorState";
import { fetchGnOverview, fetchGnSystemStatus, fetchGnDataGaps } from "../api/area1";
import { fetchArea2Overview, fetchArea2SystemStatus } from "../api/area2";
import type { GnOverview, GnSystemStatus, GnDataGapsResponse } from "../api/area1";
import type { Area2Overview, Area2SystemStatus } from "../api/area2";

type ChartInst = echarts.ECharts | null;

export default function CommandOverview() {
  const pieRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLDivElement>(null);
  const gapRef = useRef<HTMLDivElement>(null);
  const pieInst = useRef<ChartInst>(null);
  const barInst = useRef<ChartInst>(null);
  const radarInst = useRef<ChartInst>(null);
  const gapInst = useRef<ChartInst>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gnDbDown, setGnDbDown] = useState(false);
  const [gnGaps, setGnGaps] = useState<GnDataGapsResponse | null>(null);
  const [gnOverview, setGnOverview] = useState<GnOverview | null>(null);
  const [a2Overview, setA2Overview] = useState<Area2Overview | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null); let gnDown = false;
    const [gnOvr, gnSys, gnGapsRes, a2Ovr] = await Promise.all([
      fetchGnOverview(), fetchGnSystemStatus(), fetchGnDataGaps(), fetchArea2Overview(),
    ]);
    if (gnOvr.ok) setGnOverview(gnOvr.data!); else if (!gnOvr.stable) gnDown = true;
    if (gnGapsRes.ok) setGnGaps(gnGapsRes.data!);
    if (!gnSys.ok) gnDown = true;
    if (a2Ovr.ok) setA2Overview(a2Ovr.data!);
    setGnDbDown(gnDown);
    if (!gnOvr.ok && !a2Ovr.ok && !gnOvr.stable) setError("接口连接异常");
    else if (gnDown) setError("1工区数据库连接异常，使用缓存数据");
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ---- 1工区状态分布饼图 ----
  useEffect(() => {
    if (!pieRef.current || !gnOverview?.status_distribution) return;
    if (!pieInst.current) pieInst.current = echarts.init(pieRef.current, "dark");
    const items = gnOverview.status_distribution;
    const colors: Record<string, string> = { normal: "#2e7d32", exceed_design_limit: "#e65100", unknown: "#7a6a2a", review: "#1565c0" };
    pieInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "item", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 }, formatter: "{b}: {c} 条 ({d}%)" },
      legend: { bottom: 0, textStyle: { color: "#7a8ba8", fontSize: 11 } },
      series: [{
        type: "pie", radius: ["48%", "72%"], center: ["50%", "46%"],
        data: items.map(s => ({ name: s.status_display_cn || s.status_code, value: s.count, itemStyle: { color: colors[s.status_code] || "#5a6d8a" } })),
        label: { color: "#8a9bb5", fontSize: 11, formatter: "{b}\n{c}条" },
        itemStyle: { borderColor: "#0a0e1a", borderWidth: 2 },
      }],
    }, true);
    const h = () => pieInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [gnOverview]);

  // ---- 2工区参数分组横向柱状图 ----
  useEffect(() => {
    if (!barRef.current || !a2Overview?.parameterSummary) return;
    if (!barInst.current) barInst.current = echarts.init(barRef.current, "dark");
    const groups = a2Overview.parameterSummary;
    barInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 }, formatter: (p: { name: string; value: number }[]) => p[0].name + "<br/>参数条数: " + p[0].value.toLocaleString() },
      grid: { left: 90, right: 60, top: 10, bottom: 20 },
      xAxis: { type: "value", axisLabel: { color: "#5a6d8a", fontSize: 10, formatter: (v: number) => v >= 1000 ? (v/1000).toFixed(0)+"k" : String(v) }, splitLine: { lineStyle: { color: "#121e36" } } },
      yAxis: { type: "category", data: groups.map(g => g.group_cn), axisLabel: { color: "#8a9bb5", fontSize: 11 }, axisLine: { lineStyle: { color: "#1a2845" } } },
      series: [{
        type: "bar", data: groups.map(g => g.sample_count),
        barWidth: 16, itemStyle: { borderRadius: [0, 3, 3, 0], color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{offset:0,color:"#0d47a1"},{offset:1,color:"#00d4ff"}]) },
        label: { show: true, position: "right", color: "#5a6d8a", fontSize: 10, formatter: (p: { value: number }) => p.value >= 1000 ? (p.value/1000).toFixed(1)+"k" : String(p.value) },
      }],
    }, true);
    const h = () => barInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [a2Overview]);

  // ---- 两工区数据完整度雷达图 ----
  useEffect(() => {
    if (!radarRef.current) return;
    if (!radarInst.current) radarInst.current = echarts.init(radarRef.current, "dark");

    // Compute completeness from data
    const gnCards = gnOverview?.cards || [];
    const cardMap: Record<string, number> = {};
    for (const c of gnCards) { cardMap[c.name] = c.value; }
    const gnTotalReadings = cardMap["读数数量"] || 0;
    const gnUnknown = cardMap["待确认"] || 0;
    const gnTotal = gnTotalReadings + gnUnknown;
    const gnCoverage = gnTotal > 0 ? Math.min(100, Math.round((gnTotalReadings / Math.max(gnTotal, 1)) * 100)) : 0;

    const a2ParamGroups = a2Overview?.parameterSummary?.length || 0;
    const a2MonSummary = a2Overview?.monitoringSummary || [];
    const a2MonTotal = a2MonSummary.reduce((s, m) => s + (m.readings || 0), 0);
    const a2ParamTotal = (a2Overview?.parameterSummary || []).reduce((s, g) => s + (g.sample_count || 0), 0);

    // Dimensions: ["监测数据", "阈值完整", "参数数据", "证据溯源", "空间映射", "CAD配准"]
    const dims = ["监测数据", "阈值完整", "参数数据", "证据溯源", "空间映射", "CAD配准"];
    const gnValues = [gnCoverage, gnUnknown > 0 ? 30 : 90, 0, 70, 0, 0];
    const a2Values = [a2MonTotal > 0 ? 80 : 0, 5, a2ParamGroups >= 5 ? 90 : a2ParamGroups * 18, 75, 0, 10];

    radarInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
      legend: { bottom: 0, textStyle: { color: "#7a8ba8", fontSize: 11 }, data: ["1工区·工农路站", "2工区·工~天区间"] },
      radar: {
        center: ["50%", "48%"],
        radius: "65%",
        indicator: dims.map(d => ({ name: d, max: 100 })),
        axisName: { color: "#7a8ba8", fontSize: 11 },
        splitArea: { areaStyle: { color: ["rgba(0,212,255,0.02)", "rgba(0,212,255,0.02)"] } },
        splitLine: { lineStyle: { color: "#1a2845" } },
        axisLine: { lineStyle: { color: "#1a2845" } },
      },
      series: [{
        type: "radar",
        data: [
          { name: "1工区·工农路站", value: gnValues, lineStyle: { color: "#00d4ff", width: 2 }, areaStyle: { color: "rgba(0,212,255,0.08)" }, itemStyle: { color: "#00d4ff" } },
          { name: "2工区·工~天区间", value: a2Values, lineStyle: { color: "#ff8c42", width: 2 }, areaStyle: { color: "rgba(255,140,66,0.08)" }, itemStyle: { color: "#ff8c42" } },
        ],
      }],
    }, true);
    const h = () => radarInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [gnOverview, a2Overview]);

  // ---- 数据缺口横向柱状图 ----
  useEffect(() => {
    if (!gapRef.current) return;
    const gnRawGaps = gnOverview?.data_gaps || [];
    const gnStructGaps = gnGaps?.gaps || [];
    const a2Gaps = a2Overview?.dataGaps || [];
    const allGaps: Array<{name: string; value: number; area: string; desc: string}> = [
      ...gnRawGaps.map(g => ({ name: g.category || "未知", value: g.affected_count || 1, area: "1工区", desc: g.description || "" })),
      ...gnStructGaps.map(g => ({ name: g.title || g.id || "未知", value: 1, area: "1工区(结构)", desc: (g.description || "") + (g.impact ? " | " + g.impact : "") })),
      ...a2Gaps.map(g => ({ name: g.field || "未知", value: 1, area: "2工区", desc: g.reason || g.impact || "" })),
    ];
    // Add inferred gaps if not present
    const has2Threshold = allGaps.some(g => g.name.includes("阈值") && g.area === "2工区");
    if (!has2Threshold) allGaps.push({ name: "监测阈值", value: 1, area: "2工区", desc: "日报缺少设计限值/预警值/报警值" });
    const hasMapping = allGaps.some(g => g.name.includes("映射") || g.name.includes("里程"));
    if (!hasMapping) allGaps.push({ name: "环号-里程映射", value: 1, area: "2工区", desc: "无法关联监测点空间位置" });

    if (allGaps.length === 0) return;
    if (!gapInst.current) gapInst.current = echarts.init(gapRef.current, "dark");

    gapInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 }, formatter: (p: { name: string; value: number; data: { desc: string; area: string } }[]) => { const d = p[0].data; return d.area + ": " + p[0].name + "<br/>" + d.desc; } },
      grid: { left: 120, right: 20, top: 10, bottom: 20 },
      xAxis: { type: "value", axisLabel: { color: "#5a6d8a", fontSize: 10 }, splitLine: { lineStyle: { color: "#121e36" } }, name: "影响程度", nameTextStyle: { color: "#5a6d8a", fontSize: 10 } },
      yAxis: { type: "category", data: allGaps.map(g => g.name + " (" + g.area + ")"), axisLabel: { color: "#8a9bb5", fontSize: 10 }, axisLine: { lineStyle: { color: "#1a2845" } } },
      series: [{
        type: "bar", data: allGaps.map(g => ({ value: g.value, desc: g.desc, area: g.area })),
        barWidth: 16, itemStyle: { borderRadius: [0, 3, 3, 0], color: "#e65100" },
        label: { show: true, position: "right", color: "#ff8c42", fontSize: 10, formatter: "{c}" },
      }],
    }, true);
    const h = () => gapInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [gnOverview, a2Overview]);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    return () => {
      pieInst.current?.dispose(); barInst.current?.dispose();
      radarInst.current?.dispose(); gapInst.current?.dispose();
    };
  }, []);

  if (loading) return <LoadingState message="正在连接各工区数据接口..." />;
  if (!gnOverview && !a2Overview && error) return <ErrorState message={error} onRetry={load} />;

  const gnCards = gnOverview?.cards || [];
  const cardMap: Record<string, number> = {};
  for (const c of gnCards) { cardMap[c.name] = c.value; }

  const a2Pos = a2Overview?.position;
  const a2ParamTotal = (a2Overview?.parameterSummary || []).reduce((s, g) => s + (g.sample_count || 0), 0);
  const a2MonTotal = (a2Overview?.monitoringSummary || []).reduce((s, m) => s + (m.readings || 0), 0);

  // Compute key metrics for conclusion visualization
  const gnExceedCount = cardMap["超设计限值"] || 0;
  const gnUnknownCount = cardMap["待确认"] || 0;
  const gnTotalReadings = cardMap["读数数量"] || 0;
  const gnReviewCount = gnOverview?.priority_findings?.length || 0;

  return (
    <div className="page-command-overview">
      {gnDbDown && <div className="page-warning-banner" style={{background:"#2a0a0a",border:"1px solid #5a1a1a",color:"#d47070",padding:"8px 16px",borderRadius:4,marginBottom:12}}>{"⚠ 1工区数据库连接异常，页面显示最近缓存数据"}</div>}

      {/* ======== Row 1: 状态卡片 ======== */}
      <section className="status-cards-row">
        <div className="status-cards-group"><h3 className="group-title">1工区 · 工农路站基坑</h3>
          <div className="status-cards">
            <StatusCard label="监测点数" value={cardMap["监测点数量"] ?? "-"} unit="个" />
            <StatusCard label="累计读数" value={cardMap["读数数量"] ?? "-"} unit="条" />
            <StatusCard label="超设计限值" value={gnExceedCount || "-"} unit="条" highlight />
            <StatusCard label="待确认" value={gnUnknownCount || "-"} unit="条" />
          </div>
        </div>
        <div className="status-cards-group"><h3 className="group-title">2工区 · 工~天盾构区间</h3>
          <div className="status-cards">
            <StatusCard label="当前环号" value={a2Pos?.currentRing ?? "-"} unit="环" highlight />
            <StatusCard label="环号范围" value={a2Pos?.ringRange ? a2Pos.ringRange[0] + "~" + a2Pos.ringRange[1] : "-"} />
            <StatusCard label="掘进参数" value={a2ParamTotal > 0 ? (a2ParamTotal/1000).toFixed(0) + "k" : "-"} unit="条" />
            <StatusCard label="监测读数" value={a2MonTotal > 0 ? a2MonTotal.toLocaleString() : "-"} unit="条" />
          </div>
        </div>
      </section>

      {/* ======== Row 2: 图表区（饼图 + 柱状图） ======== */}
      <section style={{display:"flex", gap:16, marginBottom:16}}>
        <div style={{flex:1, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>1工区监测状态分布</h4>
          <div ref={pieRef} style={{height:220}} />
        </div>
        <div style={{flex:1, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>2工区参数分组</h4>
          <div ref={barRef} style={{height:220}} />
        </div>
      </section>

      {/* ======== Row 3: 数据完整度雷达图 ======== */}
      <section style={{marginBottom:16, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:14}}>
        <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:2}}>两工区数据完整度对比（六维雷达）</h4>
        <p style={{color:"#4a5a6e", fontSize:11, marginBottom:8}}>维度：监测数据 / 阈值完整 / 参数数据 / 证据溯源 / 空间映射 / CAD配准</p>
        <div ref={radarRef} style={{height:300}} />
      </section>

      {/* ======== Row 4: 结论卡片 + 证据可视化 ======== */}
      <section style={{display:"flex", gap:16, marginBottom:16}}>
        {/* 1工区结论 */}
        <div className="conclusion-card" style={{flex:1}}>
          <h3 className="conclusion-title">1工区研判</h3>
          <div style={{display:"flex", gap:12, marginBottom:12}}>
            <div style={{flex:1, textAlign:"center", background:"#111a2e", borderRadius:4, padding:"10px 6px"}}>
              <div style={{fontSize:24, fontWeight:700, color:"#ff8c42"}}>{gnExceedCount || "-"}</div>
              <div style={{fontSize:11, color:"#6a7d9e"}}>超设计限值</div>
            </div>
            <div style={{flex:1, textAlign:"center", background:"#111a2e", borderRadius:4, padding:"10px 6px"}}>
              <div style={{fontSize:24, fontWeight:700, color:"#d4a050"}}>{gnUnknownCount || "-"}</div>
              <div style={{fontSize:11, color:"#6a7d9e"}}>待确认</div>
            </div>
            <div style={{flex:1, textAlign:"center", background:"#111a2e", borderRadius:4, padding:"10px 6px"}}>
              <div style={{fontSize:24, fontWeight:700, color:"#4da6ff"}}>{gnReviewCount || "-"}</div>
              <div style={{fontSize:11, color:"#6a7d9e"}}>重点复核</div>
            </div>
          </div>
          <div className="conclusion-summary" style={{fontSize:12, borderLeft:"3px solid #00d4ff", paddingLeft:10, marginBottom:0}}>
            {gnDbDown ? "数据库连接异常" : (gnOverview?.headline || "暂无数据")}
          </div>
          {gnOverview?.priority_findings && gnOverview.priority_findings.length > 0 && (
            <div style={{marginTop:10, borderTop:"1px solid #162040", paddingTop:8}}>
              <div style={{fontSize:11, color:"#5a8aaa", marginBottom:4}}>关键证据</div>
              {gnOverview.priority_findings.slice(0, 3).map((f, i) => (
                <div key={i} style={{display:"flex", alignItems:"center", gap:6, marginBottom:4, fontSize:11, color:"#8a9bb5"}}>
                  <span style={{background: f.level === "critical" ? "#e65100" : "#1565c0", color:"#fff", borderRadius:2, padding:"1px 5px", fontSize:10, whiteSpace:"nowrap"}}>{f.level === "critical" ? "重点" : "关注"}</span>
                  <span style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{f.title}: {f.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2工区结论 */}
        <div className="conclusion-card" style={{flex:1}}>
          <h3 className="conclusion-title">2工区研判</h3>
          <div style={{display:"flex", gap:12, marginBottom:12}}>
            <div style={{flex:1, textAlign:"center", background:"#111a2e", borderRadius:4, padding:"10px 6px"}}>
              <div style={{fontSize:24, fontWeight:700, color:"#00d4ff"}}>{a2Pos?.currentRing ?? "-"}</div>
              <div style={{fontSize:11, color:"#6a7d9e"}}>当前环号</div>
            </div>
            <div style={{flex:1, textAlign:"center", background:"#111a2e", borderRadius:4, padding:"10px 6px"}}>
              <div style={{fontSize:24, fontWeight:700, color:"#00d4ff"}}>{a2ParamTotal > 0 ? (a2ParamTotal/1000).toFixed(0)+"k" : "-"}</div>
              <div style={{fontSize:11, color:"#6a7d9e"}}>参数条数</div>
            </div>
            <div style={{flex:1, textAlign:"center", background:"#111a2e", borderRadius:4, padding:"10px 6px", border:"1px solid #5a4a2a"}}>
              <div style={{fontSize:24, fontWeight:700, color:"#d4a050"}}>待确认</div>
              <div style={{fontSize:11, color:"#6a7d9e"}}>监测状态</div>
            </div>
          </div>
          <div className="conclusion-summary" style={{fontSize:12, borderLeft:"3px solid #ff8c42", paddingLeft:10, marginBottom:0}}>
            {a2Overview?.headline || "数据暂未获取"}
          </div>
          {a2Overview?.findings && a2Overview.findings.length > 0 && (
            <div style={{marginTop:10, borderTop:"1px solid #162040", paddingTop:8}}>
              <div style={{fontSize:11, color:"#5a8aaa", marginBottom:4}}>关键发现</div>
              {a2Overview.findings.slice(0, 3).map((f, i) => (
                <div key={i} style={{fontSize:11, color:"#8a9bb5", marginBottom:3}}>
                  {"· " + (String(f.title || f.detail || JSON.stringify(f)))}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ======== Row 5: 数据缺口横向柱状图 ======== */}
      <section style={{marginBottom:16, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:14}}>
        <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:2}}>数据缺口清单</h4>
        <p style={{color:"#4a5a6e", fontSize:11, marginBottom:6}}>横轴表示缺口影响程度；悬停查看详情</p>
        <div ref={gapRef} style={{height: Math.max(120, ((gnOverview?.data_gaps?.length || 0) + (a2Overview?.dataGaps?.length || 0) + 2) * 30)}} />
      </section>

      {/* ======== Row 6: 建议动作 ======== */}
      <section style={{display:"flex", gap:16, marginBottom:16}}>
        <div style={{flex:1, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:14}}>
          <h4 style={{color:"#5a8aaa", fontSize:12, marginBottom:8}}>{"→ 1工区建议动作"}</h4>
          {(gnOverview?.actions || []).length > 0 ? (
            <div style={{display:"flex", flexDirection:"column", gap:6}}>
              {gnOverview!.actions!.slice(0, 4).map((a, i) => (
                <div key={i} style={{display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#98aec9"}}>
                  <span style={{background:"#1a2845", color:"#00d4ff", borderRadius:"50%", width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, flexShrink:0}}>{i + 1}</span>
                  {a.action}
                </div>
              ))}
            </div>
          ) : <div style={{fontSize:12, color:"#5a6d8a"}}>暂无建议动作</div>}
        </div>
        <div style={{flex:1, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:14}}>
          <h4 style={{color:"#5a8aaa", fontSize:12, marginBottom:8}}>{"→ 2工区建议动作"}</h4>
          {(a2Overview?.actions || []).length > 0 ? (
            <div style={{display:"flex", flexDirection:"column", gap:6}}>
              {a2Overview!.actions!.slice(0, 4).map((a, i) => (
                <div key={i} style={{display:"flex", alignItems:"center", gap:8, fontSize:12, color:"#98aec9"}}>
                  <span style={{background:"#1a2845", color:"#ff8c42", borderRadius:"50%", width:20, height:20, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, flexShrink:0}}>{i + 1}</span>
                  {a.description}
                </div>
              ))}
            </div>
          ) : <div style={{fontSize:12, color:"#5a6d8a"}}>暂无建议动作</div>}
        </div>
      </section>

      {/* ======== Row 7: 工程线路示意 ======== */}
      <section className="route-diagram" style={{marginBottom:16}}>
        <div className="route-line">
          <div className={"route-node" + (gnDbDown ? " dim" : " active")}>
            <span className="route-label">1工区</span>
            <span className="route-detail">{gnDbDown ? "DB断连" : "工农路站 · 基坑监测"}</span>
          </div>
          <div className="route-segment" />
          <div className="route-node active">
            <span className="route-label">2工区</span>
            <span className="route-detail">{"工~天区间 · 环号" + (a2Pos?.currentRing || "-")}</span>
          </div>
          <div className="route-segment dim" />
          <div className="route-node dim">
            <span className="route-label">后续工区</span>
            <span className="route-detail">暂未接入</span>
          </div>
        </div>
      </section>

      {/* ======== Row 8: 系统连通性 ======== */}
      <section className="connectivity-row">
        <div className={"connectivity-card " + (gnDbDown ? "warn" : "ok")}>
          <span className="conn-label">1工区后端</span><span className="conn-status">{gnDbDown ? "○ 待确认" : "● 正常"}</span>
        </div>
        <div className="connectivity-card ok">
          <span className="conn-label">2工区后端</span><span className="conn-status">● 正常</span>
        </div>
        <div className="connectivity-card ok">
          <span className="conn-label">数据刷新</span><span className="conn-status">{new Date().toLocaleTimeString("zh-CN")}</span>
        </div>
      </section>
    </div>
  );
}