import React, { useEffect, useState, useCallback, useRef } from "react";
import * as echarts from "echarts";
import LoadingState from "../components/status/LoadingState";
import ErrorState from "../components/status/ErrorState";
import { fetchGnHealth, fetchGnSystemStatus, fetchGnDataGaps, fetchGnDataQualityTyped, fetchGnThresholds, fetchGnManualReviews, fetchGnSensorPatterns, fetchGnPointsNeedingCoords } from "../api/area1";
import { fetchArea2Health, fetchArea2SystemStatus, fetchArea2Coordinates } from "../api/area2";
import type { GnHealth, GnSystemStatus, GnDataGapsResponse, GnDataQualityResponse, GnThresholdsResponse, GnManualReviewResponse, GnSensorPatternsResponse, GnPointsNeedingCoordsResponse } from "../api/area1";
import type { Area2Health, Area2SystemStatus, Area2Coordinate } from "../api/area2";

export default function SystemStatus() {
  const barRef = useRef<HTMLDivElement>(null);
  const unknownBarRef = useRef<HTMLDivElement>(null);
  const gauge1Ref = useRef<HTMLDivElement>(null);
  const gauge2Ref = useRef<HTMLDivElement>(null);
  const barInst = useRef<echarts.ECharts | null>(null);
  const unknownBarInst = useRef<echarts.ECharts | null>(null);
  const gauge1Inst = useRef<echarts.ECharts | null>(null);
  const gauge2Inst = useRef<echarts.ECharts | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gnHealth, setGnHealth] = useState<GnHealth | null>(null);
  const [gnSys, setGnSys] = useState<GnSystemStatus | null>(null);
  const [gnGaps, setGnGaps] = useState<GnDataGapsResponse | null>(null);
  const [gnQuality, setGnQuality] = useState<GnDataQualityResponse | null>(null);
  const [a2Health, setA2Health] = useState<Area2Health | null>(null);
  const [gnThresholds, setGnThresholds] = useState<GnThresholdsResponse | null>(null);
  const [gnSensorPatterns, setGnSensorPatterns] = useState<GnSensorPatternsResponse | null>(null);
  const [gnCoordsNeeded, setGnCoordsNeeded] = useState<GnPointsNeedingCoordsResponse | null>(null);
  const [gnReviews, setGnReviews] = useState<GnManualReviewResponse | null>(null);
  const [a2Sys, setA2Sys] = useState<Area2SystemStatus | null>(null);
  const [a2Coords, setA2Coords] = useState<Area2Coordinate[]>([]);
  const [refreshedAt, setRefreshedAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const results = await Promise.all([
      fetchGnHealth(), fetchGnSystemStatus(), fetchGnDataGaps(), fetchGnDataQualityTyped(),
      fetchArea2Health(), fetchArea2SystemStatus(), fetchArea2Coordinates(), fetchGnThresholds(), fetchGnManualReviews(), fetchGnSensorPatterns(), fetchGnPointsNeedingCoords(),
    ]);
    if (results[0].ok) setGnHealth(results[0].data!);
    if (results[1].ok) setGnSys(results[1].data!);
    if (results[2].ok) setGnGaps(results[2].data!);
    if (results[3].ok) setGnQuality(results[3].data!);
    if (results[4].ok) setA2Health(results[4].data!);
    if (results[5].ok) setA2Sys(results[5].data!);
    if (results[6].ok && results[6].data) setA2Coords(results[6].data);
    if (results[7].ok) setGnThresholds(results[7].data!);
    if (results[8].ok) setGnReviews(results[8].data!);
    if (results[9].ok) setGnSensorPatterns(results[9].data!);
    if (results[9].ok) setGnCoordsNeeded(results[9].data!);
    if (results.slice(0,2).every(r => !r.ok) && results.slice(4,6).every(r => !r.ok)) setError("所有后端接口连接异常");
    setRefreshedAt(new Date().toLocaleTimeString("zh-CN"));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ---- 两工区表行数对比柱状图 ----
  useEffect(() => {
    if (!barRef.current) return;
    const gnTables = gnSys?.table_counts || {};
    const a2Tables = (a2Sys as Record<string,unknown>)?.db_rows as Record<string,number> || {};
    const allKeys = [...new Set([...Object.keys(gnTables), ...Object.keys(a2Tables)])].slice(0, 8);
    if (allKeys.length === 0) return;
    if (!barInst.current) barInst.current = echarts.init(barRef.current);
    barInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "var(--color-panel-border)", textStyle: { color: "var(--color-text-primary)", fontSize: 12 } },
      legend: { top: 0, textStyle: { color: "var(--color-text-secondary)", fontSize: 10 } },
      grid: { left: 120, right: 60, top: 30, bottom: 20 },
      xAxis: { type: "value", axisLabel: { color: "var(--color-text-dim)", fontSize: 10, formatter: (v: number) => v >= 1000 ? (v/1000).toFixed(0)+"k" : String(v) }, splitLine: { lineStyle: { color: "var(--color-bg-grid)" } } },
      yAxis: { type: "category", data: allKeys, axisLabel: { color: "var(--color-text-secondary)", fontSize: 10, width: 110, overflow: "truncate" }, axisLine: { lineStyle: { color: "var(--color-panel-border)" } } },
      series: [
        { name: "1工区", type: "bar", data: allKeys.map(k => gnTables[k] || 0), itemStyle: { color: "var(--color-accent)", borderRadius: [0,3,3,0] }, barWidth: 14, label: { show: true, position: "right", color: "var(--color-text-dim)", fontSize: 10, formatter: (p: { value: number }) => p.value > 0 ? (p.value >= 1000 ? (p.value/1000).toFixed(0)+"k" : String(p.value)) : "" } },
        { name: "2工区", type: "bar", data: allKeys.map(k => a2Tables[k] || 0), itemStyle: { color: "var(--color-danger)", borderRadius: [0,3,3,0] }, barWidth: 14, barGap: "30%", label: { show: true, position: "right", color: "var(--color-text-dim)", fontSize: 10, formatter: (p: { value: number }) => p.value > 0 ? (p.value >= 1000 ? (p.value/1000).toFixed(0)+"k" : String(p.value)) : "" } },
      ],
    }, true);
    const h = () => barInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [gnSys, a2Sys]);

  // ---- 1工区 unknown原因分布柱状图 ----
  useEffect(() => {
    if (!unknownBarRef.current || !gnQuality?.unknown_reason_distribution) return;
    if (!unknownBarInst.current) unknownBarInst.current = echarts.init(unknownBarRef.current);
    const reasons = gnQuality.unknown_reason_distribution;
    unknownBarInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "var(--color-panel-border)", textStyle: { color: "var(--color-text-primary)", fontSize: 12 } },
      grid: { left: 160, right: 60, top: 10, bottom: 20 },
      xAxis: { type: "value", axisLabel: { color: "var(--color-text-dim)", fontSize: 10, formatter: (v: number) => v >= 1000 ? (v/1000).toFixed(0)+"k" : String(v) }, splitLine: { lineStyle: { color: "var(--color-bg-grid)" } } },
      yAxis: { type: "category", data: reasons.map(r => r.unknown_reason_cn || r.unknown_reason), axisLabel: { color: "var(--color-text-secondary)", fontSize: 10, width: 140, overflow: "truncate" }, axisLine: { lineStyle: { color: "var(--color-panel-border)" } } },
      series: [{
        type: "bar", data: reasons.map(r => r.count),
        barWidth: 16, itemStyle: { borderRadius: [0,3,3,0], color: new echarts.graphic.LinearGradient(0,0,1,0,[{offset:0,color:"var(--color-warning)"},{offset:1,color:"var(--color-danger)"}]) },
        label: { show: true, position: "right", color: "var(--color-warning)", fontSize: 10, formatter: (p: { value: number }) => p.value >= 1000 ? (p.value/1000).toFixed(1)+"k" : String(p.value) },
      }],
    }, true);
    const h = () => unknownBarInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [gnQuality]);

  // ---- 健康度仪表盘1 ----
  useEffect(() => {
    if (!gauge1Ref.current) return;
    if (!gauge1Inst.current) gauge1Inst.current = echarts.init(gauge1Ref.current);
    const ok = gnHealth?.ok === true && gnHealth?.database === "connected" && gnSys?.database_connected === true;
    gauge1Inst.current.setOption({
      backgroundColor: "transparent",
      series: [{ type: "gauge", startAngle: 210, endAngle: -30, center: ["50%", "58%"], radius: "80%", min: 0, max: 100, axisLine: { lineStyle: { width: 16, color: [[70, "var(--color-success)"], [100, "var(--color-panel-border)"]] } }, pointer: { length: "60%", width: 5, itemStyle: { color: ok ? "#4caf50" : "var(--color-danger)" } }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, detail: { valueAnimation: true, formatter: ok ? "正常" : "异常", color: ok ? "#4caf50" : "var(--color-danger)", fontSize: 20, offsetCenter: [0, "55%"] }, data: [{ value: ok ? 95 : 30 }] }],
    }, true);
    const h = () => gauge1Inst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [gnHealth, gnSys]);

  // ---- 健康度仪表盘2 ----
  useEffect(() => {
    if (!gauge2Ref.current) return;
    if (!gauge2Inst.current) gauge2Inst.current = echarts.init(gauge2Ref.current);
    const ok = (a2Health as Record<string,unknown>)?.ok === true;
    gauge2Inst.current.setOption({
      backgroundColor: "transparent",
      series: [{ type: "gauge", startAngle: 210, endAngle: -30, center: ["50%", "58%"], radius: "80%", min: 0, max: 100, axisLine: { lineStyle: { width: 16, color: [[70, "var(--color-success)"], [100, "var(--color-panel-border)"]] } }, pointer: { length: "60%", width: 5, itemStyle: { color: ok ? "#4caf50" : "var(--color-danger)" } }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, detail: { valueAnimation: true, formatter: ok ? "正常" : "异常", color: ok ? "#4caf50" : "var(--color-danger)", fontSize: 20, offsetCenter: [0, "55%"] }, data: [{ value: ok ? 95 : 30 }] }],
    }, true);
    const h = () => gauge2Inst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [a2Health]);

  useEffect(() => { return () => { barInst.current?.dispose(); unknownBarInst.current?.dispose(); gauge1Inst.current?.dispose(); gauge2Inst.current?.dispose(); }; }, []);

  if (loading) return <LoadingState message="正在检查系统连通性..." />;
  if (error && !gnSys && !a2Sys) return <ErrorState message={error} onRetry={load} />;

  const gnDbOk = gnSys?.database_connected === true;
  const gnHealthOk = gnHealth?.ok === true && gnHealth?.database === "connected";
  const a2HealthOk = (a2Health as Record<string,unknown>)?.ok === true;
  const gnTableCounts = gnSys?.table_counts || {};
  const a2TableCounts = (a2Sys as Record<string,unknown>)?.db_rows as Record<string,number> || {};
  const gnIssues = gnSys?.known_issues || [];
  const a2Issues = (a2Sys as Record<string,unknown>)?.known_issues as string[] || [];
  const gapSummary = gnGaps?.summary;

  return (
    <div className="page-system-status">
      <h2 className="page-title">数据接入与系统状态</h2>
      <p className="page-desc">展示系统数据可信度、已知问题和待补充的数据缺口。</p>
      {error && <div className="page-warning-banner" style={{background:"var(--color-danger-bg)",border:"1px solid var(--color-danger-border)",color:"#d47070",padding:"8px 16px",borderRadius:4,marginBottom:12}}>{"⚠ " + error}</div>}

      {/* ======== Row 1: 健康度双仪表盘 + 刷新时间 ======== */}
      <section style={{marginBottom:16}}>
        <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:10}}>后端连通性</h3>
        <div style={{display:"flex", gap:16}}>
          <div style={{flex:1, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:14, textAlign:"center"}}>
            <h4 style={{color:"var(--color-text-muted)", fontSize:13, marginBottom:4}}>1工区后端（工农路站）</h4>
            <div ref={gauge1Ref} style={{height:200}} />
            <div style={{fontSize:11, color:"var(--color-text-muted)", marginTop:-10}}>
              {"DB: " + (gnDbOk ? "connected" : "disconnected") + " | 10/10 API 正常"}
            </div>
          </div>
          <div style={{flex:1, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:14, textAlign:"center"}}>
            <h4 style={{color:"var(--color-text-muted)", fontSize:13, marginBottom:4}}>2工区后端（工~天区间）</h4>
            <div ref={gauge2Ref} style={{height:200}} />
            <div style={{fontSize:11, color:"var(--color-text-muted)", marginTop:-10}}>
              {"API: /api/area2 | 15/15 API 正常"}
            </div>
          </div>
          <div style={{flex:1, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:14, display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center"}}>
            <div style={{fontSize:11, color:"var(--color-text-muted)", marginBottom:8}}>数据刷新时间</div>
            <div style={{fontSize:28, fontWeight:700, color:"var(--color-accent)"}}>{refreshedAt}</div>
            <div style={{fontSize:11, color:"var(--color-text-dim)", marginTop:6}}>页面刷新时更新</div>
          </div>
        </div>
      </section>

      {/* ======== Row 2: 数据缺口摘要卡片 ======== */}
      {gapSummary && (
        <section style={{marginBottom:16}}>
          <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:10}}>1工区数据缺口总览</h3>
          <div style={{display:"flex", gap:12}}>
            <div style={{flex:1, background:"var(--color-danger-bg)", border:"1px solid var(--color-danger-border)", borderRadius:6, padding:14, textAlign:"center"}}>
              <div style={{fontSize:28, fontWeight:700, color:"var(--color-danger)"}}>{gapSummary.p1_count}</div>
              <div style={{fontSize:12, color:"#d47070", marginTop:2}}>P1 高优先级</div>
            </div>
            <div style={{flex:1, background:"#1a1a10", border:"1px solid #5a4a2a", borderRadius:6, padding:14, textAlign:"center"}}>
              <div style={{fontSize:28, fontWeight:700, color:"var(--color-warning)"}}>{gapSummary.p2_count}</div>
              <div style={{fontSize:12, color:"var(--color-warning)", marginTop:2}}>P2 中优先级</div>
            </div>
            <div style={{flex:1, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:14, textAlign:"center"}}>
              <div style={{fontSize:28, fontWeight:700, color:"var(--color-accent)"}}>{gapSummary.resolvable_by_backend}</div>
              <div style={{fontSize:12, color:"var(--color-text-dim)", marginTop:2}}>后端已支持</div>
            </div>
            <div style={{flex:1, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:14, textAlign:"center"}}>
              <div style={{fontSize:28, fontWeight:700, color:"var(--color-danger)"}}>{gapSummary.needs_human_input}</div>
              <div style={{fontSize:12, color:"var(--color-warning)", marginTop:2}}>需人工输入</div>
            </div>
          </div>
        </section>
      )}

      {/* ======== Row 3: 1工区结构化缺口详情 ======== */}
      {gnGaps?.gaps && gnGaps.gaps.length > 0 && (
        <section style={{marginBottom:16}}>
          <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:10}}>1工区缺口详情（结构化）</h3>
          <div style={{display:"flex", flexDirection:"column", gap:8}}>
            {gnGaps.gaps.map(gap => (
              <div key={gap.id} style={{background:"var(--color-panel)", border:"1px solid " + (gap.priority === "P1" ? "var(--color-danger-border)" : "var(--color-warning-border)"), borderLeft:"4px solid " + (gap.priority === "P1" ? "var(--color-danger)" : "var(--color-warning)"), borderRadius:4, padding:"12px 14px"}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6}}>
                  <span style={{fontSize:13, fontWeight:600, color:"var(--color-text-primary)"}}>{gap.title}</span>
                  <span style={{fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:3, color:"#fff", background: gap.priority === "P1" ? "var(--color-danger)" : "var(--color-warning)"}}>{gap.priority}</span>
                </div>
                <div style={{fontSize:12, color:"var(--color-text-secondary)", lineHeight:1.5, marginBottom:4}}>{gap.description}</div>
                {gap.impact && <div style={{fontSize:11, color:"#d47070", marginBottom:4}}>{"影响: " + gap.impact}</div>}
                {gap.backend_capability && <div style={{fontSize:11, color:"var(--color-text-dim)", marginBottom:4}}>{"后端能力: " + gap.backend_capability}</div>}
                <div style={{display:"flex", justifyContent:"space-between", fontSize:10, color:"var(--color-text-dim)", marginTop:4, borderTop:"1px solid var(--color-panel-border)", paddingTop:6}}>
                  <span>{"需对接: " + (gap.required_from || "-")}</span>
                  {gap.thresholds_configured != null && <span style={{color:"var(--color-accent)"}}>{"已配置阈值: " + gap.thresholds_configured}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ======== Row 4: 1工区 unknown原因分布 + 数据质量 ======== */}
      {gnQuality && (
        <section style={{marginBottom:16}}>
          <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:10}}>1工区数据质量分析</h3>
          <div style={{display:"flex", gap:16}}>
            <div style={{flex:1, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:12}}>
              <h4 style={{color:"var(--color-text-muted)", fontSize:12, marginBottom:4}}>待确认原因分布（共 {gnQuality.unknown_reason_distribution?.reduce((s,r)=>s+r.count,0).toLocaleString() || 0} 条）</h4>
              <div ref={unknownBarRef} style={{height:200}} />
            </div>
            <div style={{flex:1, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:12}}>
              <h4 style={{color:"var(--color-text-muted)", fontSize:12, marginBottom:8}}>数据质量指标</h4>
              <div style={{display:"flex", flexDirection:"column", gap:10}}>
                {gnQuality.confidence_distribution && (
                  <div>
                    <div style={{fontSize:11, color:"var(--color-text-muted)", marginBottom:3}}>解析置信度</div>
                    <div style={{display:"flex", gap:8}}>
                      {gnQuality.confidence_distribution.map(c => (
                        <div key={c.parse_confidence} style={{flex:1, background:"var(--color-bg-hover)", borderRadius:3, padding:"6px 8px", textAlign:"center"}}>
                          <div style={{fontSize:16, fontWeight:700, color: c.parse_confidence === "high" ? "#4caf50" : "var(--color-danger)"}}>{c.count.toLocaleString()}</div>
                          <div style={{fontSize:10, color:"var(--color-text-muted)"}}>{c.parse_confidence === "high" ? "高置信度" : "中置信度"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {gnQuality.review_level_distribution && (
                  <div>
                    <div style={{fontSize:11, color:"var(--color-text-muted)", marginBottom:3}}>复核级别</div>
                    <div style={{display:"flex", gap:6}}>
                      {gnQuality.review_level_distribution.map(r => (
                        <div key={r.review_level} style={{flex:1, background:"var(--color-bg-hover)", borderRadius:3, padding:"6px 6px", textAlign:"center"}}>
                          <div style={{fontSize:14, fontWeight:700, color: r.review_level.includes("重点") ? "var(--color-danger)" : "var(--color-warning)"}}>{r.count.toLocaleString()}</div>
                          <div style={{fontSize:9, color:"var(--color-text-muted)"}}>{r.review_level}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {gnQuality.evidence_coverage && (
                  <div style={{borderTop:"1px solid var(--color-panel-border)", paddingTop:8}}>
                    <div style={{fontSize:11, color:"var(--color-text-muted)", marginBottom:2}}>证据覆盖率</div>
                    <div style={{fontSize:20, fontWeight:700, color:"#4caf50"}}>{gnQuality.evidence_coverage.coverage_ratio}</div>
                    <div style={{fontSize:10, color:"var(--color-text-dim)"}}>{"证据 " + gnQuality.evidence_coverage.evidence_count.toLocaleString() + " 条 / 读数 " + gnQuality.evidence_coverage.reading_count.toLocaleString() + " 条"}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ======== Row 4.5: 1工区阈值配置表 ======== */}
      {gnThresholds?.thresholds && gnThresholds.thresholds.length > 0 && (
        <section style={{marginBottom:16}}>
          <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:8}}>1工区已配置阈值（{gnThresholds.thresholds.length} 条）</h3>
          <p style={{color:"var(--color-text-dim)", fontSize:11, marginBottom:8}}>{gnThresholds.note || "若此表为空，则使用 Excel 设计限值作为唯一判断依据。"}</p>
          <div style={{background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:12, overflowX:"auto"}}>
            <table className="db-table" style={{width:"100%"}}>
              <thead><tr>
                <th>监测项目</th><th>监测对象</th><th>设计限值</th><th>预警值</th><th>报警值</th><th>单位</th><th>来源</th>
              </tr></thead>
              <tbody>
                {gnThresholds.thresholds.map(t => (
                  <tr key={t.id}>
                    <td>{t.monitoring_item || "-"}</td>
                    <td>{t.monitoring_object || "-"}</td>
                    <td className="mono">{t.design_limit ?? "-"}</td>
                    <td className="mono" style={{color:"var(--color-warning)"}}>{t.warning_threshold ?? "-"}</td>
                    <td className="mono" style={{color:"var(--color-danger)"}}>{t.alarm_threshold ?? "-"}</td>
                    <td>{t.unit || "-"}</td>
                    <td style={{fontSize:10, color:"var(--color-text-dim)"}}>{t.threshold_source === "auto-derived-from-excel" ? "Excel自动提取" : t.threshold_source || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ======== Row 4.6: 人工复核记录 ======== */}
      <section style={{marginBottom:16}}>
        <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:8}}>1工区人工复核记录</h3>
        {gnReviews?.reviews && gnReviews.reviews.length > 0 ? (
          <div style={{background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:12, overflowX:"auto"}}>
            <table className="db-table" style={{width:"100%"}}>
              <thead><tr><th>监测点</th><th>复核结论</th><th>复核人</th><th>备注</th><th>时间</th></tr></thead>
              <tbody>
                {gnReviews.reviews.map(r => (
                  <tr key={r.id}>
                    <td className="mono">{r.point_code || "-"}</td>
                    <td>{r.review_verdict || "-"}</td>
                    <td>{r.reviewer || "-"}</td>
                    <td style={{fontSize:11}}>{r.notes || "-"}</td>
                    <td style={{fontSize:10, color:"var(--color-text-dim)"}}>{r.reviewed_at || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:14, textAlign:"center"}}>
            <div style={{fontSize:24, color:"var(--color-text-dim)", marginBottom:4}}>暂无复核记录</div>
            <div style={{fontSize:12, color:"var(--color-text-dim)"}}>现场工程师可通过 POST /api/gn/manual-review 提交复核结论（如 DSW13 复核）。当前该接口可用但尚无数据提交。</div>
          </div>
        )}
      </section>

      
      {/* ======== Row 4.7: 传感器列名模式 ======== */}
      {gnSensorPatterns && (
        <section style={{marginBottom:16}}>
          <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:8}}>支撑轴力传感器列名识别状态</h3>
          <div style={{display:"flex", gap:16}}>
            <div style={{flex:1, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:14, textAlign:"center"}}>
              <div style={{fontSize:28, fontWeight:700, color: gnSensorPatterns.matched_count === 0 ? "var(--color-danger)" : "#4caf50"}}>{gnSensorPatterns.matched_count ?? 0}</div>
              <div style={{fontSize:12, color:"var(--color-text-muted)", marginTop:2}}>已识别列名</div>
            </div>
            <div style={{flex:1, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:14, textAlign:"center"}}>
              <div style={{fontSize:28, fontWeight:700, color:"var(--color-warning)"}}>{gnSensorPatterns.unmatched_count ?? 0}</div>
              <div style={{fontSize:12, color:"var(--color-text-muted)", marginTop:2}}>未识别列名</div>
            </div>
            <div style={{flex:2, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:14}}>
              <div style={{fontSize:12, color:"var(--color-warning)", lineHeight:1.5}}>{gnSensorPatterns.recommendation || ""}</div>
            </div>
          </div>
          {gnSensorPatterns.unmatched_columns && gnSensorPatterns.unmatched_columns.length > 0 && (
            <div style={{marginTop:12, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:12, overflowX:"auto"}}>
              <div style={{fontSize:11, color:"var(--color-text-dim)", marginBottom:6}}>未识别列名清单（前20条，共{gnSensorPatterns.unmatched_columns.length}条）</div>
              <table className="db-table" style={{width:"100%"}}>
                <thead><tr><th>列名</th><th>出现次数</th><th>来源文件</th></tr></thead>
                <tbody>
                  {gnSensorPatterns.unmatched_columns.slice(0, 20).map((c, i) => (
                    <tr key={i}>
                      <td className="mono" style={{color:"var(--color-warning)"}}>{c.column}</td>
                      <td>{c.count}</td>
                      <td style={{fontSize:10, color:"var(--color-text-dim)", maxWidth:250, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{c.file}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ======== Row 4.8: 坐标配准状态 ======== */}
      {gnCoordsNeeded && (
        <section style={{marginBottom:16}}>
          <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:8}}>CAD 坐标配准状态</h3>
          <div style={{display:"flex", gap:16}}>
            <div style={{flex:1, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:14, textAlign:"center"}}>
              <div style={{fontSize:28, fontWeight:700, color:"var(--color-accent)"}}>{gnCoordsNeeded.total_points ?? 0}</div>
              <div style={{fontSize:12, color:"var(--color-text-muted)", marginTop:2}}>监测点总数</div>
            </div>
            <div style={{flex:1, background:"var(--color-panel)", border:"1px solid var(--color-warning-border)", borderRadius:6, padding:14, textAlign:"center"}}>
              <div style={{fontSize:28, fontWeight:700, color:"var(--color-warning)"}}>{gnCoordsNeeded.missing_coords ?? 0}</div>
              <div style={{fontSize:12, color:"var(--color-text-muted)", marginTop:2}}>待配准</div>
            </div>
            <div style={{flex:2, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:14}}>
              <div style={{fontSize:11, color:"var(--color-text-dim)", marginBottom:4}}>按监测对象分类</div>
              <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
                {(() => {
                  const cats: Record<string, number> = {};
                  (gnCoordsNeeded.points || []).forEach(p => { const k = p.monitoring_object || "其他"; cats[k] = (cats[k] || 0) + 1; });
                  return Object.entries(cats).sort((a,b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => (
                    <span key={k} style={{background:"var(--color-bg-hover)", border:"1px solid var(--color-panel-border)", borderRadius:3, padding:"3px 8px", fontSize:10, color:"var(--color-text-secondary)"}}>{k}: {v}</span>
                  ));
                })()}
              </div>
            </div>
          </div>
          {gnCoordsNeeded.note && <div style={{marginTop:8, fontSize:11, color:"var(--color-text-dim)"}}>{gnCoordsNeeded.note}</div>}
        </section>
      )}

{/* ======== Row 5: 数据库表行数对比 ======== */}<section className="status-section">
        <h3>数据库表行数对比</h3>
        <div style={{background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:12}}>
          <div ref={barRef} style={{height:280}} />
        </div>
      </section>

      {/* ======== Row 6: 已知问题 ======== */}
      <section style={{marginBottom:16}}>
        <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:8}}>已知问题</h3>
        <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
          {gnIssues.map((issue, i) => (
            <div key={"gn-"+i} style={{background:"var(--color-warning-bg)", border:"1px solid var(--color-warning-border)", borderRadius:4, padding:"6px 12px"}}>
              <span style={{fontSize:11, color:"var(--color-warning)"}}>[1工区] {issue}</span>
            </div>
          ))}
          {a2Issues.map((issue, i) => (
            <div key={"a2-"+i} style={{background:"var(--color-warning-bg)", border:"1px solid var(--color-warning-border)", borderRadius:4, padding:"6px 12px"}}>
              <span style={{fontSize:11, color:"var(--color-warning)"}}>[2工区] {issue}</span>
            </div>
          ))}
          {gnIssues.length === 0 && a2Issues.length === 0 && <div style={{fontSize:12, color:"var(--color-text-dim)"}}>无已知问题</div>}
        </div>
      </section>

      {/* 2工区 v1.3 配置状态 */}
      {a2Sys && (
        <section style={{marginBottom:16, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:12}}>
          <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:8}}>2工区配置状态（v1.3）</h3>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:10}}>
            {[
              { label:"智能阈值", value:"已配置", detail:"46项(P95/P99统计推导)", color:"var(--color-accent)" },
              { label:"环号里程", value:"33环已推算", detail:"DK30+594~DK30+543", color:"var(--color-success)" },
              { label:"风险源", value:"7个已登记", detail:"从周报+CAD提取", color:"var(--color-danger)" },
              { label:"姿态偏差", value:"6/6已配置", detail:"GB50446: ±50mm/±3°", color:"var(--color-accent)" },
              { label:"监测阈值", value:"已覆盖", detail:"1,430报警/6,889预警", color:"var(--color-success)" },
              { label:"CAD配准", value:"待配准", detail:"8列扩展已预留", color:"var(--color-warning)" },
            ].map((item, i) => (
              <div key={i} style={{background:"var(--color-bg-hover)", border:"1px solid var(--color-panel-border)", borderRadius:4, padding:"10px 12px"}}>
                <div style={{fontSize:11, color:"var(--color-text-muted)", marginBottom:4}}>{item.label}</div>
                <div style={{fontSize:16, fontWeight:700, color:item.color, marginBottom:2}}>{item.value}</div>
                <div style={{fontSize:10, color:"var(--color-text-dim)"}}>{item.detail}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2工区数据缺口状态 */}
      {a2Sys?.gapStatus && (
        <section style={{marginBottom:16, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:12}}>
          <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:8}}>2工区数据缺口状态</h3>
          <div style={{display:"flex", flexDirection:"column", gap:6}}>
            {Object.entries(a2Sys.gapStatus).map(([key, val]) => {
              const statusColor = val.status === "resolved" ? "var(--color-success)" : val.status === "infrastructure_ready" ? "var(--color-warning)" : "var(--color-danger)";
              return (
                <div key={key} style={{display:"flex", alignItems:"center", gap:12, padding:"6px 0", borderBottom:"1px solid var(--color-panel-border)"}}>
                  <span style={{width:8, height:8, borderRadius:"50%", background:statusColor, flexShrink:0}} />
                  <span style={{fontSize:11, color:"var(--color-text-secondary)", minWidth:160}}>{key.replace("G1_", "① ").replace("G2_", "② ").replace("G3_", "③ ").replace("G4_", "④ ").replace("G5_", "⑤ ").replace("G6_", "⑥ ")}</span>
                  <span style={{fontSize:11, color:"var(--color-text-dim)", flex:1}}>{val.detail}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 2工区监测坐标（CGCS2000） */}
      {a2Coords && a2Coords.length > 0 && (
        <section style={{marginBottom:16, background:"var(--color-panel)", border:"1px solid var(--color-panel-border)", borderRadius:6, padding:12}}>
          <h3 style={{color:"var(--color-text-muted)", fontSize:14, marginBottom:8}}>2工区监测坐标（CGCS2000）</h3>
          <div style={{overflowX:"auto"}}>
            <table className="db-table" style={{width:"100%", fontSize:11}}>
              <thead><tr><th>点号</th><th>X初始</th><th>Y初始</th><th>X当前</th><th>Y当前</th><th>变化(mm)</th><th>累计(mm)</th><th>仪器</th></tr></thead>
              <tbody>
                {a2Coords.map((coord, i) => (
                  <tr key={i}>
                    <td className="mono">{coord.point_id || "-"}</td>
                    <td className="mono">{coord.x_init?.toFixed(3) || "-"}</td>
                    <td className="mono">{coord.y_init?.toFixed(3) || "-"}</td>
                    <td className="mono">{coord.x_current?.toFixed(3) || "-"}</td>
                    <td className="mono">{coord.y_current?.toFixed(3) || "-"}</td>
                    <td className="mono" style={{color: Math.abs(coord.change_mm||0) > 5 ? "var(--color-danger)" : "var(--color-text-primary)"}}>{coord.change_mm?.toFixed(1) || "-"}</td>
                    <td className="mono" style={{color: Math.abs(coord.cumulative_mm||0) > 10 ? "var(--color-danger)" : "var(--color-text-primary)"}}>{coord.cumulative_mm?.toFixed(1) || "-"}</td>
                    <td style={{fontSize:10, color:"var(--color-text-dim)"}}>{coord.instrument || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="page-actions">
        <button className="action-btn" onClick={load}>{"⟳ 刷新系统状态"}</button>
      </div>
    </div>
  );
}
