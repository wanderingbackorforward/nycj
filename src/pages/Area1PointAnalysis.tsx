import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useECharts } from "../components/charts/useECharts";
import LoadingState from "../components/status/LoadingState";
import ErrorState from "../components/status/ErrorState";
import { fetchGnMonitoringPoints, fetchGnPointAnalysis, fetchGnDiagnose } from "../api/area1";
import type { GnPoint, GnPointAnalysisResponse, GnDiagnoseResponse } from "../api/area1";

export default function Area1PointAnalysis() {
  const trendRef = useRef<HTMLDivElement>(null);
  const trendInst = useRef<echarts.ECharts | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<GnPoint[]>([]);
  const [selectedPoint, setSelectedPoint] = useState("");
  const [analysis, setAnalysis] = useState<GnPointAnalysisResponse | null>(null);
  const [diagnosis, setDiagnosis] = useState<GnDiagnoseResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // Load all points
  const loadPoints = useCallback(async () => {
    setLoading(true);
    const res = await fetchGnMonitoringPoints();
    if (res.ok && res.data) {
      const pts = res.data.points || [];
      setPoints(pts);
      setSelectedPoint(pts[0]?.point_code || "");
    } else setError("监测点列表获取失败");
    setLoading(false);
  }, []);

  useEffect(() => { loadPoints(); }, [loadPoints]);

  // Load analysis + diagnosis for selected point
  const loadPoint = useCallback(async (code: string) => {
    if (!code) return;
    setAnalysisLoading(true);
    setAnalysis(null);
    setDiagnosis(null);
    const [analysisRes, diagRes] = await Promise.all([
      fetchGnPointAnalysis(code),
      fetchGnDiagnose(code),
    ]);
    if (analysisRes.ok && analysisRes.data) setAnalysis(analysisRes.data);
    if (diagRes.ok && diagRes.data?.findings?.length) setDiagnosis(diagRes.data);
    setAnalysisLoading(false);
  }, []);

  useEffect(() => { if (selectedPoint) loadPoint(selectedPoint); }, [selectedPoint, loadPoint]);

  // ---- Trend chart: uses point-analysis trend (now rich for all points) ----
    // ---- Trend chart ----
  const trendOption = useMemo(() => {
    const trend = analysis?.trend;
    if (!trend || trend.length === 0) return null;

    const dates: string[] = [];
    const currentVals: (number | null)[] = [];
    const cumulativeVals: (number | null)[] = [];
    for (const t of trend) {
      const d = t.date || t.measured_at;
      dates.push(typeof d === "string" ? (d.length > 10 ? d.substring(5, 10) : d) : "");
      currentVals.push(typeof t.current_value === "number" ? t.current_value : (typeof t.value === "number" ? t.value : null));
      cumulativeVals.push(typeof t.cumulative_change === "number" ? t.cumulative_change : null);
    }

    const designLimit = analysis.point.design_limit as number | undefined;

    const series: any[] = [
      { name: "当前值", type: "line", yAxisIndex: 0, data: currentVals, smooth: false, symbol: "circle", symbolSize: 6, lineStyle: { width: 2.5, color: "var(--color-accent)" }, itemStyle: { color: "var(--color-accent)" } },
      { name: "累计变化", type: "line", yAxisIndex: 1, data: cumulativeVals, smooth: false, symbol: "diamond", symbolSize: 6, lineStyle: { width: 2, color: "var(--color-danger)", type: "dashed" }, itemStyle: { color: "var(--color-danger)" } },
    ];


    if (typeof designLimit === "number") {
      series.push({
        name: "设计限值", type: "line", yAxisIndex: 0, data: Array(currentVals.length).fill(designLimit) as number[],
        lineStyle: { type: "dotted", width: 2, color: "var(--color-danger)" }, itemStyle: { color: "var(--color-danger)" }, symbol: "none",
        markLine: { silent: true, symbol: "none", lineStyle: { color: "var(--color-danger)", type: "dashed" }, label: { formatter: "限值" + designLimit, color: "var(--color-danger)", fontSize: 10 }, data: [{ yAxis: designLimit }] },
      });
    }
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "var(--color-panel-border)", textStyle: { color: "var(--color-text-primary)", fontSize: 12 } },
      legend: { top: 8, textStyle: { color: "var(--color-text-secondary)", fontSize: 11 } },
      grid: { left: 60, right: 60, top: 45, bottom: 30 },
      xAxis: { type: "category", data: dates, axisLabel: { color: "var(--color-text-dim)", fontSize: 10, rotate: 30 }, axisLine: { lineStyle: { color: "var(--color-panel-border)" } } },
      yAxis: [
        { type: "value", name: "当前值", nameTextStyle: { color: "var(--color-accent)", fontSize: 11 }, axisLabel: { color: "var(--color-accent)", fontSize: 10 }, splitLine: { lineStyle: { color: "var(--color-bg-grid)" } } },
        { type: "value", name: "累计变化", nameTextStyle: { color: "var(--color-danger)", fontSize: 11 }, axisLabel: { color: "var(--color-danger)", fontSize: 10 }, splitLine: { show: false } },
      ],
      series,
    };
  }, [analysis]);

  useECharts(trendRef, trendOption, (analysis?.trend?.length || 0) > 0);

  if (loading) return <LoadingState message="正在加载监测点列表..." />;
  if (error && points.length === 0) return <ErrorState message={error} onRetry={loadPoints} />;

  const pt = analysis?.point || {};
  const evItems = (analysis?.evidence || []) as Array<Record<string, unknown>>;
  const trendCount = analysis?.trend?.length || 0;

  return (
    <div className="page-area1-analysis">
      <h2 className="page-title">1工区单点分析</h2>
      <p className="page-desc">选择监测点查看趋势变化与设计限值对比。部分测点含智能诊断。</p>

      <div className="param-selector">
        <label>选择监测点：</label>
        <select className="param-select" value={selectedPoint} onChange={e => setSelectedPoint(e.target.value)}>
          {points.map(p => (
            <option key={p.point_code} value={p.point_code}>{p.point_code}{p.monitoring_item ? " · " + p.monitoring_item : ""}</option>
          ))}
        </select>
        {analysisLoading && <span className="loading-text">加载中...</span>}
      </div>

      {/* Trend chart */}
      <div className="chart-container" ref={trendRef} style={{height:380}}>
        {trendCount === 0 && !analysisLoading && (
          <div className="chart-placeholder">该监测点暂无趋势数据</div>
        )}
      </div>

      {/* Point info cards */}
      <section style={{marginBottom:14}}>
        <div className="mon-status-grid">
          <div className="mon-status-card"><span className="mon-status-label">监测点</span><span className="mon-status-value" style={{fontSize:16}}>{String(pt.point_code || selectedPoint || "-")}</span></div>
          <div className="mon-status-card"><span className="mon-status-label">监测项目</span><span className="mon-status-value" style={{fontSize:16}}>{String(pt.monitoring_item || "-")}</span></div>
          <div className="mon-status-card"><span className="mon-status-label">设计限值</span><span className="mon-status-value" style={{fontSize:16}}>{pt.design_limit != null ? String(pt.design_limit) + " " + String(pt.unit || "") : "未设定"}</span></div>
          <div className="mon-status-card"><span className="mon-status-label">趋势点数</span><span className="mon-status-value" style={{fontSize:16}}>{trendCount}</span></div>
        </div>
      </section>

      {/* Diagnosis section — shows for any point with findings */}
      {diagnosis?.findings && diagnosis.findings.length > 0 ? (
        <section style={{marginBottom:14}}>
          <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:8}}>智能诊断报告</h3>
          <div style={{background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderLeft:"4px solid " + (diagnosis.findings.some(f => f.level === "critical") ? "var(--color-danger)" : "var(--color-accent)"), borderRadius:4, padding:14}}>
            {diagnosis.findings.map((f, i) => (
              <div key={i} style={{display:"flex", alignItems:"flex-start", gap:8, marginBottom:6}}>
                <span style={{background: f.level === "critical" ? "var(--color-danger)" : "var(--color-accent)", color:"#fff", borderRadius:2, padding:"1px 6px", fontSize:10, fontWeight:600, whiteSpace:"nowrap", marginTop:1}}>
                  {f.level === "critical" ? "!!" : "i"}
                </span>
                <span style={{fontSize:12, color:"var(--color-text-primary)", lineHeight:1.6}}>{f.detail}</span>
              </div>
            ))}
            {diagnosis.recommendation && (
              <div style={{fontSize:12, color:"var(--color-text-dim)", borderTop:"1px solid var(--color-panel-border)", paddingTop:8, marginTop:4, lineHeight:1.6}}>
                <strong>建议动作：</strong>{diagnosis.recommendation}
              </div>
            )}
            {diagnosis.siblings_comparison && diagnosis.siblings_comparison.filter(s => s.latest_cumulative != null).length > 0 && (
              <div style={{marginTop:10, borderTop:"1px solid var(--color-panel-border)", paddingTop:8}}>
                <div style={{fontSize:11, color:"var(--color-text-dim)", marginBottom:6}}>同期同类点对比（累计变化）</div>
                <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                  {diagnosis.siblings_comparison.filter(s => s.latest_cumulative != null).slice(0, 12).map((s, i) => (
                    <div key={i} style={{background:"var(--color-bg-hover)", border:"1px solid var(--color-panel-border)", borderRadius:3, padding:"6px 10px", textAlign:"center", minWidth:70}}>
                      <div style={{fontSize:10, color:"var(--color-text-muted)"}}>{s.point_code}</div>
                      <div style={{fontSize:15, fontWeight:700, color: Math.abs(s.latest_cumulative || 0) > 100 ? "var(--color-danger)" : "var(--color-accent)"}}>{s.latest_cumulative?.toFixed(1) ?? "-"}</div>
                      <div style={{fontSize:9, color:"var(--color-text-dim)"}}>{s.date}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {diagnosis.readings && diagnosis.readings.length > 0 && (
              <div style={{marginTop:10, borderTop:"1px solid var(--color-panel-border)", paddingTop:8}}>
                <div style={{fontSize:11, color:"var(--color-text-dim)", marginBottom:4}}>原始数据（共{diagnosis.reading_count}条，最近10条）</div>
                <table className="db-table" style={{width:"100%"}}>
                  <thead><tr><th>日期</th><th>当前值</th><th>累计变化</th><th>日变化</th><th>来源</th></tr></thead>
                  <tbody>
                    {diagnosis.readings.slice(-10).reverse().map((r, i) => (
                      <tr key={i}>
                        <td>{r.date}</td>
                        <td className="mono">{r.current_value?.toFixed(2)}</td>
                        <td className="mono" style={{color: Math.abs(r.cumulative_change) > 100 ? "var(--color-danger)" : "var(--color-text-primary)"}}>{r.cumulative_change?.toFixed(1)}</td>
                        <td className="mono" style={{color: Math.abs(r.daily_change) > 20 ? "var(--color-danger)" : "var(--color-text-dim)"}}>{r.daily_change?.toFixed(1)}</td>
                        <td style={{fontSize:10, color:"var(--color-text-dim)", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{r.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : analysis?.findings && analysis.findings.length > 0 ? (
        <section style={{marginBottom:14}}>
          <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:8}}>分析发现</h3>
          <div style={{display:"flex", flexDirection:"column", gap:8}}>
            {analysis.findings.map((f, i) => (
              <div key={i} style={{background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderLeft:"3px solid var(--color-accent)", borderRadius:4, padding:"10px 12px"}}>
                <span style={{fontSize:12, color:"var(--color-text-secondary)"}}>{f.detail}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Evidence timeline */}
      {evItems.length > 0 && (
        <section style={{marginBottom:14}}>
          <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:8}}>关联证据（{evItems.length} 条）</h3>
          <div style={{display:"flex", gap:10, overflowX:"auto", paddingBottom:6}}>
            {evItems.map((e, i) => (
              <div key={i} style={{minWidth:170, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:4, padding:10, flexShrink:0}}>
                <div style={{fontSize:10, color:"var(--color-text-dim)", marginBottom:4}}>证据 #{i+1}</div>
                <div className="mono" style={{fontSize:11, color:"var(--color-text-secondary)", wordBreak:"break-all", marginBottom:2}}>{String(e.file_name || "-")}</div>
                <div style={{fontSize:10, color:"var(--color-text-dim)"}}>
                  {e.sheet_name ? "工作表: " + String(e.sheet_name) : ""}
                  {e.row_index != null ? " 行" + String(e.row_index) : ""}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Data gaps */}
      {analysis?.data_gaps && analysis.data_gaps.length > 0 && (
        <section style={{marginBottom:14}}>
          <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:6}}>数据缺口</h3>
          <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
            {analysis.data_gaps.map((g, i) => (
              <div key={i} style={{background:"var(--color-warning-bg)", border:"1px solid var(--color-warning-border)", borderRadius:4, padding:"6px 12px"}}>
                <span style={{fontSize:10, color:"var(--color-warning)", fontWeight:600}}>{g.category}</span>
                <span style={{fontSize:10, color:"#8a6d5a", marginLeft:8}}>{g.description}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}