// 格式化工具

export function formatNumber(n: number | undefined | null, decimals = 2): string {
  if (n === undefined || n === null) return '\u2014';
  return Number(n).toFixed(decimals);
}

export function formatPercent(n: number | undefined | null): string {
  if (n === undefined || n === null) return '\u2014';
  return `${(n * 100).toFixed(1)}%`;
}

export function formatDate(d: string | undefined | null): string {
  if (!d) return '\u2014';
  return d;
}
