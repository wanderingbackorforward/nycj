// API 配置
// 开发环境可通过 .env 文件覆盖为直连IP
export const GN_API_BASE = import.meta.env.VITE_GN_API_BASE_URL || '/api/gn';
export const AREA2_API_BASE = import.meta.env.VITE_AREA2_API_BASE_URL || '/api/area2';

export const API_TIMEOUT_MS = 10000;
export const DEFAULT_DATE = '2026-04-14';
