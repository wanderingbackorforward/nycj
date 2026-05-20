import { GN_API_BASE, DEFAULT_DATE } from '../config/api';
import { apiGetStable, apiGet, ApiResult } from './http';

// ========== 1工区 API ==========

export interface GnOverview {
  generated_at?: string;
  project_name?: string;
  work_area?: string;
  date?: string;
  overall_level?: string;
  overall_level_cn?: string;
  headline?: string;
  cards?: Array<{ name: string; value: number; unit: string }>;
  status_distribution?: Array<{ status_code: string; status_display_cn: string; count: number }>;
  priority_findings?: Array<{ level: string; title: string; detail: string }>;
  actions?: Array<{ priority: string; action: string; target?: string }>;
  data_gaps?: Array<{ category: string; description: string; affected_count?: number }>;
}

export interface GnItemsResponse {
  items: GnMonitoringItem[];
  total: number;
}

export interface GnMonitoringItem {
  monitoring_item?: string;
  monitoring_object?: string;
  point_count?: number;
  reading_count?: number;
  normal_count?: number;
  exceed_count?: number;
  unknown_count?: number;
  latest_date?: string;
  status_display?: string;
}

export interface GnAlertsResponse {
  total: number;
  alerts: GnAlert[];
}

export interface GnAlert {
  point_code?: string;
  monitoring_item?: string;
  monitoring_object?: string;
  side?: string;
  part?: string;
  current_value?: number;
  cumulative_change?: number;
  design_limit?: number;
  exceed_ratio?: number;
  status_code?: string;
  status_display_cn?: string;
  review_level?: string;
  review_reason?: string;
  measured_at?: string;
  source_file_name?: string;
  source_sheet_name?: string;
  row_index?: number;
}

export interface GnPointsResponse {
  points: GnPoint[];
  total: number;
}

export interface GnPoint {
  point_code?: string;
  point_name?: string;
  monitoring_item?: string;
  monitoring_object?: string;
  side?: string;
  design_limit?: number;
  unit?: string;
}

export interface GnPointAnalysisResponse {
  point: Record<string, unknown>;
  latest: Record<string, unknown>;
  trend: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  findings: Array<{ level: string; detail: string }>;
  actions: string[];
  data_gaps: Array<{ category: string; description: string }>;
}

export interface GnSystemStatus {
  database_connected?: boolean;
  table_counts?: Record<string, number>;
  known_issues?: string[];
  status?: string;
}

export interface GnHealth {
  ok?: boolean;
  database?: string;
  project?: string;
  work_area?: string;
  tables?: Record<string, number>;
  views?: Record<string, unknown>;
}

export interface GnSourceDocument {
  doc_name?: string;
  doc_type?: string;
}

export interface GnEvidence {
  point_code?: string;
  source_doc?: string;
}

export function fetchGnHealth(): Promise<ApiResult<GnHealth>> {
  return apiGet(GN_API_BASE + '/health');
}

export function fetchGnOverview(date?: string): Promise<ApiResult<GnOverview> & { stable: boolean }> {
  return apiGetStable(GN_API_BASE + '/overview?date=' + (date || DEFAULT_DATE));
}

export function fetchGnSystemStatus(): Promise<ApiResult<GnSystemStatus>> {
  return apiGet(GN_API_BASE + '/system-status');
}

export function fetchGnMonitoringItems(): Promise<ApiResult<GnItemsResponse>> {
  return apiGet(GN_API_BASE + '/monitoring/items');
}

export function fetchGnMonitoringPoints(): Promise<ApiResult<GnPointsResponse>> {
  return apiGet(GN_API_BASE + '/monitoring/points?limit=1000');
}

export function fetchGnAlerts(): Promise<ApiResult<GnAlertsResponse>> {
  return apiGet(GN_API_BASE + '/monitoring/alerts');
}

export function fetchGnDataQuality(): Promise<ApiResult<unknown>> {
  return apiGet(GN_API_BASE + '/data-quality/summary');
}

export function fetchGnSourceDocuments(): Promise<ApiResult<GnSourceDocument[]>> {
  return apiGet(GN_API_BASE + '/source-documents');
}

export function fetchGnEvidence(): Promise<ApiResult<GnEvidence[]>> {
  return apiGet(GN_API_BASE + '/evidence');
}

export function fetchGnPointAnalysis(pointCode: string): Promise<ApiResult<GnPointAnalysisResponse>> {
  return apiGet(GN_API_BASE + '/point-analysis/' + encodeURIComponent(pointCode));
}

// ========== 新增：数据缺口 & 数据质量 ==========

