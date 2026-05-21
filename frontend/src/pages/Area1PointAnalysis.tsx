import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useECharts } from "../components/charts/useECharts";
import LoadingState from "../components/status/LoadingState";
import ErrorState from "../components/status/ErrorState";
import { fetchGnMonitoringPoints, fetchGnPointAnalysis, fetchGnDiagnose, fetchGnTrendAcceleration, fetchGnThresholdProximity } from "../api/area1";
import type { GnPoint, GnPointAnalysisResponse, GnDiagnoseResponse, GnTrendAccelResponse, GnThresholdProxResponse } from "../api/area1";

export default function Area1PointAnalysis() {
  const trendRef = useRef<HTMLDivElement>(null);
  const trendInst = useRef<echarts.ECharts | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<GnPoint[]>([]);
  const [selectedPoint, setSelectedPoint] = useState("");
  const [analysis, setAnalysis] = useState<GnPointAnalysisResponse | null>(null);
  const [diagnosis, setDiagnosis] = useState<GnDiagnoseResponse | null>(null);
  const [trendAccel, setTrendAccel] = useState<GnTrendAccelResponse | null>(null);
  const [thresholdProx, setThresholdProx] = useState<GnThresholdProxResponse | null>(null);
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
    // 非阻塞：趋势加速度 + 阈值逼近
    fetchGnTrendAcceleration(code).then(r => { if (r.ok) setTrendAccel(r.data!); });
    fetchGnThresholdProximity(code).then(r => { if (r.ok) setThresholdProx(r.data!); });
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
      { name: "当前值", type: "line", yAxisIndex: 0, data: currentVals, smooth: false, symbol: "circle", symbolSize: 6, lineStyle: { width: 2.5, color: "#00d4ff" }, itemStyle: { color: "#00d4ff" } },
      { name: "累计变化", type: "line", yAxisIndex: 1, data: cumulativeVals, smooth: false, symbol: "diamond", symbolSize: 6, lineStyle: { width: 2, color: "#e65100", type: "dashed" }, itemStyle: { color: "#e65100" } },
    ];


    if (typeof designLimit === "number") {
      series.push({
        name: "设计限值", type: "line", yAxisIndex: 0, data: Array(currentVals.length).fill(designLimit) as number[],
        lineStyle: { type: "dotted", width: 2, color: "#e65100" }, itemStyle: { color: "#e65100" }, symbol: "none",
        markLine: { silent: true, symbol: "none", lineStyle: { color: "#e65100", type: "dashed" }, label: { formatter: "限值" + designLimit, color: "#e65100", fontSize:12 }, data: [{ yAxis: designLimit }] },
      });
    }
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
      legend: { top: 8, textStyle: { color: "#98aec9", fontSize: 11 } },
      grid: { left: 60, right: 60, top: 45, bottom: 30 },
      xAxis: { type: "category", data: dates, axisLabel: { color: "#5a6d8a", fontSize:12, rotate: 30 }, axisLine: { lineStyle: { color: "#1a2640" } } },
      yAxis: [
        { type: "value", name: "当前值", nameTextStyle: { color: "#00d4ff", fontSize: 11 }, axisLabel: { color: "#00d4ff", fontSize:12 }, splitLine: { lineStyle: { color: "#121e36" } } },
        { type: "value", name: "累计变化", nameTextStyle: { color: "#e65100", fontSize: 11 }, axisLabel: { color: "#e65100", fontSize:12 }, splitLine: { show: false } },
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
          <h3 style={{color:"#6a7d9e", fontSize:14, marginBottom:8}}>智能诊断报告</h3>
          <div style={{background:"#0f1525", border:"1px solid #1a2640", borderLeft:"4px solid " + (diagnosis.findings.some(f => f.level === "critical") ? "#e65100" : "#00d4ff"), borderRadius:4, padding:14}}>
            {diagnosis.findings.map((f, i) => (
              <div key={i} style={{display:"flex", alignItems:"flex-start", gap:8, marginBottom:6}}>
                <span style={{background: f.level === "critical" ? "#e65100" : "#00d4ff", color:"#fff", borderRadius:2, padding:"1px 6px", fontSize:12, fontWeight:600, whiteSpace:"nowrap", marginTop:1}}>
                  {f.level === "critical" ? "!!" : "i"}
                </span>
                <span style={{fontSize:12, color:"#c8d6e5", lineHeight:1.6}}>{f.detail}</span>
              </div>
            ))}
            {diagnosis.recommendation && (
              <div style={{fontSize:12, color:"#5a6d8a", borderTop:"1px solid #1a2640", paddingTop:8, marginTop:4, lineHeight:1.6}}>
                <strong>建议动作：</strong>{diagnosis.recommendation}
              </div>
            )}
            {diagnosis.siblings_comparison && diagnosis.siblings_comparison.filter(s => s.latest_cumulative != null).length > 0 && (
              <div style={{marginTop:10, borderTop:"1px solid #1a2640", paddingTop:8}}>
                <div style={{fontSize:11, color:"#5a6d8a", marginBottom:6}}>同期同类点对比（累计变化）</div>
                <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                  {diagnosis.siblings_comparison.filter(s => s.latest_cumulative != null).slice(0, 12).map((s, i) => (
                    <div key={i} style={{background:"#111e30", border:"1px solid #1a2640", borderRadius:3, padding:"6px 10px", textAlign:"center", minWidth:70}}>
                      <div style={{fontSize:12, color:"#6a7d9e"}}>{s.point_code}</div>
                      <div style={{fontSize:15, fontWeight:700, color: Math.abs(s.latest_cumulative || 0) > 100 ? "#e65100" : "#00d4ff"}}>{s.latest_cumulative?.toFixed(1) ?? "-"}</div>
                      <div style={{fontSize:9, color:"#5a6d8a"}}>{s.date}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {diagnosis.readings && diagnosis.readings.length > 0 && (
              <div style={{marginTop:10, borderTop:"1px solid #1a2640", paddingTop:8}}>
                <div style={{fontSize:11, color:"#5a6d8a", marginBottom:4}}>原始数据（共{diagnosis.reading_count}条，最近10条）</div>
                <table className="db-table" style={{width:"100%"}}>
                  <thead><tr><th>日期</th><th>当前值</th><th>累计变化</th><th>日变化</th><th>来源</th></tr></thead>
                  <tbody>
                    {diagnosis.readings.slice(-10).reverse().map((r, i) => (
                      <tr key={i}>
                        <td>{r.date}</td>
                        <td className="mono">{r.current_value?.toFixed(2)}</td>
                        <td className="mono" style={{color: Math.abs(r.cumulative_change) > 100 ? "#e65100" : "#c8d6e5"}}>{r.cumulative_change?.toFixed(1)}</td>
                        <td className="mono" style={{color: Math.abs(r.daily_change) > 20 ? "#e65100" : "#5a6d8a"}}>{r.daily_change?.toFixed(1)}</td>
                        <td style={{fontSize:12, color:"#5a6d8a", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{r.source}</td>
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
          <h3 style={{color:"#6a7d9e", fontSize:14, marginBottom:8}}>分析发现</h3>
          <div style={{display:"flex", flexDirection:"column", gap:8}}>
            {analysis.findings.map((f, i) => (
              <div key={i} style={{background:"#0f1525", border:"1px solid #1a2640", borderLeft:"3px solid #00d4ff", borderRadius:4, padding:"10px 12px"}}>
                <span style={{fontSize:12, color:"#98aec9"}}>{f.detail}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Evidence timeline */}
      {evItems.length > 0 && (
        <section style={{marginBottom:14}}>
          <h3 style={{color:"#6a7d9e", fontSize:14, marginBottom:8}}>关联证据（{evItems.length} 条）</h3>
          <div style={{display:"flex", gap:10, overflowX:"auto", paddingBottom:6}}>
            {evItems.map((e, i) => (
              <div key={i} style={{minWidth:170, background:"#0f1525", border:"1px solid #1a2640", borderRadius:4, padding:10, flexShrink:0}}>
                <div style={{fontSize:12, color:"#5a6d8a", marginBottom:4}}>证据 #{i+1}</div>
                <div className="mono" style={{fontSize:11, color:"#98aec9", wordBreak:"break-all", marginBottom:2}}>{String(e.file_name || "-")}</div>
                <div style={{fontSize:12, color:"#5a6d8a"}}>
                  {e.sheet_name ? "工作表: " + String(e.sheet_name) : ""}
                  {e.row_index != null ? " 行" + String(e.row_index) : ""}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Data gaps */}
      {/* 趋势加速度分析 */}
      {trendAccel && trendAccel.items && (
        <div className="card" style={{marginBottom:12}}>
          <h4 style={{color:"#00d4ff", fontSize:13, marginBottom:4}}>趋势加速度分析</h4>
          <p style={{color:"#5a6d8a", fontSize:12, marginBottom:6}}>正加速=恶化加快，负加速=恶化减缓</p>
          {trendAccel.items.filter(d => d.point_code === selectedPoint).slice(0, 1).map((d, i) => (
            <div key={i}>
              <span style={{color:"#c8d6e5", fontSize:12}}>趋势方向: </span>
              <span style={{
                color: d.trend_direction === "加速恶化" ? "#e65100" : d.trend_direction === "减速" ? "#2e7d32" : "#d4a050",
                fontWeight:600, fontSize:12
              }}>{d.trend_direction}</span>
              {typeof d.accel_val === "number" && (
                <span style={{color:"#98aec9", fontSize:11, marginLeft:8}}>加速度: {d.accel_val.toFixed(2)}/日²</span>
              )}
            </div>
          ))}
          {/* Show all items with non-null accel */}
          <div style={{display:"flex", flexWrap:"wrap", gap:4, marginTop:6}}>
            {trendAccel.items.filter(d => d.point_code === selectedPoint && d.accel_val != null).slice(0, 5).map((d, i) => (
              <span key={i} style={{fontSize:12, padding:"2px 6px", borderRadius:2,
                background: (d.accel_val || 0) > 0 ? "#2a0a0a" : "#0a1a0a",
                color: (d.accel_val || 0) > 0 ? "#e65100" : "#2e7d32"
              }}>{d.latest_daily_change?.toFixed(1)}mm/日 → {(d.latest_daily_change||0) + (d.accel_val||0)}mm/日(次)</span>
            ))}
          </div>
        </div>
      )}
      {/* 阈值逼近分析 */}
      {thresholdProx && thresholdProx.items && (
        <div className="card" style={{marginBottom:12}}>
          <h4 style={{color:"#d4a050", fontSize:13, marginBottom:4}}>阈值逼近度</h4>
          {thresholdProx.items.filter(d => d.point_code === selectedPoint).slice(0, 1).map((d, i) => {
            const ratio = d.proximity_ratio || 0;
            const barColor = ratio > 1 ? "#e65100" : ratio > 0.7 ? "#d4a050" : "#2e7d32";
            return (
              <div key={i}>
                <div style={{display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:2}}>
                  <span style={{color:"#98aec9"}}>累计变化: {d.cumulative_change?.toFixed(2) ?? "-"} / 设计限值: {d.design_limit}</span>
                  <span style={{color:barColor, fontWeight:600}}>{ratio > 1 ? "已超限" : ratio > 0.7 ? "逼近中" : "安全"}</span>
                </div>
                <div style={{height:6, background:"#1a2640", borderRadius:3, overflow:"hidden"}}>
                  <div style={{height:"100%", width:Math.min(ratio*100, 100)+"%", background:barColor, borderRadius:3, transition:"width 0.5s"}} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {false && analysis?.data_gaps && (
        <section style={{marginBottom:14}}>
          <h3 style={{color:"#6a7d9e", fontSize:14, marginBottom:6}}>数据缺口</h3>
          <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
            {(analysis?.data_gaps ?? []).map((g, i) => (
              <div key={i} style={{background:"#1a1210", border:"1px solid #5a3a1a", borderRadius:4, padding:"6px 12px"}}>
                <span style={{fontSize:12, color:"#d4a050", fontWeight:600}}>{g.category}</span>
                <span style={{fontSize:12, color:"#8a6d5a", marginLeft:8}}>{g.description}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}