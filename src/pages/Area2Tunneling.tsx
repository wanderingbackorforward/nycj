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
      const [grpRes, posRes] = await Promise.all([
        fetchArea2TunnelingGroups(), fetchArea2PostureDeviation(),
      ]);
      if (grpRes.ok && Array.isArray(grpRes.data)) {
        setGroups(grpRes.data);
        if (grpRes.data.length > 0) setSelectedGroup(String(grpRes.data[0].group_code ?? ""));
      } else if (!grpRes.ok) setError(grpRes.error ?? "接口连接异常");
      if (posRes.ok && posRes.data) setPosture(posRes.data);
    } catch { setError("接口连接异常"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadParams = useCallback(async (group: string) => {
    if (!group) return;
    setParamsLoading(true);
    try {
      const res = await fetchArea2TunnelingParams("group=" + encodeURIComponent(group));
      if (res.ok && Array.isArray(res.data)) setParams(res.data);
    } catch { /* silent */ }
    setParamsLoading(false);
  }, []);

  useEffect(() => { if (selectedGroup) loadParams(selectedGroup); }, [selectedGroup, loadParams]);

  // Single chart: selected group trend
  useEffect(() => {
    if (!chartRef.current || !Array.isArray(params) || params.length === 0) return;
    if (!chartInst.current) {
        chartInst.current = echarts.init(chartRef.current);
      }
      const nameSet = new Set<string>();
      for (const p of params) { const n = p.parameter_name_cn || p.parameter_name; if (n) nameSet.add(String(n)); }
      const paramNames = Array.from(nameSet).slice(0, 6);
      const ringSet = new Set<number>();
      for (const p of params) { if (typeof p.ring_no === "number") ringSet.add(p.ring_no); }
      const sortedRings = Array.from(ringSet).sort((a, b) => a - b);
      const series = paramNames.map((name, idx) => {
        const colors = ["#00d4ff", "#ff8c42", "#2e7d32", "#d4a050", "#7c4dff", "#e65100"];
        const data = sortedRings.map(ring => {
          const m = params.find(p => p.ring_no === ring && String(p.parameter_name_cn || p.parameter_name) === name);
          return typeof m?.value === "number" ? m.value : null;
        });
        return { name, type: "line", data, smooth: true, symbol: "none", lineStyle: { width: 2, color: colors[idx % colors.length] } };
      });
      chartInst.current.setOption({
        backgroundColor: "transparent",
        tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
        legend: { bottom: 0, textStyle: { color: "#7a8ba8", fontSize: 10 }, type: "scroll" },
        grid: { left: 50, right: 20, top: 10, bottom: 40 },
        xAxis: { type: "category", data: sortedRings.map(r => String(r)), axisLabel: { color: "#5a6d8a", fontSize: 10 }, axisLine: { lineStyle: { color: "#1a2845" } } },
        yAxis: { type: "value", axisLabel: { color: "#5a6d8a", fontSize: 10 }, splitLine: { lineStyle: { color: "#121e36" } }, name: "参数值", nameTextStyle: { color: "#5a6d8a" } },
        series: series as echarts.SeriesOption[],
      }, true);
    const h = () => { try { chartInst.current?.resize(); } catch { /* ignore */ } };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [params]);

  useEffect(() => { return () => { try { chartInst.current?.dispose(); } catch { /* ignore */ } }; }, []);

  if (loading) return <LoadingState message="正在加载掘进参数数据..." />;
  if (error && groups.length === 0) return <ErrorState message={error} onRetry={load} />;

  // Compute conclusions
  const totalParams = groups.reduce((s, g) => s + (g.parameter_count || 0), 0);
  const totalExceed = groups.reduce((s, g) => s + (g.exceed_count || 0), 0);
  const topExceedGroup = [...groups].sort((a, b) => (b.exceed_count || 0) - (a.exceed_count || 0))[0];
  const exceedPct = totalParams > 0 ? ((totalExceed / totalParams) * 100).toFixed(1) : "0";
  const selectedGroupInfo = groups.find(g => g.group_code === selectedGroup);
  const postureConfigured = posture?.configs?.filter(c => c.configured).length ?? 0;
  const postureTotal = posture?.configs?.length ?? 0;

  return (
    <div className="page-area2-tunneling">
      <h2 className="page-title">2工区掘进参数</h2>
      <p className="page-desc">工~天盾构区间 · 环号1717~1749 · 当前1749环 · 共{totalParams.toLocaleString()}条参数</p>

      {/* ====== 研判结论 ====== */}
      <section style={{ marginBottom: 16, background: "#0f1525", border: "1px solid #1a2640", borderLeft: "4px solid #d4a050", borderRadius: 6, padding: 14 }}>
        <h3 style={{ color: "#d4a050", fontSize: 14, marginBottom: 8 }}>当前结论</h3>
        <p style={{ color: "#98aec9", fontSize: 13, lineHeight: 1.7, marginBottom: 8 }}>
          五个参数分组共{totalParams.toLocaleString()}条记录，其中<strong style={{color:"#e65100"}}>{totalExceed.toLocaleString()}条超出统计阈值（P05/P95）</strong>，占比{exceedPct}%。
          {topExceedGroup && <>超限最多的分组为<strong style={{color:"#d4a050"}}>{topExceedGroup.group_name_cn}</strong>（{topExceedGroup.exceed_count?.toLocaleString()}条），</>}
          该分组与盾构姿态控制和管片拼装质量直接相关。
        </p>
        <p style={{ color: "#6a7d9e", fontSize: 12, marginBottom: 0 }}>
          注意：阈值来源为P05/P95统计推导，<strong>非工程设计值</strong>。超限不代表设备故障，但需要工程人员确认是否接近实际控制限值。
        </p>
      </section>

      {/* ====== 参数分组概览卡片 ====== */}
      <section style={{ marginBottom: 16 }}>
        <h3 style={{ color: "#6a7d9e", fontSize: 14, marginBottom: 8 }}>关键证据：五组参数超限分布</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {groups.map((g, i) => {
            const pct = g.parameter_count ? ((g.exceed_count || 0) / g.parameter_count * 100).toFixed(1) : "0";
            const isTop = g === topExceedGroup;
            return (
              <div key={i} onClick={() => setSelectedGroup(String(g.group_code ?? ""))} style={{
                flex: "1 1 170px", cursor: "pointer",
                background: selectedGroup === g.group_code ? "#111e30" : "#0f1525",
                border: isTop ? "1px solid #5a3a1a" : selectedGroup === g.group_code ? "1px solid #1a4a6a" : "1px solid #1a2640",
                borderLeft: isTop ? "4px solid #e65100" : "4px solid #1a4a6a",
                borderRadius: 4, padding: "10px 12px", transition: "all 0.2s"
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#98aec9", marginBottom: 4 }}>{g.group_name_cn || g.group_code}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#c8d6e5" }}>{(g.parameter_count || 0).toLocaleString()}</span>
                  <span style={{ fontSize: 10, color: "#5a6d8a" }}>条参数</span>
                </div>
                <div style={{ height: 4, background: "#1a2845", borderRadius: 2, overflow: "hidden", marginTop: 6 }}>
                  <div style={{ height: "100%", width: Math.min(100, Number(pct) * 5) + "%", background: isTop ? "#e65100" : "#d4a050", borderRadius: 2 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10 }}>
                  <span style={{ color: (g.exceed_count || 0) > 0 ? "#e65100" : "#2e7d32" }}>超限 {g.exceed_count?.toLocaleString() || 0} 条</span>
                  <span style={{ color: "#5a6d8a" }}>{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
        <p style={{ color: "#4a5a6e", fontSize: 10, marginTop: 4 }}>点击卡片切换下方趋势图。红色左边框 = 超限最多的分组。</p>
      </section>

      {/* ====== 选中分组趋势图 ====== */}
      <section style={{ marginBottom: 16, background: "#0f1525", border: "1px solid #1a2640", borderRadius: 6, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h4 style={{ color: "#6a7d9e", fontSize: 13, margin: 0 }}>
            {selectedGroupInfo?.group_name_cn || selectedGroup} · 趋势图
          </h4>
          <span style={{ fontSize: 11, color: "#5a6d8a" }}>
            {paramsLoading ? "加载中..." : "显示前6个参数"}
          </span>
        </div>
        <p style={{ color: "#4a5a6e", fontSize: 10, marginBottom: 4 }}>
          阈值来源：P05/P95统计推导（非工程设计值），{selectedGroupInfo?.exceed_count || 0}条超限需要工程判断
        </p>
        <div ref={chartRef} style={{ height: 300 }}>
          {!paramsLoading && params.length === 0 && <div className="chart-placeholder">选择参数分组后显示趋势图</div>}
        </div>
      </section>

      {/* ====== 建议动作 ====== */}
      <section style={{ marginBottom: 16, background: "#0f1525", border: "1px solid #1a4a6a", borderLeft: "4px solid #00d4ff", borderRadius: 6, padding: 14 }}>
        <h3 style={{ color: "#00d4ff", fontSize: 14, marginBottom: 8 }}>建议动作</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            "核对姿态/油缸行程分组的4,196条超限——该组直接影响盾构姿态和管片拼装质量，建议优先复核",
            "将P05/P95统计阈值替换为盾构机厂家提供的正式参数控制范围（PLC导出数据中通常含上下限）",
            postureConfigured < postureTotal
              ? "配置姿态偏差正式限值：当前" + postureConfigured + "/" + postureTotal + "类已设（均为GB50446规范参考值），建议根据本项目设计文件确认"
              : "姿态偏差限值已全部配置（GB50446），定期比对实际偏差与限值",
          ].map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ color: "#00d4ff", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
              <span style={{ fontSize: 12, color: "#98aec9", lineHeight: 1.6 }}>{a}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ====== 数据缺口 ====== */}
      <section style={{ marginBottom: 0, background: "#0f1525", border: "1px solid #1a2640", borderRadius: 6, padding: 14 }}>
        <h3 style={{ color: "#6a7d9e", fontSize: 14, marginBottom: 8 }}>数据缺口</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { cat: "参数限值", detail: "当前阈值全部基于P05/P95统计推导，非PLC或设计文件中的正式限值", action: "从盾构机PLC导出参数控制范围，或从施工方案补充" },
            { cat: "姿态偏差", detail: "6类偏差限值已配置（GB50446），但缺少本项目设计文件中的具体要求", action: "核对设计文件中盾构姿态偏差控制标准" },
            { cat: "环号-里程", detail: "33环里程已推算（DK30+594~DK30+543），但未与导向系统数据交叉验证", action: "获取盾构导向系统导出的环号-里程对应表" },
          ].map((g, i) => (
            <div key={i} style={{ flex: "1 1 200px", background: "#1a1210", border: "1px solid #5a3a1a", borderRadius: 4, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#d4a050", fontWeight: 600, marginBottom: 4 }}>{g.cat}</div>
              <div style={{ fontSize: 11, color: "#8a6d5a", marginBottom: 4 }}>{g.detail}</div>
              <div style={{ fontSize: 10, color: "#5a4a2a" }}>→ {g.action}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
