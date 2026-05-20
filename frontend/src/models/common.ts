// 通用类型定义

export interface PageState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
  stable: boolean; // 是否使用了缓存数据
}

export interface GapItem {
  category: string;
  description: string;
  impact: string;
  action: string;
}

export interface ConclusionBlock {
  summary: string;
  evidence: string[];
  actions: string[];
  gaps: GapItem[];
}

export interface StatusCardData {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  highlight?: boolean;
  subLabel?: string;
}