export interface GnDataGap {
  id?: string;
  title?: string;
  priority?: string;
  description?: string;
  impact?: string;
  backend_capability?: string;
  thresholds_configured?: number;
  unknown_distribution?: Array<{ reason: string; count: number }>;
  required_from?: string;
  resolution?: string;
  dsw13_status?: Record<string, unknown>;
}

export interface GnDataGapsResponse {
  generated_at?: string;
  project_name?: string;
  work_area?: string;
  gaps?: GnDataGap[];
  summary?: {
    p1_count: number;
    p2_count: number;
    total_gaps: number;
    resolvable_by_backend: number;
    needs_human_input: number;
  };
}

export interface GnDataQualityResponse {
  status_distribution?: Array<{ status_code: string; status_display_cn: string; count: number }>;
  unknown_reason_distribution?: Array<{ unknown_reason: string; unknown_reason_cn: string; count: number }>;
  confidence_distribution?: Array<{ parse_confidence: string; count: number }>;
  reading_role_distribution?: Array<{ reading_role: string; count: number }>;
  review_level_distribution?: Array<{ review_level: string; count: number }>;
  evidence_coverage?: { evidence_count: number; reading_count: number; coverage_ratio: string };
  data_gaps?: Array<{ category: string; description: string; affected_count: number }>;
}

export function fetchGnDataGaps(): Promise<ApiResult<GnDataGapsResponse>> {
  return apiGet(GN_API_BASE + '/data-gaps');
}

export function fetchGnDataQualityTyped(): Promise<ApiResult<GnDataQualityResponse>> {
  return apiGet(GN_API_BASE + '/data-quality/summary');
}

// ========== 阈值 & 人工复核 ==========

export interface GnThreshold {
  id?: string;
  monitoring_item?: string;
  monitoring_object?: string;
  design_limit?: number;
  warning_threshold?: number;
  alarm_threshold?: number;
  unit?: string;
  threshold_source?: string;
  updated_at?: string;
}

export interface GnThresholdsResponse {
  generated_at?: string;
  thresholds?: GnThreshold[];
  note?: string;
}

export interface GnManualReview {
  id?: string;
  point_code?: string;
  review_verdict?: string;
  reviewer?: string;
  notes?: string;
  reviewed_at?: string;
}

export interface GnManualReviewResponse {
  generated_at?: string;
  reviews?: GnManualReview[];
}

export function fetchGnThresholds(): Promise<ApiResult<GnThresholdsResponse>> {
  return apiGet(GN_API_BASE + '/thresholds');
}

export function fetchGnManualReviews(): Promise<ApiResult<GnManualReviewResponse>> {
  return apiGet(GN_API_BASE + '/manual-review');
}

// ========== 诊断 & 传感器 & 坐标 ==========

export interface GnDiagnoseResponse {
  generated_at?: string;
  point_code?: string;
  reading_count?: number;
  evidence_count?: number;
  date_range?: { from: string; to: string };
  readings?: Array<{ date: string; current_value: number; cumulative_change: number; daily_change: number; initial_value: number; source: string }>;
  siblings_comparison?: Array<{ point_code: string; latest_cumulative: number | null; date: string }>;
  findings?: Array<{ level: string; detail: string }>;
  recommendation?: string;
}

export interface GnSensorPatternsResponse {
  generated_at?: string;
  total_columns?: number;
  matched_count?: number;
  unmatched_count?: number;
  matched_by_pattern?: Record<string, unknown>;
  unmatched_columns?: Array<{ column: string; count: number; file: string }>;
  recommendation?: string;
}

export interface GnPointsNeedingCoordsResponse {
  generated_at?: string;
  total_points?: number;
  missing_coords?: number;
  points?: Array<{ point_code: string; monitoring_item: string; monitoring_object: string; side: string; first_seen_date: string; last_seen_date: string }>;
  note?: string;
}

export function fetchGnDiagnose(pointCode: string): Promise<ApiResult<GnDiagnoseResponse>> {
  return apiGet(GN_API_BASE + '/diagnose/' + encodeURIComponent(pointCode));
}

export function fetchGnSensorPatterns(): Promise<ApiResult<GnSensorPatternsResponse>> {
  return apiGet(GN_API_BASE + '/analyze/sensor-patterns');
}

export function fetchGnPointsNeedingCoords(): Promise<ApiResult<GnPointsNeedingCoordsResponse>> {
  return apiGet(GN_API_BASE + '/points/needing-coords');
}

// ========== 高级分析 (v1.5 新增) ==========

