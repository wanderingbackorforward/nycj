import React, { useEffect, useState, useCallback } from "react";
import { fetchGnOverview, fetchGnSystemStatus } from "../api/area1";
import { fetchArea2Overview, fetchArea2SystemStatus } from "../api/area2";
import type { GnOverview, GnSystemStatus } from "../api/area1";
import type { Area2Overview, Area2SystemStatus } from "../api/area2";
import LoadingState from "../components/status/LoadingState";

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
  const [fetchError, setFetchError] = useState(false);
  const [refreshTime, setRefreshTime] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gnO, gnS, a2O, a2S] = await Promise.all([
        fetchGnOverview("date=2026-04-14"),
        fetchGnSystemStatus(),
        fetchArea2Overview(),
        fetchArea2SystemStatus(),
      ]);
      if (gnO.ok) setGnOverview(gnO.data!);
      if (gnS.ok) setGnSys(gnS.data!);
      if (a2O.ok) setA2Overview(a2O.data!);
      if (a2S.ok) setA2Sys(a2S.data!);
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
  const gnGaps = gnOverview?.data_gaps || [];
  const a2Gaps = a2Overview?.dataGaps || [];
  const gnActions = gnOverview?.actions || [];
  const a2Actions = a2Overview?.actions || [];

  return (
    <div>
      {/* Status bar */}
      <div className="flex items-center justify-between mb-5">
        {fetchError && (
          <span className="badge badge-warning text-xs">⚠ 部分接口连接异常</span>
        )}
        <div className="flex items-center gap-4 ml-auto text-xs" style={{ color: "var(--color-text-dim)" }}>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: gnSys?.database_connected !== false ? "var(--color-success)" : "var(--color-danger)" }} />
            1工区后端
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: a2Sys?.databaseConnected !== false ? "var(--color-success)" : "var(--color-danger)" }} />
            2工区后端
          </span>
          <span>刷新 {refreshTime}</span>
          <button onClick={load} className="px-3 py-1 rounded text-xs cursor-pointer transition-colors" style={{ background: "var(--color-accent-muted)", color: "var(--color-text-secondary)", border: "1px solid var(--color-accent-muted)" }}>
            刷新
          </button>
        </div>
      </div>

      {/* ====== Row 1: Two-area cards ====== */}
      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* 1工区 */}
        <div className="card">
          <h3 className="text-sm font-semibold mb-3 pb-2 border-b" style={{ color: "var(--color-text-muted)", borderColor: "var(--color-panel-border)" }}>
            1工区 · 工农路站基坑
          </h3>
          <div className="grid grid-cols-4 gap-3">
            {gnCards.map((card, i) => {
              const labels = ["监测点数", "累计读数", "超设计限值", "待确认"];
              const isHighlight = i === 2; // 超设计限值
              return (
                <div key={i} className="text-center rounded p-3 transition-colors" style={{
                  background: isHighlight ? "var(--color-danger-bg)" : "var(--color-bg-hover)",
                  border: isHighlight ? "1px solid var(--color-danger-border)" : "1px solid var(--color-panel-border)",
                }}>
                  <div className="text-xs mb-1" style={{ color: "var(--color-text-dim)" }}>{card.name || labels[i]}</div>
                  <div className="font-bold" style={{ fontSize: "1.375rem", color: isHighlight ? "var(--color-danger)" : "var(--color-text-primary)" }}>
                    {card.value?.toLocaleString() ?? "-"}
                    <span className="text-xs font-normal ml-0.5" style={{ color: "var(--color-text-dim)" }}>{card.unit || "个"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2工区 */}
        <div className="card">
          <h3 className="text-sm font-semibold mb-3 pb-2 border-b" style={{ color: "var(--color-text-muted)", borderColor: "var(--color-panel-border)" }}>
            2工区 · 工~天盾构区间
          </h3>
          <div className="grid grid-cols-4 gap-3">
            {a2Cards.map((card, i) => {
              const isHighlight = card.level === "alarm";
              return (
                <div key={i} className="text-center rounded p-3 transition-colors" style={{
                  background: isHighlight ? "var(--color-danger-bg)" : "var(--color-bg-hover)",
                  border: isHighlight ? "1px solid var(--color-danger-border)" : "1px solid var(--color-panel-border)",
                }}>
                  <div className="text-xs mb-1" style={{ color: "var(--color-text-dim)" }}>{card.title}</div>
                  <div className="font-bold" style={{ fontSize: "1.375rem", color: isHighlight ? "var(--color-danger)" : "var(--color-text-primary)" }}>
                    {card.value}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--color-text-dim)" }}>{card.subtitle}</div>
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
          <div className="text-xs font-semibold" style={{ color: "var(--color-accent)" }}>工程线路</div>
          <div className="flex flex-col items-center gap-3 w-full">
            <div className="text-center rounded px-3 py-2 w-full" style={{ background: "var(--color-bg-hover)", border: "1px solid var(--color-accent-muted)" }}>
              <div className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>1工区</div>
              <div className="text-[10px]" style={{ color: "var(--color-text-dim)" }}>工农路站 · 基坑</div>
            </div>
            <div className="w-0.5 h-8" style={{ background: "var(--color-panel-border)" }} />
            <div className="text-center rounded px-3 py-2 w-full" style={{ background: "var(--color-bg-hover)", border: "1px solid var(--color-accent-muted)" }}>
              <div className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>2工区</div>
              <div className="text-[10px]" style={{ color: "var(--color-text-dim)" }}>
                工~天区间 · 环号{a2Overview?.position?.currentRing || "-"}
              </div>
            </div>
            <div className="w-0.5 h-8" style={{ background: "var(--color-panel-border)" }} />
            <div className="text-center rounded px-3 py-2 w-full opacity-50" style={{ background: "var(--color-bg-hover)", border: "1px dashed var(--color-panel-border)" }}>
              <div className="text-xs" style={{ color: "var(--color-text-dim)" }}>后续工区</div>
              <div className="text-[10px]" style={{ color: "var(--color-text-dim)" }}>暂未接入</div>
            </div>
          </div>
        </div>

        {/* 1工区 研判结论 */}
        <div className="card card-warning">
          <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--color-warning)" }}>1工区研判</h3>
          <div className="flex gap-3 mb-3">
            <div className="flex-1 text-center rounded p-2" style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)" }}>
              <div className="text-lg font-bold" style={{ color: "var(--color-danger)" }}>{gnCards[2]?.value ?? "-"}</div>
              <div className="text-[10px]" style={{ color: "var(--color-text-dim)" }}>超设计限值</div>
            </div>
            <div className="flex-1 text-center rounded p-2" style={{ background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)" }}>
              <div className="text-lg font-bold" style={{ color: "var(--color-warning)" }}>{gnCards[3]?.value ?? "-"}</div>
              <div className="text-[10px]" style={{ color: "var(--color-text-dim)" }}>待确认</div>
            </div>
            <div className="flex-1 text-center rounded p-2" style={{ background: "var(--color-bg-hover)", border: "1px solid var(--color-panel-border)" }}>
              <div className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>{gnFindings.length}</div>
              <div className="text-[10px]" style={{ color: "var(--color-text-dim)" }}>重点复核</div>
            </div>
          </div>
          {gnFindings.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-2">
              {gnFindings.slice(0, 3).map((f, i) => (
                <div key={i} className="text-xs flex items-start gap-2" style={{ color: "var(--color-text-secondary)" }}>
                  <span className="px-1.5 py-0.5 rounded text-[10px] text-white whitespace-nowrap opacity-90" style={{ background: "var(--color-accent)" }}>
                    关注
                  </span>
                  <span>{String(f.point_code || "")} {String(f.monitoring_item || "")}: {String(f.summary || f.reason || "")}</span>
                </div>
              ))}
            </div>
          )}
          {gnOverview?.headline && (
            <p className="text-xs mt-2" style={{ color: "var(--color-text-muted)" }}>{gnOverview.headline}</p>
          )}
        </div>

        {/* 2工区 研判结论 */}
        <div className="card" style={{ borderLeftColor: LEVEL_COLORS[a2Level] || "var(--color-accent-muted)" }}>
          <h3 className="text-sm font-semibold mb-2" style={{ color: LEVEL_COLORS[a2Level] || "var(--color-accent)" }}>2工区研判</h3>
          <div className="flex gap-3 mb-3">
            <div className="flex-1 text-center rounded p-2" style={{ background: "var(--color-bg-hover)", border: "1px solid var(--color-panel-border)" }}>
              <div className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>{a2Overview?.position?.currentRing || "-"}</div>
              <div className="text-[10px]" style={{ color: "var(--color-text-dim)" }}>当前环号</div>
            </div>
            <div className="flex-1 text-center rounded p-2" style={{ background: "var(--color-bg-hover)", border: "1px solid var(--color-panel-border)" }}>
              <div className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>243k</div>
              <div className="text-[10px]" style={{ color: "var(--color-text-dim)" }}>参数条数</div>
            </div>
            <div className="flex-1 text-center rounded p-2" style={{ background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)" }}>
              <div className="text-lg font-bold" style={{ color: "var(--color-warning)" }}>待确认</div>
              <div className="text-[10px]" style={{ color: "var(--color-text-dim)" }}>监测状态</div>
            </div>
          </div>
          {a2Headline && (
            <p className="text-xs mb-2" style={{ color: "var(--color-text-secondary)" }}>{a2Headline}</p>
          )}
          {a2Findings.slice(0, 2).map((f, i) => {
            const fr = f as Record<string, unknown>;
            return (
              <div key={i} className="text-xs flex items-start gap-2 mt-1" style={{ color: "var(--color-text-secondary)" }}>
                <span className="px-1.5 py-0.5 rounded text-[10px] text-white whitespace-nowrap opacity-90" style={{ background: LEVEL_COLORS[String(fr.level || "caution")] || "var(--color-accent)" }}>
                  {LEVEL_LABELS[String(fr.level || "")] || "注意"}
                </span>
                <span>{String(fr.message || fr.description || fr.title || "")}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ====== Row 3: Actions ====== */}
      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* 1工区 建议动作 */}
        <div className="card card-accent">
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-accent)" }}>→ 1工区建议动作</h3>
          <div className="flex flex-col gap-1.5">
            {(gnActions.length > 0 ? gnActions : [{ priority: "1", description: "人工复核重点超标记录" }, { priority: "2", description: "补充DSW13地下水位人工复核结论" }]).slice(0, 3).map((a, i) => {
              const ar = a as Record<string, unknown>;
              return (
                <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  <span style={{ color: "var(--color-accent)", fontWeight: 700 }}>{i + 1}.</span>
                  <span>{String(ar.description || "")}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2工区 建议动作 */}
        <div className="card card-accent">
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-accent)" }}>→ 2工区建议动作</h3>
          <div className="flex flex-col gap-1.5">
            {(a2Actions.length > 0 ? a2Actions : [
              { priority: "P1", description: "从监测方案补充正式设计限值/预警值/报警值,替换当前统计阈值" },
              { priority: "P2", description: "补充环号-里程映射的导向系统交叉验证" },
            ]).slice(0, 3).map((a, i) => {
              const ar = a as Record<string, unknown>;
              return (
                <div key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  <span style={{ color: "var(--color-accent)", fontWeight: 700 }}>{i + 1}.</span>
                  <span>{String(ar.description || "")}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ====== Row 4: Data gaps ====== */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {gnGaps.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-muted)" }}>1工区数据缺口</h3>
            <div className="flex flex-wrap gap-2">
              {gnGaps.slice(0, 4).map((g, i) => {
                const gr = g as Record<string, unknown>;
                return (
                  <div key={i} className="rounded px-2.5 py-1.5 text-[11px]" style={{ background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)" }}>
                    <span className="font-semibold" style={{ color: "var(--color-warning)" }}>{String(gr.category || gr.field || "")}</span>
                    <span className="ml-2" style={{ color: "var(--color-text-dim)" }}>{String(gr.reason || gr.detail || "")}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {a2Gaps.length > 0 && (
          <div className="card">
            <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-muted)" }}>2工区数据缺口</h3>
            <div className="flex flex-wrap gap-2">
              {a2Gaps.slice(0, 4).map((g, i) => {
                const gr = g as Record<string, unknown>;
                return (
                  <div key={i} className="rounded px-2.5 py-1.5 text-[11px]" style={{ background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)" }}>
                    <span className="font-semibold" style={{ color: "var(--color-warning)" }}>{String(gr.category || gr.field || "")}</span>
                    <span className="ml-2" style={{ color: "var(--color-text-dim)" }}>{String(gr.reason || gr.detail || "")}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
