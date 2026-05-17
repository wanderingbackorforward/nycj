import React, { useEffect, useState, useCallback, useRef } from "react";
import * as echarts from "echarts";
import LoadingState from "../components/status/LoadingState";
import ErrorState from "../components/status/ErrorState";
import { fetchArea2TunnelingGroups, fetchArea2TunnelingParams } from "../api/area2";
import type { Area2TunnelingGroup, Area2TunnelingParameter } from "../api/area2";

export default function Area2Tunneling() {
  const chartRef = useRef<HTMLDivElement>(null);
  const heatRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const heatInstance = useRef<echarts.ECharts | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Area2TunnelingGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [params, setParams] = useState<Area2TunnelingParameter[]>([]);
  const [paramsLoading, setParamsLoading] = useState(false);

  const loadMeta = useCallback(async () => {
    setLoading(true);
    const grpRes = await fetchArea2TunnelingGroups();
    if (grpRes.ok && grpRes.data) {
      setGroups(grpRes.data);
      if (grpRes.data.length > 0) setSelectedGroup(String(grpRes.data[0].group_code || ""));
    } else setError("接口连接异常");
    setLoading(false);
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  const loadParams = useCallback(async (group: string) => {
    if (!group) return;
    setParamsLoading(true);
    const res = await fetchArea2TunnelingParams("group=" + encodeURIComponent(group));
    if (res.ok && res.data) setParams(res.data);
    setParamsLoading(false);
  }, []);

  useEffect(() => { if (selectedGroup) loadParams(selectedGroup); }, [selectedGroup, loadParams]);

  // ---- 参数趋势多线折线图 ----
  useEffect(() => {
    if (!chartRef.current || params.length === 0) return;
    if (!chartInstance.current) chartInstance.current = echarts.init(chartRef.current, "dark");

    const nameSet = new Set<string>();
    for (const p of params) { const n = p.parameter_name_cn || p.parameter_name; if (n) nameSet.add(String(n)); }
    const paramNames = Array.from(nameSet);

    const ringSet = new Set<number>();
    for (const p of params) { if (typeof p.ring_no === "number") ringSet.add(p.ring_no); }
    const sortedRings = Array.from(ringSet).sort((a, b) => a - b);

    const series: echarts.SeriesOption[] = paramNames.map((name) => {
      const data: (number | null)[] = sortedRings.map(ring => {
        const match = params.find(p => p.ring_no === ring && String(p.parameter_name_cn || p.parameter_name) === name);
        return typeof match?.value === "number" ? match.value : null;
      });
      return { name, type: "line", data, smooth: true, symbol: "circle", symbolSize: 4, lineStyle: { width: 2 } };
    });

    chartInstance.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
      legend: { top: 8, textStyle: { color: "#7a8ba8", fontSize: 10 }, type: "scroll" },
      grid: { left: 50, right: 20, top: 40, bottom: 30 },
      xAxis: { type: "category", data: sortedRings.map(r => String(r)), axisLabel: { color: "#5a6d8a", fontSize: 11 }, axisLine: { lineStyle: { color: "#1a2845" } }, name: "环号", nameTextStyle: { color: "#5a6d8a", fontSize: 11 } },
      yAxis: { type: "value", axisLabel: { color: "#5a6d8a", fontSize: 11 }, splitLine: { lineStyle: { color: "#121e36" } } },
      series,
    }, true);
    const h = () => chartInstance.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [params]);

  // ---- 环号覆盖热力矩阵 ----
  useEffect(() => {
    if (!heatRef.current || params.length === 0) return;
    if (!heatInstance.current) heatInstance.current = echarts.init(heatRef.current, "dark");

    const nameSet = new Set<string>();
    for (const p of params) { const n = p.parameter_name_cn || p.parameter_name; if (n) nameSet.add(String(n)); }
    const paramNames = Array.from(nameSet).slice(0, 12);

    const ringSet = new Set<number>();
    for (const p of params) { if (typeof p.ring_no === "number") ringSet.add(p.ring_no); }
    const sortedRings = Array.from(ringSet).sort((a, b) => a - b);

    // Build matrix: 1 if data exists, 0 if missing
    const heatData: [number, number, number][] = [];
    for (let ri = 0; ri < sortedRings.length; ri++) {
      for (let pi = 0; pi < paramNames.length; pi++) {
        const has = params.some(p => p.ring_no === sortedRings[ri] && String(p.parameter_name_cn || p.parameter_name) === paramNames[pi]);
        heatData.push([ri, pi, has ? 1 : 0]);
      }
    }

    heatInstance.current.setOption({
      backgroundColor: "transparent",
      tooltip: {
        backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 },
        formatter: (p: { value: number[] }) => {
          const ring = sortedRings[p.value[0]];
          const param = paramNames[p.value[1]];
          const has = p.value[2] === 1 ? "有数据" : "缺数据";
          return "环号 " + ring + "<br/>参数: " + param + "<br/>" + has;
        }
      },
      grid: { left: 140, right: 40, top: 10, bottom: 40 },
      xAxis: { type: "category", data: sortedRings.map(r => String(r)), axisLabel: { color: "#5a6d8a", fontSize: 9, rotate: 45 }, axisLine: { lineStyle: { color: "#1a2845" } }, position: "top" },
      yAxis: { type: "category", data: paramNames, axisLabel: { color: "#8a9bb5", fontSize: 10, width: 120, overflow: "truncate" }, axisLine: { lineStyle: { color: "#1a2845" } } },
      visualMap: { min: 0, max: 1, calculable: false, orient: "horizontal", left: "center", bottom: 0, inRange: { color: ["#1a2845", "#00d4ff"] }, show: false },
      series: [{ type: "heatmap", data: heatData, label: { show: false }, itemStyle: { borderWidth: 1, borderColor: "#0a0e1a" } }],
    }, true);
    const h = () => heatInstance.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [params]);

  useEffect(() => { return () => { chartInstance.current?.dispose(); heatInstance.current?.dispose(); }; }, []);

  if (loading) return <LoadingState message="正在加载掘进参数数据..." />;
  if (error && groups.length === 0) return <ErrorState message={error} onRetry={loadMeta} />;

  const selectedGroupInfo = groups.find(g => g.group_code === selectedGroup);

  return (
    <div className="page-area2-tunneling">
      <h2 className="page-title">2工区掘进参数</h2>
      <p className="page-desc">分析推进、刀盘、泥水、注浆、姿态相关参数。环号范围1717~1749。</p>

      <div className="param-selector">
        <label>参数分组：</label>
        <select className="param-select" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
          {groups.map(g => (
            <option key={String(g.group_code)} value={String(g.group_code)}>
              {String(g.group_name_cn || g.group_code || "") + " · " + ((g.parameter_count || 0).toLocaleString()) + " 条 / " + (g.ring_count || 0) + " 环"}
            </option>
          ))}
        </select>
        {paramsLoading && <span className="loading-text">加载中...</span>}
        {selectedGroupInfo && !paramsLoading && (
          <span className="group-info-text">
            {"共" + (selectedGroupInfo.parameter_count?.toLocaleString() || "0") + " 条参数，" + (selectedGroupInfo.ring_count || 0) + " 环" + (selectedGroupInfo.exceed_count != null ? "（超限" + selectedGroupInfo.exceed_count + "条）" : "")}
          </span>
        )}
      </div>

      {/* ======== Row 1: 参数趋势图 ======== */}
      <div className="chart-container" ref={chartRef} style={{height:380}}>
        {params.length === 0 && !paramsLoading && <div className="chart-placeholder">选择参数分组后显示趋势图</div>}
      </div>

      {/* ======== Row 2: 环号覆盖热力矩阵 ======== */}
      <section style={{marginBottom:16, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
        <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>参数×环号 覆盖矩阵（深色=有数据，暗色=缺失）</h4>
        <p style={{color:"#4a5a6e", fontSize:11, marginBottom:6}}>纵轴=参数名（最多12项），横轴=环号；悬停查看详情</p>
        <div ref={heatRef} style={{height: Math.max(200, Math.min(12, new Set(params.map(p => p.parameter_name_cn || p.parameter_name)).size) * 22 + 50)}} />
      </section>

      {/* ======== Row 3: 数据缺口 ======== */}
      <section className="status-section">
        <h3 style={{color:"#6a7d9e", fontSize:14, marginBottom:8}}>数据缺口</h3>
        <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
          {[
            { cat: "阈值来源", desc: "当前为P05/P95统计推导阈值", impact: "超限判断非正式报警", action: "从设计规范补充正式参数限值" },
            { cat: "姿态", desc: "缺少正式姿态诊断阈值", impact: "姿态偏差仅展示无诊断", action: "获取设计姿态偏差限值" },
            { cat: "映射", desc: "缺少环号-里程映射", impact: "无法关联监测点空间位置", action: "获取盾构导向数据" },
          ].map((g, i) => (
            <div key={i} style={{flex:"1 1 200px", background:"#1a1210", border:"1px solid #5a3a1a", borderRadius:4, padding:"10px 12px"}}>
              <div style={{fontSize:11, color:"#d4a050", fontWeight:600, marginBottom:4}}>{g.cat}</div>
              <div style={{fontSize:11, color:"#8a6d5a", marginBottom:2}}>{g.desc}</div>
              <div style={{fontSize:10, color:"#5a4a2a"}}>{"→ " + g.action}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="mon-status-note" style={{marginTop:12}}>
        掘进参数阈值来源：P05/P95统计推导（非工程设计值）。超限仅表示超出统计范围，不作为正式报警。
      </div>
    </div>
  );
}