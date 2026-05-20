// 后端英文→中文映射表（后端不可改，前端统一翻译）
export const CN_MAP: Record<string, string> = {
  // 建议/结论
  "Only earth pressure/grouting parameter values available. Supplement slurry circulation data for complete diagnosis.":
    "当前仅含土压与注浆参数，缺少完整泥水环流数据（进出泥流量/密度/压力），需接入PLC数据后方可完成完整诊断。",
  // 数据缺口
  "Slurry inflow/outflow data missing": "泥水进出流量数据缺失",
  "Slurry density data missing": "泥水密度数据缺失",
  "Grouting ratio design standard missing": "注浆率设计标准缺失",
  "threshold_source": "阈值来源",
  "Thresold source: P95/P99 statistical derivation, not engineering design values": "阈值来源：P95/P99统计推导，非工程设计值",
  // 参数
  "parameter_limit": "参数限值",
  "posture_deviation": "姿态偏差",
  "ring_mileage": "环号-里程",
  // 通用
  "unknown": "未知",
  "missing": "缺失",
  "pending": "待确认",
  "configured": "已配置",
  "not_configured": "未配置",
};

export function cn(text: string | null | undefined): string {
  if (!text) return "";
  return CN_MAP[text] || text;
}

export function cnField(field: string | null | undefined): string {
  if (!field) return "未知";
  return CN_MAP[field] || field;
}