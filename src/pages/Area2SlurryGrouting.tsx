import React, { useEffect, useState, useCallback, useRef } from "react";
import * as echarts from "echarts";
import LoadingState from "../components/status/LoadingState";
import ErrorState from "../components/status/ErrorState";
import {
  fetchArea2DiagnosisSlurryGrouting, fetchArea2TunnelingParams,
  fetchArea2MonitoringSummary,
} from "../api/area2";
import type { Area2DiagnosisSlurryGrouting, Area2MonitoringSummary } from "../api/area2";

export default function Area2SlurryGrouting() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<Area2DiagnosisSlurryGrouting | null>(null);
  const [monSummary, setMonSummary] = useState<Area2MonitoringSummary | null>(null);
  const [selectedRing, setSelectedRing] = useState<number | null>(null);

  const load = useCallback(async (ringNo?: number) => {
    setLoading(true); setError(null);
    try {
      const [diagRes, monRes] = await Promise.all([
        fetchArea2DiagnosisSlurryGrouting(ringNo ?? null),
        fetchArea2MonitoringSummary(),
      ]);
      if (diagRes.ok && diagRes.data) {
        setDiagnosis(diagRes.data);
        setSelectedRing(diagRes.data.ring_no ?? null);
      } else if (!diagRes.ok) setError(diagRes.error ?? "诊断接口连接异常");
      if (monRes.ok && monRes.data) setMonSummary(monRes.data);
    } catch { setError("接口连接异常"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Simple bar chart for slurry pressure distribution
  useEffect(() => {
    if (!chartRef.current || !diagnosis?.slurry_params?.length) return;
    try {
      if (!chartInst.current) chartInst.current = echarts.init(chartRef.current);
      // Aggregate by parameter name, show average
      const map = new Map<string, number[]>();
      for (const p of diagnosis.slurry_params) {
        const name = String((p as Record<string,unknown>).name || p.parameter_name_cn || "");
        if (!name) continue;
        if (!map.has(name)) map.set(name, []);
        map.get(name)!.push(Number(p.value) || 0);
      }
      const items = Array.from(map.entries()).map(([name, vals]) => ({
        name: name.length > 10 ? name.substring(0, 10) : name,
        avg: vals.reduce((a, b) => a + b, 0) / vals.length,
        min: Math.min(...vals), max: Math.max(...vals),
      }));
      chartInst.current.setOption({
        backgroundColor: "transparent",
        tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "var(--color-panel-border)", textStyle: { color: "var(--color-text-primary)", fontSize: 12 } },
        grid: { left: 50, right: 20, top: 10, bottom: 60 },
        xAxis: { type: "category", data: items.map(i => i.name), axisLabel: { color: "var(--color-text-dim)", fontSize: 10, rotate: 35 }, axisLine: { lineStyle: { color: "var(--color-panel-border)" } } },
        yAxis: { type: "value", name: "bar", axisLabel: { color: "var(--color-text-dim)", fontSize: 10 }, splitLine: { lineStyle: { color: "var(--color-bg-grid)" } } },
        series: [
          { name: "均值", type: "bar", data: items.map(i => +i.avg.toFixed(2)), itemStyle: { color: "var(--color-accent-dim)" }, barWidth: 16 },
          { name: "范围", type: "bar", data: items.map(i => +(i.max - i.min).toFixed(2)), itemStyle: { color: "rgba(0,212,255,0.3)" }, barGap: "-100%", z: 0 },
        ],
      }, true);
    } catch { /* silent */ }
    const h = () => { try { chartInst.current?.resize(); } catch { /* ignore */ } };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [diagnosis]);

  useEffect(() => { return () => { try { chartInst.current?.dispose(); } catch { /* ignore */ } }; }, []);

  if (loading) return <LoadingState message="正在加载泥水注浆诊断数据..." />;
  if (error && !diagnosis) return <ErrorState message={error} onRetry={() => load()} />;

  const slurryCount = diagnosis?.slurry_params?.length || 0;
  const groutingCount = diagnosis?.grouting_params?.length || 0;
  const monAlarm = monSummary?.alert_summary?.alarm || 0;
  const monWarning = monSummary?.alert_summary?.warning || 0;
  const monNormal = monSummary?.alert_summary?.normal || 0;
  const gaps = diagnosis?.data_gaps || [];
  const suggestion = diagnosis?.suggestion || "";

  return (
    <div className="page-area2-slurry-grouting">
      <h2 className="page-title">2工区泥水注浆</h2>
      <p className="page-desc">
        盾构区间 · 当前{selectedRing || "-"}环 · 泥水/土压参数{slurryCount.toLocaleString()}条 · 注浆参数{groutingCount.toLocaleString()}条
      </p>

      {/* ====== 研判结论 ====== */}
      <section style={{ marginBottom: 16, background: "var(--color-panel)", border: "1px solid var(--color-panel-border)", borderLeft: "4px solid var(--color-warning)", borderRadius: 6, padding: 14 }}>
        <h3 style={{ color: "var(--color-warning)", fontSize: 14, marginBottom: 8 }}>当前结论</h3>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 13, lineHeight: 1.7, marginBottom: 8 }}>
          {slurryCount > 0 && groutingCount > 0 ? (
            <>环{selectedRing}诊断完成：泥水/土压参数{slurryCount.toLocaleString()}条，注浆参数{groutingCount.toLocaleString()}条。</>
          ) : "诊断数据加载中..."}
          {monAlarm > 0 && (
            <span style={{color:"var(--color-danger)"}}>同期监测发现<strong>{monAlarm.toLocaleString()}条报警级</strong>、{monWarning.toLocaleString()}条预警级读数。</span>
          )}
          {monAlarm === 0 && "同期监测未发现报警级读数。"}
        </p>
        <p style={{ color: "var(--color-text-muted)", fontSize: 12, marginBottom: 0 }}>
          注意：当前缺少完整泥水环流系统数据（仅含土压传感器读数），注浆参数来自日报汇总。阈值基于P95/P99统计推导。
        </p>
      </section>

      {/* ====== 监测响应摘要 ====== */}
      {monSummary?.alert_summary && (
        <section style={{ marginBottom: 16, background: "var(--color-panel)", border: "1px solid var(--color-panel-border)", borderRadius: 6, padding: 12 }}>
          <h3 style={{ color: "var(--color-text-muted)", fontSize: 14, marginBottom: 8 }}>关键证据：同期监测响应</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", borderRadius: 4, padding: "10px 16px", flex: "1 1 100px" }}>
              <div style={{ fontSize: 11, color: "var(--color-danger)", marginBottom: 2 }}>报警级</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-danger)" }}>{monAlarm.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: "var(--color-danger-border)" }}>P99超限</div>
            </div>
            <div style={{ background: "#1a1a10", border: "1px solid #5a4a2a", borderRadius: 4, padding: "10px 16px", flex: "1 1 100px" }}>
              <div style={{ fontSize: 11, color: "var(--color-warning)", marginBottom: 2 }}>预警级</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-warning)" }}>{monWarning.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: "#5a4a2a" }}>P95超限</div>
            </div>
            <div style={{ background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)", borderRadius: 4, padding: "10px 16px", flex: "1 1 100px" }}>
              <div style={{ fontSize: 11, color: "var(--color-success)", marginBottom: 2 }}>正常</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-success)" }}>{monNormal.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: "var(--color-success-border)" }}>正常范围</div>
            </div>
            <div style={{ background: "var(--color-bg-hover)", border: "1px solid var(--color-panel-border)", borderRadius: 4, padding: "10px 16px", flex: "1 1 130px" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-dim)", marginBottom: 2 }}>阈值来源</div>
              <div style={{ fontSize: 12, color: "var(--color-text-primary)" }}>P95/P99统计推导</div>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)" }}>非工程设计值</div>
            </div>
          </div>
        </section>
      )}

      {/* ====== 土压分布图 ====== */}
      {diagnosis?.slurry_params && diagnosis.slurry_params.length > 0 && (
        <section style={{ marginBottom: 16, background: "var(--color-panel)", border: "1px solid var(--color-panel-border)", borderRadius: 6, padding: 12 }}>
          <h4 style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 4 }}>土压/泥水参数分布（均值 + 范围）</h4>
          <p style={{ color: "var(--color-text-dim)", fontSize: 10, marginBottom: 4 }}>
            共{slurryCount.toLocaleString()}条记录，深色柱=均值，浅色背景=波动范围
          </p>
          <div ref={chartRef} style={{ height: 280 }} />
        </section>
      )}

      {/* ====== 诊断建议 ====== */}
      {suggestion && (
        <section style={{ marginBottom: 16, background: "var(--color-panel)", border: "1px solid #1a4a6a", borderLeft: "4px solid var(--color-accent)", borderRadius: 6, padding: 14 }}>
          <h3 style={{ color: "var(--color-accent)", fontSize: 14, marginBottom: 8 }}>建议动作</h3>
          <p style={{ color: "var(--color-text-secondary)", fontSize: 12, lineHeight: 1.7 }}>{suggestion}</p>
        </section>
      )}

      {!suggestion && (
        <section style={{ marginBottom: 16, background: "var(--color-panel)", border: "1px solid #1a4a6a", borderLeft: "4px solid var(--color-accent)", borderRadius: 6, padding: 14 }}>
          <h3 style={{ color: "var(--color-accent)", fontSize: 14, marginBottom: 8 }}>建议动作</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {["比对土压传感器读数与设计土压设定值（当前仅展示原始读数，缺少设计参考范围）",
              "补充泥水环流系统完整参数（进出泥流量、密度、压力），当前仅含土压传感器",
              "结合注浆量分布与监测沉降数据，评估注浆对地层沉降的控制效果",
            ].map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ color: "var(--color-accent)", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{a}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ====== 数据缺口 ====== */}
      <section style={{ marginBottom: 0, background: "var(--color-panel)", border: "1px solid var(--color-panel-border)", borderRadius: 6, padding: 14 }}>
        <h3 style={{ color: "var(--color-text-muted)", fontSize: 14, marginBottom: 8 }}>数据缺口</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {Array.isArray(gaps) && gaps.length > 0 ? (gaps as Array<Record<string, unknown>>).map((g, i) => (
            <div key={i} style={{ flex: "1 1 200px", background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)", borderRadius: 4, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "var(--color-warning)", fontWeight: 600, marginBottom: 4 }}>{String((g as Record<string,unknown>).field || (g as Record<string,unknown>).category || "未知")}</div>
              <div style={{ fontSize: 11, color: "#8a6d5a", marginBottom: 4 }}>{String((g as Record<string,unknown>).reason || (g as Record<string,unknown>).detail || "")}</div>
            </div>
          )) : [
            { cat: "泥水环流", detail: "缺少进出泥流量、密度、压力等完整环流参数", action: "接入PLC泥水环流数据" },
            { cat: "土压参考值", detail: "土压传感器读数缺少设计土压设定范围作为参考", action: "补充设计土压控制范围" },
            { cat: "注浆-沉降关联", detail: "注浆量数据与监测沉降数据未做时空关联分析", action: "按环号对齐注浆量与对应里程沉降" },
          ].map((g, i) => (
            <div key={i} style={{ flex: "1 1 200px", background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)", borderRadius: 4, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "var(--color-warning)", fontWeight: 600, marginBottom: 4 }}>{g.cat}</div>
              <div style={{ fontSize: 11, color: "#8a6d5a", marginBottom: 4 }}>{g.detail}</div>
              <div style={{ fontSize: 10, color: "#5a4a2a" }}>→ {g.action}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
