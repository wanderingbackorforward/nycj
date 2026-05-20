import React, { useEffect, useState, useCallback } from "react";
import { fetchGnOverview, fetchGnSystemStatus, fetchGnDailyBriefing } from "../api/area1";
import { fetchArea2Overview, fetchArea2SystemStatus, fetchArea2AnalyticsOverview } from "../api/area2";
import type { GnOverview, GnSystemStatus, GnDailyBriefing } from "../api/area1";
import type { Area2Overview, Area2SystemStatus, Area2AnalyticsOverview } from "../api/area2";
import LoadingState from "../components/status/LoadingState";
import { cn, cnField } from "../utils/cnMap";

// 中文映射
const LEVEL_COLORS: Record<string, string> = {
  alarm: "#e65100", warning: "#d4a050", caution: "#1565c0", normal: "#2e7d32",
};
const LEVEL_LABELS: Record<string, string> = {
  alarm: "报警", warning: "预警", caution: "注意", normal: "正常",
};

export default function CommandOverview() {
  const [loading, setLoading] = useState(true);
  const [gnOverview, setGnOverview] = useState<GnOverview | null>(null);
  const [gnSys, setGnSys] = useState<GnSystemStatus | null>(null);
  const [a2Overview, setA2Overview] = useState<Area2Overview | null>(null);
  const [a2Sys, setA2Sys] = useState<Area2SystemStatus | null>(null);
  const [a2Analytics, setA2Analytics] = useState<Area2AnalyticsOverview | null>(null);
  const [gnBriefing, setGnBriefing] = useState<GnDailyBriefing | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [refreshTime, setRefreshTime] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gnO, gnS, a2O, a2S, a2AnalyticsR, gnBriefingR] = await Promise.all([
        fetchGnOverview("2026-04-14"),
        fetchGnSystemStatus(),
        fetchArea2Overview(),
        fetchArea2SystemStatus(),
        fetchArea2AnalyticsOverview(),
        fetchGnDailyBriefing(),
      ]);
      if (gnO.ok) setGnOverview(gnO.data!);
      if (gnS.ok) setGnSys(gnS.data!);
      if (a2O.ok) setA2Overview(a2O.data!);
      if (a2S.ok) setA2Sys(a2S.data!);
      if (a2AnalyticsR.ok) setA2Analytics(a2AnalyticsR.data!);
      if (gnBriefingR.ok) setGnBriefing(gnBriefingR.data!);
      setFetchError(!gnO.ok && !a2O.ok);
      setRefreshTime(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
    } catch { setFetchError(true); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState message="正在加载两个工区数据..." />;

  const gnCards = gnOverview?.cards || [];
  const a2Cards = a2Overview?.cards || [];
  const gnFindings = (gnOverview?.priority_findings || []) as Array<Record<string, unknown>>;
  const a2Findings = a2Overview?.findings || [];
  const a2Headline = a2Overview?.headline || "";
  const a2Level = a2Overview?.overallLevel || "normal";
      const gnActions = gnOverview?.actions || [];
  const a2Actions = a2Overview?.actions || [];

  return (
    <div>
      {/* Status bar */}
      <div className="flex items-center justify-between mb-5">
        {fetchError && (
          <span className="badge badge-warning text-xs">⚠ 部分接口连接异常</span>
        )}
        <div className="flex items-center gap-4 ml-auto text-xs" style={{ color: "#5a6d8a" }}>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: gnSys?.database_connected !== false ? "#2e7d32" : "#e65100" }} />
            1工区后端
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: a2Sys?.databaseConnected !== false ? "#2e7d32" : "#e65100" }} />
            2工区后端
          </span>
          <span>刷新 {refreshTime}</span>
          <button onClick={load} className="px-3 py-1 rounded text-xs cursor-pointer transition-colors" style={{ background: "#1a4a6a", color: "#98aec9", border: "1px solid #1a4a6a" }}>
            刷新
          </button>
        </div>
      </div>

      {/* ====== Row 1: Two-area cards ====== */}
      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* 1工区 */}
        <div className="card">
          <h3 className="text-sm font-semibold mb-3 pb-2 border-b" style={{ color: "#6a7d9e", borderColor: "#1a2640" }}>
            1工区 · 工农路站基坑
          </h3>
          <div className="grid grid-cols-4 gap-3">
            {gnCards.map((card, i) => {
              const labels = ["监测点数", "累计读数", "超设计限值", "待确认"];
              const isHighlight = i === 2; // 超设计限值
              return (
                <div key={i} className="text-center rounded p-3 transition-colors" style={{
                  background: isHighlight ? "#2a0a0a" : "#111e30",
                  border: isHighlight ? "1px solid #5a1a1a" : "1px solid #1a2640",
                }}>
                  <div className="text-xs mb-1" style={{ color: "#5a6d8a" }}>{card.name || labels[i]}</div>
                  <div className="font-bold" style={{ fontSize: "1.375rem", color: isHighlight ? "#e65100" : "#c8d6e5" }}>
                    {card.value?.toLocaleString() ?? "-"}
                    <span className="text-xs font-normal ml-0.5" style={{ color: "#5a6d8a" }}>{card.unit || "个"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2工区 */}
        <div className="card">
          <h3 className="text-sm font-semibold mb-3 pb-2 border-b" style={{ color: "#6a7d9e", borderColor: "#1a2640" }}>
            2工区 · 工~天盾构区间
          </h3>
          <div className="grid grid-cols-4 gap-3">
            {a2Cards.map((card, i) => {
              const isHighlight = card.level === "alarm";
              return (
                <div key={i} className="text-center rounded p-3 transition-colors" style={{
                  background: isHighlight ? "#2a0a0a" : "#111e30",
                  border: isHighlight ? "1px solid #5a1a1a" : "1px solid #1a2640",
                }}>
                  <div className="text-xs mb-1" style={{ color: "#5a6d8a" }}>{card.title}</div>
                  <div className="font-bold" style={{ fontSize: "1.375rem", color: isHighlight ? "#e65100" : "#c8d6e5" }}>
                    {card.value}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: "#5a6d8a" }}>{card.subtitle}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ====== Row 2: Route diagram + Conclusions ====== */}
      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: "200px 1fr 1fr" }}>
        {/* 工程线路示意 */}
        <div className="card flex flex-col items-center justify-center gap-2 py-6">
          <div className="text-xs font-semibold" style={{ color: "#00d4ff" }}>工程线路</div>
          <div className="flex flex-col items-center gap-3 w-full">
            <div className="text-center rounded px-3 py-2 w-full" style={{ background: "#111e30", border: "1px solid #1a4a6a" }}>
              <div className="text-xs font-semibold" style={{ color: "#c8d6e5" }}>1工区</div>
              <div className="text-[10px]" style={{ color: "#5a6d8a" }}>工农路站 · 基坑</div>
            </div>
            <div className="w-0.5 h-8" style={{ background: "#1a2640" }} />
            <div className="text-center rounded px-3 py-2 w-full" style={{ background: "#111e30", border: "1px solid #1a4a6a" }}>
              <div className="text-xs font-semibold" style={{ color: "#c8d6e5" }}>2工区</div>
              <div className="text-[10px]" style={{ color: "#5a6d8a" }}>
                工~天区间 · 环号{a2Overview?.position?.currentRing || "-"}
              </div>
            </div>
            <div className="w-0.5 h-8" style={{ background: "#1a2640" }} />
            <div className="text-center rounded px-3 py-2 w-full opacity-50" style={{ background: "#111e30", border: "1px dashed #1a2640" }}>
              <div className="text-xs" style={{ color: "#5a6d8a" }}>后续工区</div>
              <div className="text-[10px]" style={{ color: "#5a6d8a" }}>暂未接入</div>
            </div>
          </div>
        </div>

        {/* 1工区 研判结论 */}
        <div className="card card-warning">
          <h3 className="text-sm font-semibold mb-2" style={{ color: "#d4a050" }}>1工区研判</h3>
          <div className="flex gap-3 mb-3">
            <div className="flex-1 text-center rounded p-2" style={{ background: "#2a0a0a", border: "1px solid #5a1a1a" }}>
              <div className="text-lg font-bold" style={{ color: "#e65100" }}>{gnCards[2]?.value ?? "-"}</div>
              <div className="text-[10px]" style={{ color: "#5a6d8a" }}>超设计限值</div>
            </div>
            <div className="flex-1 text-center rounded p-2" style={{ background: "#1a1210", border: "1px solid #5a3a1a" }}>
              <div className="text-lg font-bold" style={{ color: "#d4a050" }}>{gnCards[3]?.value ?? "-"}</div>
              <div className="text-[10px]" style={{ color: "#5a6d8a" }}>待确认</div>
            </div>
            <div className="flex-1 text-center rounded p-2" style={{ background: "#111e30", border: "1px solid #1a2640" }}>
              <div className="text-lg font-bold" style={{ color: "#c8d6e5" }}>{gnFindings.length}</div>
              <div className="text-[10px]" style={{ color: "#5a6d8a" }}>重点复核</div>
            </div>
          </div>
          {gnFindings.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-2">
              {gnFindings.slice(0, 3).map((f, i) => (
                <div key={i} className="text-xs flex items-start gap-2" style={{ color: "#98aec9" }}>
                  <span className="px-1.5 py-0.5 rounded text-[10px] text-white whitespace-nowrap opacity-90" style={{ background: "#00d4ff" }}>
                    关注
                  </span>
                  <span>{String(f.point_code || "")} {String(f.monitoring_item || "")}: {String(f.summary || f.reason || "")}</span>
                </div>
              ))}
            </div>
          )}
          {gnOverview?.headline && (
            <p className="text-xs mt-2" style={{ color: "#6a7d9e" }}>{gnOverview.headline}</p>
          )}
        </div>

        {/* 2工区 研判结论 */}
        <div className="card" style={{ borderLeftColor: LEVEL_COLORS[a2Level] || "#1a4a6a" }}>
          <h3 className="text-sm font-semibold mb-2" style={{ color: LEVEL_COLORS[a2Level] || "#00d4ff" }}>2工区研判</h3>
          <div className="flex gap-3 mb-3">
            <div className="flex-1 text-center rounded p-2" style={{ background: "#111e30", border: "1px solid #1a2640" }}>
              <div className="text-lg font-bold" style={{ color: "#c8d6e5" }}>{a2Overview?.position?.currentRing || "-"}</div>
              <div className="text-[10px]" style={{ color: "#5a6d8a" }}>当前环号</div>
            </div>
            <div className="flex-1 text-center rounded p-2" style={{ background: "#111e30", border: "1px solid #1a2640" }}>
              <div className="text-lg font-bold" style={{ color: "#c8d6e5" }}>243k</div>
              <div className="text-[10px]" style={{ color: "#5a6d8a" }}>参数条数</div>
            </div>
            <div className="flex-1 text-center rounded p-2" style={{ background: "#1a1210", border: "1px solid #5a3a1a" }}>
              <div className="text-lg font-bold" style={{ color: "#d4a050" }}>待确认</div>
              <div className="text-[10px]" style={{ color: "#5a6d8a" }}>监测状态</div>
            </div>
          </div>
          {a2Headline && (
            <p className="text-xs mb-2" style={{ color: "#98aec9" }}>{a2Headline}</p>
          )}
          {a2Findings.slice(0, 2).map((f, i) => {
            const fr = f as Record<string, unknown>;
            return (
              <div key={i} className="text-xs flex items-start gap-2 mt-1" style={{ color: "#98aec9" }}>
                <span className="px-1.5 py-0.5 rounded text-[10px] text-white whitespace-nowrap opacity-90" style={{ background: LEVEL_COLORS[String(fr.level || "caution")] || "#00d4ff" }}>
                  {LEVEL_LABELS[String(fr.level || "")] || "注意"}
                </span>
                <span>{cn(String(fr.message || fr.description || fr.title || ""))}</span>
              </div>
            );
          })}
        </div>
      </div>

      
      {/* ====== Row 2.5: Analytics overview ====== */}
      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* 1工区 每日简报 */}
        {gnBriefing && (
          <div className="card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: "#00d4ff" }}>1工区每日简报</h3>
            <div className="grid grid-cols-4 gap-2 mb-2">
              <div className="text-center rounded p-2" style={{ background: "#0f1923", border: "1px solid #1a2640" }}>
                <div className="text-lg font-bold" style={{ color: "#c8d6e5" }}>{gnBriefing.summary?.point_count ?? "-"}</div>
                <div className="text-[10px]" style={{ color: "#5a6d8a" }}>监测点</div>
              </div>
              <div className="text-center rounded p-2" style={{ background: "#0f1923", border: "1px solid #1a2640" }}>
                <div className="text-lg font-bold" style={{ color: "#c8d6e5" }}>{gnBriefing.summary?.reading_count ?? "-"}</div>
                <div className="text-[10px]" style={{ color: "#5a6d8a" }}>当日读数</div>
              </div>
              <div className="text-center rounded p-2" style={{ background: "#2a0a0a", border: "1px solid #5a1a1a" }}>
                <div className="text-lg font-bold" style={{ color: "#e65100" }}>{gnBriefing.summary?.exceed_design_limit ?? "-"}</div>
                <div className="text-[10px]" style={{ color: "#5a6d8a" }}>超限</div>
              </div>
              <div className="text-center rounded p-2" style={{ background: "#1a1210", border: "1px solid #5a3a1a" }}>
                <div className="text-lg font-bold" style={{ color: "#d4a050" }}>{gnBriefing.summary?.severe_review ?? "-"}</div>
                <div className="text-[10px]" style={{ color: "#5a6d8a" }}>重点复核</div>
              </div>
            </div>
            {gnBriefing.top_worsening && gnBriefing.top_worsening.length > 0 && (
              <div className="text-xs" style={{ color: "#98aec9" }}>
                <span className="font-semibold" style={{ color: "#e65100" }}>恶化最快: </span>
                {gnBriefing.top_worsening.slice(0, 3).map((w, i) => (
                  <span key={i}>{w.point_code}({w.daily_chg?.toFixed(1)}/日){i < 2 ? "、" : ""}</span>
                ))}
              </div>
            )}
            {gnBriefing.recommendation && (
              <p className="text-[11px] mt-2 italic" style={{ color: "#5a6d8a" }}>{gnBriefing.recommendation}</p>
            )}
          </div>
        )}
        {/* 2工区 Analytics */}
        {a2Analytics && (
          <div className="card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: "#00d4ff" }}>2工区监测报警分布</h3>
            {a2Analytics.monitoring && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="text-center rounded p-2" style={{ background: "#0a1a0a", border: "1px solid #1a4a1a" }}>
                  <div className="text-lg font-bold" style={{ color: "#2e7d32" }}>{a2Analytics.monitoring.normal?.toLocaleString() ?? "-"}</div>
                  <div className="text-[10px]" style={{ color: "#5a6d8a" }}>正常</div>
                </div>
                <div className="text-center rounded p-2" style={{ background: "#1a1210", border: "1px solid #5a3a1a" }}>
                  <div className="text-lg font-bold" style={{ color: "#d4a050" }}>{a2Analytics.monitoring.warning?.toLocaleString() ?? "-"}</div>
                  <div className="text-[10px]" style={{ color: "#5a6d8a" }}>预警</div>
                </div>
                <div className="text-center rounded p-2" style={{ background: "#2a0a0a", border: "1px solid #5a1a1a" }}>
                  <div className="text-lg font-bold" style={{ color: "#e65100" }}>{a2Analytics.monitoring.alarm?.toLocaleString() ?? "-"}</div>
                  <div className="text-[10px]" style={{ color: "#5a6d8a" }}>报警</div>
                </div>
              </div>
            )}
            {a2Analytics.tunneling && (
              <div className="text-xs" style={{ color: "#98aec9" }}>
                <span>掘进参数: </span>
                <span style={{ color: "#2e7d32" }}>正常{a2Analytics.tunneling.normal?.toLocaleString() ?? "-"}</span>
                <span className="mx-1">|</span>
                <span style={{ color: "#e65100" }}>超限{a2Analytics.tunneling.exceed?.toLocaleString() ?? "-"}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ====== Row 3: Actions ====== */}
      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* 1工区 建议动作 */}
        <div className="card card-accent">
          <h3 className="text-sm font-semibold mb-3" style={{ color: "#00d4ff" }}>→ 1工区建议动作</h3>
          <div className="flex flex-col gap-1.5">
            {(gnActions.length > 0 ? gnActions : [{ priority: "1", description: "人工复核重点超标记录" }, { priority: "2", description: "补充DSW13地下水位人工复核结论" }]).slice(0, 3).map((a, i) => {
              const ar = a as Record<string, unknown>;
              return (
                <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "#98aec9" }}>
                  <span style={{ color: "#00d4ff", fontWeight: 700 }}>{i + 1}.</span>
                  <span>{String(ar.description || "")}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2工区 建议动作 */}
        <div className="card card-accent">
          <h3 className="text-sm font-semibold mb-3" style={{ color: "#00d4ff" }}>→ 2工区建议动作</h3>
          <div className="flex flex-col gap-1.5">
            {(a2Actions.length > 0 ? a2Actions : [
              { priority: "P1", description: "从监测方案补充正式设计限值/预警值/报警值,替换当前统计阈值" },
              { priority: "P2", description: "补充环号-里程映射的导向系统交叉验证" },
            ]).slice(0, 3).map((a, i) => {
              const ar = a as Record<string, unknown>;
              return (
                <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "#98aec9" }}>
                  <span style={{ color: "#00d4ff", fontWeight: 700 }}>{i + 1}.</span>
                  <span>{String(ar.description || "")}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

          </div>
  );
}
