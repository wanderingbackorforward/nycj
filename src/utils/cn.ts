// 中文工具函数

export function cn(...args: (string | false | null | undefined)[]): string {
  return args.filter(Boolean).join(' ');
}

// 状态码转中文
const STATUS_LABELS: Record<string, string> = {
  normal: '正常',
  warning: '预警',
  alarm: '报警',
  exceed_design_limit: '超设计限值',
  pending_review: '待复核',
  unknown: '待确认',
};

export function statusLabel(code: string | undefined): string {
  if (!code) return '—';
  return STATUS_LABELS[code] || code;
}

// 复审级别转中文
const REVIEW_LABELS: Record<string, string> = {
  high: '重点复核',
  medium: '建议关注',
  low: '常规',
};

export function reviewLabel(level: string | undefined): string {
  if (!level) return '—';
  return REVIEW_LABELS[level] || level;
}

// 英文枚举值转中文
const ITEM_LABELS: Record<string, string> = {
  surface_settlement: '地表沉降',
  building_settlement: '建筑物沉降',
  pipeline_settlement: '管线沉降',
  support_axial_force: '支撑轴力',
  groundwater_level: '地下水位',
  deep_horizontal_displacement: '深层水平位移',
  pile_top_displacement: '桩顶位移',
};

export function itemLabel(code: string | undefined): string {
  if (!code) return '—';
  return ITEM_LABELS[code] || code;
}
