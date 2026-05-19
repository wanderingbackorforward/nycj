import React, { useEffect, useState, useCallback, useRef } from "react";
import * as echarts from "echarts";
import LoadingState from "../components/status/LoadingState";
import ErrorState from "../components/status/ErrorState";
import { fetchArea2Documents } from "../api/area2";
import type { Area2Document } from "../api/area2";

const DOC_CATEGORY_CN: Record<string, string> = {
  daily_monitoring_xlsx: "日报监测（Excel）",
  weekly_report_pdf: "周报（PDF）",
  cad_drawing: "CAD 图纸",
  excel_report: "Excel 报告",
  pdf_report: "PDF 报告",
};

export default function DocumentsEvidence() {
  const pieRef = useRef<HTMLDivElement>(null);
  const gaugeRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<HTMLDivElement>(null);
  const pieInst = useRef<echarts.ECharts | null>(null);
  const gaugeInst = useRef<echarts.ECharts | null>(null);
  const tlInst = useRef<echarts.ECharts | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [a2Docs, setA2Docs] = useState<Area2Document[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await fetchArea2Documents();
    if (res.ok && res.data) setA2Docs(res.data);
    else setError("文档接口连接异常");
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // 文档类别
  const cats: Record<string, Area2Document[]> = {};
  for (const d of a2Docs) {
    const cat = d.document_category || "other";
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(d);
  }

  // ---- 文档类型饼图 ----
  useEffect(() => {
    if (!pieRef.current || a2Docs.length === 0) return;
    if (!pieInst.current) pieInst.current = echarts.init(pieRef.current);
    const catCounts: Record<string, number> = {};
    for (const d of a2Docs) { const cat = d.document_category || "other"; catCounts[cat] = (catCounts[cat] || 0) + 1; }
    pieInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "item", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 } },
      legend: { orient: "vertical", right: 10, top: "center", textStyle: { color: "#7a8ba8", fontSize: 11 } },
      series: [{ type: "pie", radius: ["45%", "70%"], center: ["38%", "50%"], data: Object.entries(catCounts).map(([cat, count]) => ({ name: DOC_CATEGORY_CN[cat] || cat, value: count })), label: { color: "#8a9bb5", fontSize: 10 }, itemStyle: { borderColor: "#0a0e1a", borderWidth: 2 } }],
    }, true);
    const h = () => pieInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [a2Docs]);

  // ---- 证据覆盖率仪表盘 ----
  useEffect(() => {
    if (!gaugeRef.current || a2Docs.length === 0) return;
    if (!gaugeInst.current) gaugeInst.current = echarts.init(gaugeRef.current);
    const cadCount = (cats["cad_drawing"] || []).length;
    const total = a2Docs.length;
    const pct = Math.round((cadCount / Math.max(total, 1)) * 100);
    gaugeInst.current.setOption({
      backgroundColor: "transparent",
      series: [{
        type: "gauge", startAngle: 210, endAngle: -30, center: ["50%", "60%"], radius: "85%",
        min: 0, max: total,
        axisLine: { lineStyle: { width: 14, color: [[pct/100, "#ff8c42"], [1, "#1a2845"]] } },
        pointer: { length: "65%", width: 5, itemStyle: { color: "#ff8c42" } },
        axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { show: false },
        detail: { valueAnimation: true, formatter: "总计\n{value}份", color: "#e0e8f0", fontSize: 18, offsetCenter: [0, "55%"], lineHeight: 22 },
        data: [{ value: total }],
      }],
    }, true);
    const h = () => gaugeInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [a2Docs]);

  // ---- 文档时间线散点图 ----
  useEffect(() => {
    if (!tlRef.current || a2Docs.length === 0) return;
    if (!tlInst.current) tlInst.current = echarts.init(tlRef.current);

    const catList = Object.keys(cats);
    const dates = a2Docs.map(d => String(d.report_date || "")).filter(Boolean).sort();
    const minDate = dates[0] || "2026-01-01";
    const maxDate = dates[dates.length-1] || "2026-12-31";

    const scatterData: Array<{value: [string, string], docName: string}> = [];
    for (const d of a2Docs) {
      const dVal = String(d.report_date || "");
      const cat = d.document_category || "other";
      if (dVal) scatterData.push({ value: [dVal, DOC_CATEGORY_CN[cat] || cat], docName: String(d.file_name || "") });
    }

    tlInst.current.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "item", backgroundColor: "rgba(15,21,37,0.95)", borderColor: "#1a2640", textStyle: { color: "#c8d6e5", fontSize: 12 }, formatter: (p: { value: string[]; data: { docName: string } }) => p.value[0] + "<br/>" + p.value[1] + "<br/>" + p.data.docName },
      grid: { left: 140, right: 20, top: 10, bottom: 24 },
      xAxis: { type: "category", data: [...new Set(dates)], axisLabel: { color: "#5a6d8a", fontSize: 9, rotate: 40 }, axisLine: { lineStyle: { color: "#1a2845" } }, name: "日期", nameTextStyle: { color: "#5a6d8a" } },
      yAxis: { type: "category", data: catList.map(c => DOC_CATEGORY_CN[c] || c), axisLabel: { color: "#8a9bb5", fontSize: 10 }, axisLine: { lineStyle: { color: "#1a2845" } } },
      series: [{ type: "scatter", data: scatterData, symbolSize: 12, itemStyle: { color: "#00d4ff", borderColor: "#0a0e1a", borderWidth: 1 } }],
    }, true);
    const h = () => tlInst.current?.resize();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [a2Docs]);

  useEffect(() => { return () => { pieInst.current?.dispose(); gaugeInst.current?.dispose(); tlInst.current?.dispose(); }; }, []);

  if (loading) return <LoadingState message="正在加载文档数据..." />;
  if (error && a2Docs.length === 0) return <ErrorState message={error} onRetry={load} />;

  const cadDocs = cats["cad_drawing"] || [];

  return (
    <div className="page-documents">
      <h2 className="page-title">报告与图纸证据</h2>
      <p className="page-desc">原始数据来源追溯：Excel 日报、PDF 周报、CAD 图纸及解析证据链。</p>
      {error && <div className="page-warning-banner" style={{background:"#2a0a0a",border:"1px solid #5a1a1a",color:"#d47070",padding:"8px 16px",borderRadius:4,marginBottom:12}}>{"⚠ " + error}</div>}

      {/* ======== Row 1: 文档类型饼图 + 覆盖率仪表盘 ======== */}
      <section style={{display:"flex", gap:16, marginBottom:16}}>
        <div style={{flex:1, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>文档类型分布</h4>
          <div ref={pieRef} style={{height:260}} />
        </div>
        <div style={{flex:1, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
          <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>证据总量</h4>
          <div ref={gaugeRef} style={{height:260}} />
        </div>
      </section>

      {/* ======== Row 2: 文档时间线散点图 ======== */}
      <section style={{marginBottom:16, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
        <h4 style={{color:"#6a7d9e", fontSize:13, marginBottom:4}}>文档时间线分布（按类别）</h4>
        <div ref={tlRef} style={{height:240}} />
      </section>

      {/* ======== Row 3: CAD 配准状态 ======== */}
      <section style={{marginBottom:16, background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:14}}>
        <h3 style={{color:"#6a7d9e", fontSize:14, marginBottom:8}}>CAD 图纸配准状态</h3>
        <div style={{display:"flex", gap:16, alignItems:"center"}}>
          <div style={{flex:1}}>
            <div style={{display:"flex", justifyContent:"space-between", marginBottom:4}}>
              <span style={{fontSize:12, color:"#8a9bb5"}}>已登记</span>
              <span style={{fontSize:12, color:"#00d4ff", fontWeight:600}}>{cadDocs.length} 份</span>
            </div>
            <div style={{height:8, background:"#1a2845", borderRadius:4, overflow:"hidden"}}>
              <div style={{height:"100%", width:"100%", background:"linear-gradient(90deg, #0d47a1, #00d4ff)", borderRadius:4}} />
            </div>
            <div style={{display:"flex", justifyContent:"space-between", marginTop:4, marginBottom:8}}>
              <span style={{fontSize:12, color:"#8a9bb5"}}>空间配准</span>
              <span style={{fontSize:12, color:"#d4a050", fontWeight:600}}>0 份</span>
            </div>
            <div style={{height:8, background:"#1a2845", borderRadius:4, overflow:"hidden"}}>
              <div style={{height:"100%", width:"0%", background:"#5a4a2a", borderRadius:4}} />
            </div>
          </div>
          <div style={{flex:1, borderLeft:"1px solid #1a2640", paddingLeft:16}}>
            <p style={{fontSize:12, color:"#8a9bb5", lineHeight:1.6}}>
              <strong style={{color:"#d4a050"}}>CAD 图纸已登记，待空间配准。</strong><br/>
              配准后可用于监测点空间定位和风险源空间分析。当前仅登记文件元信息，未进行坐标参考系配准。
            </p>
          </div>
        </div>
      </section>

      {/* ======== Row 4: 文档清点摘要 ======== */}
      <section>
        <h3 style={{color:"#6a7d9e", fontSize:14, marginBottom:8}}>文档清单（{a2Docs.length} 份）</h3>
        <div style={{display:"flex", gap:12, flexWrap:"wrap"}}>
          {Object.entries(cats).map(([cat, docs]) => (
            <div key={cat} style={{flex:"1 1 250px", background:"#0f1525", border:"1px solid #1a2640", borderRadius:6, padding:12}}>
              <h4 style={{color:"#5a8aaa", fontSize:12, marginBottom:8}}>{DOC_CATEGORY_CN[cat] || cat}（{docs.length} 份）</h4>
              <table className="db-table" style={{width:"100%"}}>
                <thead><tr><th>文件名</th><th>日期</th></tr></thead>
                <tbody>
                  {docs.slice(0, 5).map((d, i) => (
                    <tr key={i}><td className="mono" style={{fontSize:10, maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{d.file_name || "-"}</td><td style={{fontSize:10}}>{d.report_date || "-"}</td></tr>
                  ))}
                  {docs.length > 5 && <tr><td colSpan={2} style={{fontSize:10, color:"#5a6d8a", textAlign:"center"}}>... 还有 {docs.length - 5} 份</td></tr>}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}