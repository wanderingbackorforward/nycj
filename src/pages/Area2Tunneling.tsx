import React, { useEffect, useState, useCallback, useRef } from "react";
import * as echarts from "echarts";
import LoadingState from "../components/status/LoadingState";
import ErrorState from "../components/status/ErrorState";
import { fetchArea2TunnelingGroups, fetchArea2TunnelingParams, fetchArea2PostureDeviation } from "../api/area2";
import type { Area2TunnelingGroup, Area2TunnelingParameter, Area2PostureDeviationConfig } from "../api/area2";

export default function Area2Tunneling() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Area2TunnelingGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [params, setParams] = useState<Area2TunnelingParameter[]>([]);
  const [paramsLoading, setParamsLoading] = useState(false);
  const [posture, setPosture] = useState<Area2PostureDeviationConfig | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const grpRes = await fetchArea2TunnelingGroups();
      if (grpRes.ok && Array.isArray(grpRes.data) && grpRes.data.length > 0) { setGroups(grpRes.data); setSelectedGroup(String(grpRes.data[0].group_code ?? "")); }
      else { setError(grpRes.error ?? "接口连接异常"); }
    } catch (e) { console.error("groups:", e); setError("接口连接异常"); }
    try { const posRes = await fetchArea2PostureDeviation(); if (posRes.ok && posRes.data) setPosture(posRes.data); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (selectedGroup) loadParams(selectedGroup); }, [selectedGroup]);

  const loadParams = useCallback(async (group: string) => {
    if (!group) return; setParamsLoading(true);
    try { const res = await fetchArea2TunnelingParams("limit=5000&parameter_group=" + encodeURIComponent(group)); if (res.ok && Array.isArray(res.data)) setParams(res.data); } catch {}
    setParamsLoading(false);
  }, []);

  // ECharts 安全初始化: 容器尺寸检查 + ResizeObserver + 完整错误处理
  useEffect(() => {
    const container = chartRef.current;
    if (!container || !Array.isArray(params) || params.length === 0) return;

    if (container.clientWidth === 0 || container.clientHeight === 0) return;

    if (chartInst.current) {
      try { chartInst.current.dispose(); } catch { /* ignore */ }
      chartInst.current = null;
    }

    try {
      chartInst.current = echarts.init(container);
    } catch {
      return;
    }

    const nameSet = new Set<string>();
    for (const p of params) { const n = p.parameter_name_cn || p.parameter_name; if (n) nameSet.add(String(n)); }
    const paramNames = Array.from(nameSet).slice(0, 6);
    const ringSet = new Set<number>();
    for (const p of params) { if (typeof p.ring_no === "number") ringSet.add(p.ring_no); }
    const sortedRings = Array.from(ringSet).sort((a, b) => a - b);
    const colors = ["#00d4ff", "#ff8c42", "#2e7d32", "#d4a050", "#7c4dff", "#e65100"];

    chartInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
      legend: { bottom: 0, textStyle: { color: "#7a8ba8", fontSize: 10 }, type: "scroll" },
      grid: { left: 50, right: 20, top: 10, bottom: 40 },
      xAxis: { type: "category", data: sortedRings.map(r => String(r)), axisLabel: { color: "#5a6d8a", fontSize: 10 }, axisLine: { lineStyle: { color: "#1a2845" } } },
      yAxis: { type: "value", axisLabel: { color: "#5a6d8a", fontSize: 10 }, splitLine: { lineStyle: { color: "#121e36" } }, name: "参数值", nameTextStyle: { color: "#5a6d8a" } },
      series: paramNames.map((name, idx) => ({
        name, type: "line", smooth: true, symbol: "none",
        lineStyle: { width: 2, color: colors[idx % 6] },
        data: sortedRings.map(ring => {
          const m = params.find(p => p.ring_no === ring && String(p.parameter_name_cn || p.parameter_name) === name);
          return typeof m?.value === "number" ? m.value : null;
        }),
      })),
    }, true);

    // ResizeObserver 比 window.resize 更可靠
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => { try { chartInst.current?.resize(); } catch { /* ignore */ } });
      ro.observe(container);
    } catch { /* ignore */ }

    return () => { ro?.disconnect(); };
  }, [params]);

  useEffect(() => {
    return () => {
      try { chartInst.current?.dispose(); } catch { /* ignore */ }
      chartInst.current = null;
    };
  }, []);

  if (loading) return <LoadingState message="正在加载掘进参数数据..." />;
  if (error && groups.length === 0) return <ErrorState message={error} onRetry={load} />;

  const totalParams = groups.reduce((s, g) => s + (g.parameter_count || 0), 0);
  const totalExceed = groups.reduce((s, g) => s + (g.exceed_count || 0), 0);
  const topExceedGroup = [...groups].sort((a, b) => (b.exceed_count || 0) - (a.exceed_count || 0))[0];
  const exceedPct = totalParams > 0 ? ((totalExceed / totalParams) * 100).toFixed(1) : "0";
  const selectedGroupInfo = groups.find(g => g.group_code === selectedGroup);
  const configuredCnt = posture?.configs?.filter(c => c.configured).length ?? 0;
  const totalCnt = posture?.configs?.length ?? 0;

  return (
    <div>
      <h2 className="text-base font-semibold mb-1" style={{ color: "#c8d6e5" }}>2工区掘进参数 v2</h2>
      <p className="text-xs mb-4" style={{ color: "#6a7d9e" }}>
        盾构区间 · {totalParams.toLocaleString()}条参数 · {groups.length}个分组 · {totalExceed.toLocaleString()}条超限(P05/P95)
      </p>

      <div className="grid grid-cols-5 gap-3 mb-4">
        {groups.map((g) => {
          const pct = g.parameter_count && totalParams > 0 ? ((g.parameter_count / totalParams) * 100).toFixed(0) : "0";
          const isTop = topExceedGroup?.group_code === g.group_code && (g.exceed_count || 0) > 0;
          return (
            <div key={g.group_code} onClick={() => setSelectedGroup(String(g.group_code ?? ""))} className="rounded cursor-pointer p-3 transition-colors"
              style={{ background: selectedGroup === g.group_code ? "#111e30" : "#0f1525", border: isTop ? "1px solid #5a1a1a" : selectedGroup === g.group_code ? "1px solid #1a4a6a" : "1px solid #1a2640", borderLeft: isTop ? "4px solid #e65100" : "4px solid #1a4a6a" }}>
              <div className="text-[11px] font-semibold mb-1" style={{ color: "#98aec9" }}>{g.group_name_cn || g.group_code}</div>
              <div className="flex justify-between items-baseline">
                <span className="text-lg font-bold" style={{ color: "#c8d6e5" }}>{(g.parameter_count || 0).toLocaleString()}</span>
                <span className="text-[10px]" style={{ color: "#5a6d8a" }}>条参数</span>
              </div>
              <div className="h-1 rounded-sm overflow-hidden mt-1.5" style={{ background: "#1a2640" }}>
                <div className="h-full rounded-sm" style={{ width: Math.min(100, Number(pct) * 5) + "%", background: isTop ? "#e65100" : "#d4a050" }} />
              </div>
              <div className="flex justify-between mt-1 text-[10px]">
                <span style={{ color: (g.exceed_count || 0) > 0 ? "#e65100" : "#2e7d32" }}>超限 {(g.exceed_count || 0).toLocaleString()} 条</span>
                <span style={{ color: "#5a6d8a" }}>{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card mb-4">
        <div className="flex justify-between items-center mb-1">
          <h4 className="text-sm font-semibold" style={{ color: "#6a7d9e" }}>{selectedGroupInfo?.group_name_cn || selectedGroup} · 趋势图</h4>
          <span className="text-[11px]" style={{ color: "#5a6d8a" }}>{paramsLoading ? "加载中..." : params.length > 0 ? "显示前6个参数" : "等待数据"}</span>
        </div>
        <p className="text-[10px] mb-1" style={{ color: "#5a6d8a" }}>阈值来源：P05/P95统计推导（非工程设计值），{selectedGroupInfo?.exceed_count || 0}条超限需要工程判断</p>
        <div ref={chartRef} style={{ height: 300, minHeight: 300 }}>
          {!paramsLoading && params.length === 0 && (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: "#5a6d8a" }}>选择参数分组后显示趋势图</div>
          )}
        </div>
      </div>

      <div className="card card-accent mb-4">
        <h3 className="text-sm font-semibold mb-2" style={{ color: "#00d4ff" }}>建议动作</h3>
        <div className="flex flex-col gap-1.5">
          {[1,2,3].map(i => (
            <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "#98aec9" }}>
              <span style={{ color: "#00d4ff", fontWeight: 700 }}>{i}.</span>
              <span className="leading-relaxed">
                {i === 1 && "核对姿态/油缸行程分组的" + (groups.find(g => g.group_code === "posture")?.exceed_count?.toLocaleString() || "?") + "条超限——该组直接影响盾构姿态和管片拼装质量，建议优先复核"}
                {i === 2 && "将P05/P95统计阈值替换为盾构机厂家提供的正式参数控制范围（PLC导出数据中通常含上下限）"}
                {i === 3 && (configuredCnt < totalCnt ? "配置姿态偏差正式限值：当前" + configuredCnt + "/" + totalCnt + "类已设（GB50446参考值），建议根据本项目设计文件确认" : "姿态偏差限值已全部配置（GB50446），定期比对实际偏差与限值")}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card mb-0">
        <h3 className="text-sm font-semibold mb-2" style={{ color: "#6a7d9e" }}>数据缺口</h3>
        <div className="flex gap-2.5 flex-wrap">
          {[
            { cat: "参数限值", detail: "当前阈值全部基于P05/P95统计推导，非PLC或设计文件中的正式限值", action: "从盾构机PLC导出参数控制范围，或从施工方案补充" },
            { cat: "姿态偏差", detail: "6类偏差限值已配置" + configuredCnt + "/" + totalCnt + "（GB50446），缺少本项目设计文件具体要求", action: "核对设计文件中盾构姿态偏差控制标准" },
            { cat: "环号-里程", detail: "33环里程已推算（DK30+594~DK30+543），未与导向系统数据交叉验证", action: "获取盾构导向系统导出的环号-里程对应表" },
          ].map((g, i) => (
            <div key={i} className="flex-1 min-w-[200px] rounded p-2.5" style={{ background: "#1a1210", border: "1px solid #5a3a1a" }}>
              <div className="text-[11px] font-semibold mb-1" style={{ color: "#d4a050" }}>{g.cat}</div>
              <div className="text-[11px] mb-1" style={{ color: "#5a6d8a" }}>{g.detail}</div>
              <div className="text-[10px]" style={{ color: "#6a7d9e" }}>{"→ " + g.action}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}