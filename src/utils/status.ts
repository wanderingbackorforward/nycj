// 状态判断工具

export function isExceedDesignLimit(statusCode: string | undefined): boolean {
  return statusCode === 'exceed_design_limit';
}

export function isPendingReview(statusCode: string | undefined): boolean {
  return statusCode === 'unknown' || statusCode === 'pending_review';
}

export function isNormal(statusCode: string | undefined): boolean {
  return statusCode === 'normal';
}
