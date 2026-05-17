import { API_TIMEOUT_MS } from '../config/api';

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

interface FetchOptions extends RequestInit {
  timeout?: number;
}

async function fetchWithTimeout(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeout = API_TIMEOUT_MS, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiGet<T>(url: string): Promise<ApiResult<T>> {
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      return {
        ok: false,
        error: `接口返回状态码 ${response.status}`,
        statusCode: response.status,
      };
    }
    const data = await response.json();
    return { ok: true, data };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, error: '接口请求超时，请检查网络连接' };
    }
    const message = err instanceof Error ? err.message : '未知错误';
    return { ok: false, error: `接口连接异常：${message}` };
  }
}

// 稳定数据缓存：API 失败时保留上一次成功数据
const stableCache = new Map<string, unknown>();

export async function apiGetStable<T>(url: string): Promise<ApiResult<T> & { stable: boolean }> {
  const result = await apiGet<T>(url);
  if (result.ok && result.data !== undefined) {
    stableCache.set(url, result.data);
    return { ...result, stable: false };
  }
  const cached = stableCache.get(url) as T | undefined;
  if (cached !== undefined) {
    return { ok: true, data: cached, error: result.error, stable: true };
  }
  return { ...result, stable: false };
}

export function clearStableCache(): void {
  stableCache.clear();
}