export interface GnDailyBriefing {
  generated_at?: string; project_name?: string; work_area?: string; date?: string;
  summary?: { point_count: number; reading_count: number; exceed_design_limit: number; severe_review: number };
  top_worsening?: Array<{ point_code: string; monitoring_item: string; part: string; side: string; cum: number | null; daily_chg: number }>;
  top_approaching?: Array<{ point_code: string; monitoring_item: string; part: string; side: string; cum: number | null; design_limit: number; ratio: number | null }>;
  zone_summary?: Array<{ side: string; exceed_cnt: number }>;
  recommendation?: string; disclaimer?: string;
}

export interface GnTrendAccelItem {
  point_code?: string; monitoring_item?: string; monitoring_object?: string;
  side?: string; part?: string; measured_at?: string;
  cumulative_change?: number | null; latest_daily_change?: number | null;
  prev_daily_change?: number; accel_val?: number | null; trend_direction?: string;
}
export interface GnTrendAccelResponse { generated_at?: string; filters?: Record<string,string>; items?: GnTrendAccelItem[] }

export interface GnThresholdProxItem {
  point_code?: string; monitoring_item?: string; monitoring_object?: string;
  side?: string; part?: string; cumulative_change?: number | null;
  daily_change?: number | null; design_limit?: number; proximity_ratio?: number | null;
  status?: string;
}
export interface GnThresholdProxResponse { generated_at?: string; date?: string; filters?: Record<string,string>; items?: GnThresholdProxItem[] }

export interface GnAnomalyItem {
  point_code?: string; monitoring_item?: string; monitoring_object?: string;
  side?: string; part?: string; mean_val?: number; std_val?: number;
  latest_val?: number; z_score?: number; is_anomaly?: boolean;
}
export interface GnAnomalyResponse { generated_at?: string; sigma_threshold?: number; filters?: Record<string,string>; items?: GnAnomalyItem[] }

export interface GnCrossCorrelation {
  object_a?: string; item_a?: string; object_b?: string; item_b?: string;
  coefficient?: number; strength?: string; direction?: string;
  overlap_days?: number; description?: string;
}
export interface GnCrossCorrelationResponse { generated_at?: string; side_filter?: string; correlations?: GnCrossCorrelation[] }

export interface GnEarlyWarningItem {
  point_code?: string; monitoring_item?: string; part?: string; side?: string;
  cum?: number | null; daily_chg?: number; design_limit?: number; ratio?: number | null;
}
export interface GnEarlyWarningResponse {
  generated_at?: string; project_name?: string; work_area?: string; date?: string;
  summary?: { point_count: number; reading_count: number; exceed_design_limit: number; severe_review: number };
  top_worsening?: GnEarlyWarningItem[]; top_approaching?: GnEarlyWarningItem[];
  zone_summary?: Array<{ side: string; exceed_cnt: number }>;
  recommendation?: string; disclaimer?: string;
}

export interface GnZoneHeatmapItem {
  side?: string; part?: string; point_count?: number; reading_count?: number;
  exceed_count?: number; severe_count?: number; avg_exceed_ratio?: number;
  max_exceed_ratio?: number; zone_status?: string;
}
export interface GnZoneHeatmapResponse { generated_at?: string; date?: string; items?: GnZoneHeatmapItem[]; interpretation?: string }

export function fetchGnDailyBriefing(date?: string): Promise<ApiResult<GnDailyBriefing>> {
  return apiGet(GN_API_BASE + '/analysis/daily-briefing?date=' + (date || DEFAULT_DATE));
}
export function fetchGnTrendAcceleration(pointCode: string): Promise<ApiResult<GnTrendAccelResponse>> {
  return apiGet(GN_API_BASE + '/analysis/trend-acceleration?point_code=' + encodeURIComponent(pointCode));
}
export function fetchGnThresholdProximity(pointCode: string): Promise<ApiResult<GnThresholdProxResponse>> {
  return apiGet(GN_API_BASE + '/analysis/threshold-proximity?point_code=' + encodeURIComponent(pointCode));
}
export function fetchGnAnomalyDetection(date?: string): Promise<ApiResult<GnAnomalyResponse>> {
  return apiGet(GN_API_BASE + '/analysis/anomaly-detection?date=' + (date || DEFAULT_DATE));
}
export function fetchGnCrossCorrelation(): Promise<ApiResult<GnCrossCorrelationResponse>> {
  return apiGet(GN_API_BASE + '/analysis/cross-correlation');
}
export function fetchGnEarlyWarning(date?: string): Promise<ApiResult<GnEarlyWarningResponse>> {
  return apiGet(GN_API_BASE + '/analysis/early-warning?date=' + (date || DEFAULT_DATE));
}
export function fetchGnZoneHeatmap(date?: string): Promise<ApiResult<GnZoneHeatmapResponse>> {
  return apiGet(GN_API_BASE + '/analysis/zone-heatmap?date=' + (date || DEFAULT_DATE));
}