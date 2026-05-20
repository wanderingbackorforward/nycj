import React, { useEffect, useState, useCallback, useRef } from "react";
import * as echarts from "echarts";
import LoadingState from "../components/status/LoadingState";
import ErrorState from "../components/status/ErrorState";
import { AREA2_API_BASE } from "../config/api";
import { apiGet } from "../api/http";
import type { ApiResult } from "../api/http";

// ---- types ----
interface TunnelingGroup {
  group_code: string; group_name_cn: string;
  parameter_count: number; exceed_count: number;
}
interface TunnelingParam {
  ring_no: number; parameter_name_cn: string;
  value: number;
}
interface PostureConfig {
  configured: boolean;
}
interface PostureData {
  configs?: PostureConfig[];
}

export default function Area2Tunneling() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<TunnelingGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [params, setParams] = useState<TunnelingParam[]>([]);
  const [paramsLoading, setParamsLoading] = useState(false);
  const [postureReady, setPostureReady] = useState(0);

  // ---- 加载分组列表 ----
  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<TunnelingGroup[]>(AREA2_API_BASE + "/tunneling/groups");
      if (res.ok && Array.isArray(res.data)) {
        setGroups(res.data);
        if (res.data.length > 0) setSelectedGroup(res.data[0].group_code);
      } else {
        setError(res.error || "接口连接异常");
      }
    } catch (e) {
      setError("接口连接异常");
    }
    try {
      const pr = await apiGet<PostureData>(AREA2_API_BASE + "/config/posture-deviation");
      if (pr.ok && pr.data?.configs) setPostureReady(pr.data.configs.filter(c => c.configured).length);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  // ---- 加载参数数据 ----
  const loadParams = useCallback(async (group: string) => {
    if (!group) return;
    setParamsLoading(true);
    try {
      const ringRes = await apiGet<any>(AREA2_API_BASE + "/rings");
      const allRings: number[] = [];
      if (ringRes.ok && ringRes.data) {
        const rings = Array.isArray(ringRes.data) ? ringRes.data : (ringRes.data as any).data || ringRes.data || [];
        rings.forEach((r: any) => { if (typeof r.ring_no === "number") allRings.push(r.ring_no); });
      }
      // Pick ~10 evenly spaced rings
      const step = Math.max(1, Math.floor(allRings.length / 10));
      const pickedRings = allRings.filter((_, i) => i % step === 0).slice(0, 12);
      if (pickedRings.length === 0) pickedRings.push(allRings[0] || 1749);

      // Fetch params for each picked ring
      const allParams: any[] = [];
      for (const r of pickedRings) {
        try {
          const pr = await apiGet<any>(AREA2_API_BASE + "/tunneling/parameters?ring_no=" + r + "&limit=100&parameter_group=" + group);
          if (pr.ok && pr.data) {
            const arr = Array.isArray(pr.data) ? pr.data : (pr.data as any).data || [];
            allParams.push(...arr);
          }
        } catch {}
      }
      setParams(allParams);
    } catch {}
    setParamsLoading(false);
  }, []);

  useEffect(() => {
    if (selectedGroup) loadParams(selectedGroup);
  }, [selectedGroup, loadParams]);

  // ---- ECharts ----
  useEffect(() => {
    const el = chartRef.current;
    if (!el || params.length === 0) return;
    
    if (chartInst.current) { try { chartInst.current.dispose(); } catch {} }
    try { chartInst.current = echarts.init(el); } catch { return; }

    const nameSet = new Set(params.map(p => p.parameter_name_cn).filter(Boolean));
    const paramNames = [...nameSet].slice(0, 6);
    const rings = [...new Set(params.map(p => p.ring_no).filter(n => typeof n === "number"))].sort((a, b) => a - b);
    const colors = ["#00d4ff", "#ff8c42", "#2e7d32", "#d4a050", "#7c4dff", "#e65100"];

    chartInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
      legend: { bottom: 0, textStyle: { color: "#7a8ba8", fontSize: 10 }, type: "scroll" },
      grid: { left: 50, right: 20, top: 10, bottom: 40 },
      xAxis: { type: "category", data: rings.map(String), axisLabel: { color: "#5a6d8a", fontSize: 10 }, axisLine: { lineStyle: { color: "#1a2845" } } },
      yAxis: { type: "value", axisLabel: { color: "#5a6d8a", fontSize: 10 }, splitLine: { lineStyle: { color: "#121e36" } } },
      series: paramNames.map((name, idx) => ({
        name, type: "line", smooth: true, symbol: "none",
        lineStyle: { width: 2, color: colors[idx % 6] },
        data: rings.map(r => {
          const m = params.find(p => p.ring_no === r && p.parameter_name_cn === name);
          return typeof m?.value === "number" ? m.value : null;
        }),
      })),
    }, true);
      console.log("echarts rendered:", paramNames.length, "params,", rings.length, "rings");

    let ro: ResizeObserver | null = null;
    try { ro = new ResizeObserver(() => chartInst.current?.resize()); ro.observe(el); } catch {}
    return () => ro?.disconnect();
  }, [params]);

  useEffect(() => () => { try { chartInst.current?.dispose(); } catch {} }, []);

  // ---- render ----
  if (loading) return <LoadingState message="正在加载掘进参数数据..." />;
  if (error && groups.length === 0) return <ErrorState message={error} onRetry={loadGroups} />;

  const totalParams = groups.reduce((s, g) => s + g.parameter_count, 0);
  const totalExceed = groups.reduce((s, g) => s + g.exceed_count, 0);
  const selGroup = groups.find(g => g.group_code === selectedGroup);

  return (
    <div>
      <h2 className="text-base font-semibold mb-1" style={{ color: "#c8d6e5" }}>2工区掘进参数</h2>
      <p className="text-xs mb-4" style={{ color: "#6a7d9e" }}>
        盾构区间 · {totalParams.toLocaleString()}条参数 · {groups.length}个分组 · {totalExceed.toLocaleString()}条超限(P05/P95)
      </p>

      {/* 分组卡片 */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {groups.map(g => {
          const pct = totalParams > 0 ? Math.round(g.parameter_count / totalParams * 100) : 0;
          const sel = g.group_code === selectedGroup;
          return (
            <div key={g.group_code} onClick={() => setSelectedGroup(g.group_code)}
              className="rounded cursor-pointer p-3 flex-1 min-w-[150px]"
              style={{ background: sel ? "#111e30" : "#0f1525", border: sel ? "1px solid #00d4ff" : "1px solid #1a2640" }}>
              <div className="text-xs font-semibold mb-1" style={{ color: sel ? "#00d4ff" : "#98aec9" }}>{g.group_name_cn}</div>
              <div className="flex items-baseline justify-between">
                <span className="text-xl font-bold" style={{ color: "#c8d6e5" }}>{g.parameter_count.toLocaleString()}</span>
                <span className="text-[10px]" style={{ color: "#5a6d8a" }}>条参数</span>
              </div>
              <div className="flex justify-between mt-1 text-[10px]">
                <span style={{ color: g.exceed_count > 0 ? "#e65100" : "#2e7d32" }}>超限 {g.exceed_count.toLocaleString()} 条</span>
                <span style={{ color: "#5a6d8a" }}>{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 趋势图 */}
      <div className="card mb-4">
        <div className="flex justify-between items-center mb-1">
          <h4 className="text-sm font-semibold" style={{ color: "#6a7d9e" }}>{selGroup?.group_name_cn || selectedGroup} · 趋势图</h4>
          <span className="text-[11px]" style={{ color: "#5a6d8a" }}>
            {paramsLoading ? "加载中..." : params.length > 0 ? `前6参数 · ${params.length}条 · ${[...new Set(params.map(p=>p.ring_no))].length}环` : "点击分组加载"}
          </span>
        </div>
        <p className="text-[10px] mb-1" style={{ color: "#5a6d8a" }}>
          阈值来源：P05/P95统计推导（非工程设计值），{selGroup?.exceed_count || 0}条超限需工程判断
        </p>
        <div style={{ height: 300, minHeight: 300, position: "relative" }}>
          <div ref={chartRef} style={{ width: "100%", height: "100%" }} />
          {params.length === 0 && !paramsLoading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#5a6d8a", fontSize: 14 }}>点击上方分组查看趋势图</div>
          )}
        </div>
      </div>

      {/* 建议动作 */}
      <div className="card card-accent mb-4">
        <h3 className="text-sm font-semibold mb-2" style={{ color: "#00d4ff" }}>建议动作</h3>
        <div className="text-xs" style={{ color: "#98aec9" }}>
          <p>1. 核对姿态/油缸行程分组的超限——该组直接影响盾构姿态和管片拼装质量</p>
          <p>2. 将P05/P95统计阈值替换为厂家提供的正式参数控制范围</p>
          <p>3. 姿态偏差限值已配置{postureReady}/6类（GB50446），建议根据本项目设计文件确认</p>
        </div>
      </div>

      {/* 数据缺口 */}
      <div className="card">
        <h3 className="text-sm font-semibold mb-2" style={{ color: "#6a7d9e" }}>数据缺口</h3>
        <div className="flex gap-2.5 flex-wrap">
          {["参数阈值全部基于统计推导非PLC或设计文件中的正式限值", "6类姿态偏差限值已配置缺少本项目设计文件具体要求", "33环里程已推算未与导向系统数据交叉验证"].map((d, i) => (
            <div key={i} className="flex-1 min-w-[180px] rounded p-2.5" style={{ background: "#1a1210", border: "1px solid #5a3a1a" }}>
              <div className="text-[11px] mb-1" style={{ color: "#d4a050" }}>{["参数限值", "姿态偏差", "环号-里程"][i]}</div>
              <div className="text-[10px]" style={{ color: "#5a6d8a" }}>{d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
