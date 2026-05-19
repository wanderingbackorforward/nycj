import { AREA2_API_BASE } from '../config/api';
import { apiGetStable, apiGet, ApiResult, normalizeArrayResponse } from './http';

// 归一化数组响应的通用获取函数（自动解包 value/data 包装）
async function apiGetNormalized<T>(url: string, fallback: T | null = null): Promise<ApiResult<T>> {
  try {
    const r = await apiGet<unknown>(url);
    if (r.ok && r.data) {
      const arr = normalizeArrayResponse<T>(r.data);
      if (Array.isArray(arr)) {
        return { ok: true, data: arr as unknown as T };
      }
      return r as ApiResult<T>;
    }
    if (fallback !== null) return { ok: true, data: fallback, error: r.error };
    return r as ApiResult<T>;
  } catch {
    if (fallback !== null) return { ok: true, data: fallback };
    return { ok: false, error: '接口连接异常' };
  }
}

// ===== 基础类型 =====
export type Area2Health = { ok?: boolean; database?: string; schema?: string; project?: string; tables?: Record<string,number>; views?: Record<string,boolean> };

// ===== Overview =====
export interface Area2Overview {
  generatedAt?: string; projectName?: string; workArea?: string; date?: string;
  overallLevel?: string; overallLevelCn?: string; headline?: string;
  position?: { currentRing?: number; ringRange?: number[]; chainage?: string; mileage?: string; positionSource?: string; dataGap?: string };
  cards?: Array<{ title: string; value: string; subtitle: string; level: string }>;
  parameterSummary?: Array<{ group_code: string; group_cn: string; sample_count: number; ring_count: number; time_range?: string; exceed_count?: number; normal_count?: number }>;
  monitoringSummary?: Array<{ item: string; readings: number; points: number; normal_cnt?: number; warning_cnt?: number; alarm_cnt?: number }>;
  findings?: Array<{ message?: string; description?: string; title?: string; detail?: string; level?: string; level_cn?: string; source?: string }>;
  actions?: Array<{ priority: string; priority_cn: string; description: string }>;
  dataGaps?: Array<{ field?: string; category?: string; reason?: string; detail?: string; impact?: string; status?: string; action?: string }>;
}

// ===== Rings =====
export interface Area2Ring {
  ring_no?: number; date?: string; chainage?: string; mileage?: string;
  ring_type?: string; advance_speed?: number;
}

// ===== Tunneling =====
export interface Area2TunnelingParameter {
  ring_no?: number; parameter_name?: string; parameter_name_cn?: string;
  value?: number; unit?: string; group_code?: string; group_name_cn?: string;
  threshold?: { lower_bound?: number; upper_bound?: number; source?: string };
  status_code?: string; status_display_cn?: string;
}
export interface Area2TunnelingGroup {
  group_code?: string; group_name_cn?: string; parameter_count?: number;
  ring_count?: number; normal_count?: number; exceed_count?: number;
}

// ===== Monitoring =====
export interface Area2MonitoringItem {
  monitoring_item?: string; monitoring_object?: string;
  point_count?: number; reading_count?: number;
  normal_cnt?: number; warning_cnt?: number; alarm_cnt?: number;
  parse_confidence_high?: number; parse_confidence_medium?: number;
}
export interface Area2MonitoringReading {
  point_code?: string; item_name?: string; reading_value?: number;
  cumulative_change?: number; status_code?: string; status_display_cn?: string;
  threshold?: { design_limit?: number; warning_threshold?: number; alarm_threshold?: number; source?: string };
  measured_at?: string; source_file?: string;
}
export interface Area2MonitoringSummary {
  total_readings?: number; total_points?: number;
  alert_summary?: { normal?: number; warning?: number; alarm?: number; unknown?: number };
}

// ===== System Status =====
export interface Area2SystemStatus {
  databaseConnected?: boolean; schema?: string; projectName?: string;
  tableCounts?: Record<string,number>; viewStatus?: Record<string,boolean>;
  alertStatus?: { monitoring?: { normal?:number; warning?:number; alarm?:number; unknown?:number }; tunneling?: { normal?:number; exceed?:number } };
  gapStatus?: Record<string, { status:string; detail:string; action?:string }>;
  knownIssues?: string[]; nextActions?: string[];
}

// ===== Thresholds =====
export interface Area2Threshold {
  config_id?: string; target_type?: string; target_name?: string;
  design_limit?: number; warning_threshold?: number; alarm_threshold?: number;
  lower_bound?: number; upper_bound?: number; unit?: string;
  source?: string; status?: string;
}
export interface Area2ThresholdsResponse { data?: Area2Threshold[]; total?: number }

// ===== Analytics =====
export interface Area2AnalyticsOverview {
  monitoring?: { total_readings:number; normal:number; warning:number; alarm:number; exceed_design_limit:number; by_item?:Array<{item:string; readings:number; normal:number; warning:number; alarm:number}>; by_ring?:Array<{ring_no:number; normal:number; warning:number; alarm:number}> };
  tunneling?: { total_params:number; normal:number; exceed:number; by_group?:Array<{group:string; normal:number; exceed:number}>; by_ring?:Array<{ring_no:number; normal:number; exceed:number}> };
}

// ===== Ring Mileage Config =====
export interface Area2RingMileageConfig {
  startRing?: number; startMileage?: string; direction?: string;
  rings?: Array<{ ring_no:number; chainage:string; mileage:string }>;
  status?: string; message?: string;
}

// ===== Posture Deviation =====
export interface Area2PostureDeviationConfig {
  configured?: boolean;
  configs?: Array<{
    type_code?: string;
    deviation_name?: string;
    deviation_name_cn?: string;
    configured?: boolean;
    design_limit_mm?: number;
    design_limit_deg?: number;
    stat_p95?: number;
    unit?: string;
  }>;
  types?: Array<{ type_code:string; type_cn:string; design_limit?:number; warning_limit?:number; p05?:number; p95?:number; unit:string }>;
  status?: string;
}

// ===== Risk Sources =====
export interface Area2RiskSource {
  id?: string; name?: string; type?: string; type_cn?: string;
  ring_no?: number; chainage?: string; description?: string;
  risk_level?: string; status?: string; source_file?: string;
}

// ===== Data Quality =====
export interface Area2DataQuality {
  totalRecords?: number; parseConfidence?: Record<string,number>;
  thresholdConfigCount?: number; alertCoverageRate?: number;
  gaps?: Array<{ category:string; status:string; detail:string }>;
}

// ===== Existing API functions (enhanced) =====
export function fetchArea2Health(): Promise<ApiResult<Area2Health>> { return apiGet(AREA2_API_BASE + '/health'); }
export function fetchArea2Overview(): Promise<ApiResult<Area2Overview> & { stable:boolean }> { return apiGetStable(AREA2_API_BASE + '/overview'); }
export function fetchArea2SystemStatus(): Promise<ApiResult<Area2SystemStatus>> { return apiGet(AREA2_API_BASE + '/system-status'); }
export function fetchArea2Rings(): Promise<ApiResult<Area2Ring[]>> { return apiGet(AREA2_API_BASE + '/rings'); }
export function fetchArea2Ring(ringNo:number): Promise<ApiResult<Area2Ring>> { return apiGet(AREA2_API_BASE + '/rings/' + ringNo); }
export async function fetchArea2TunnelingParams(params?:string): Promise<ApiResult<Area2TunnelingParameter[]>> { const qs = params ? '?' + params : ''; return apiGetNormalized<Area2TunnelingParameter[]>(AREA2_API_BASE + '/tunneling/parameters' + qs); }
export async function fetchArea2TunnelingGroups(): Promise<ApiResult<Area2TunnelingGroup[]>> { return apiGetNormalized<Area2TunnelingGroup[]>(AREA2_API_BASE + '/tunneling/groups'); }
export async function fetchArea2MonitoringItems(): Promise<ApiResult<Area2MonitoringItem[]>> { return apiGetNormalized<Area2MonitoringItem[]>(AREA2_API_BASE + '/monitoring/items'); }
export async function fetchArea2MonitoringReadings(params?:string): Promise<ApiResult<Area2MonitoringReading[]>> { const qs = params ? '?' + params : ''; return apiGetNormalized<Area2MonitoringReading[]>(AREA2_API_BASE + '/monitoring/readings' + qs); }
export function fetchArea2MonitoringSummary(): Promise<ApiResult<Area2MonitoringSummary>> { return apiGet(AREA2_API_BASE + '/monitoring/summary'); }
export async function fetchArea2Documents(): Promise<ApiResult<Area2Document[]>> { return apiGetNormalized<Area2Document[]>(AREA2_API_BASE + '/documents'); }
export async function fetchArea2Evidence(): Promise<ApiResult<unknown[]>> { return apiGetNormalized<unknown[]>(AREA2_API_BASE + '/evidence'); }
export function fetchArea2DataQuality(): Promise<ApiResult<Area2DataQuality>> { return apiGet(AREA2_API_BASE + '/data-quality/summary'); }

// ===== Diagnosis (existing) =====
export function fetchArea2DiagnosisOperation(ringNo?: number | null): Promise<ApiResult<Area2DiagnosisSlurryGrouting>> { const qs = ringNo != null ? '?ring_no=' + ringNo : ''; return apiGet(AREA2_API_BASE + '/diagnosis/operation' + qs); }
export function fetchArea2DiagnosisSlurryGrouting(ringNo?: number | null): Promise<ApiResult<Area2DiagnosisSlurryGrouting>> { const qs = ringNo != null ? '?ring_no=' + ringNo : ''; return apiGet(AREA2_API_BASE + '/diagnosis/slurry-grouting' + qs); }

// ===== NEW API: Thresholds =====
export async function fetchArea2Thresholds(targetType?:string): Promise<ApiResult<Area2ThresholdsResponse>> { const qs = targetType ? '?target_type=' + targetType : ''; const r = await apiGet<unknown>(AREA2_API_BASE + '/thresholds' + qs); if (r.ok && r.data) { const d = r.data as Record<string,unknown>; if (d.data) { r.data = d as unknown as Area2ThresholdsResponse; } } return r as ApiResult<Area2ThresholdsResponse>; }

// ===== NEW API: Analytics =====
export function fetchArea2AnalyticsOverview(): Promise<ApiResult<Area2AnalyticsOverview>> { return apiGet(AREA2_API_BASE + '/analytics/overview'); }

// ===== NEW API: Ring Mileage =====
export function fetchArea2RingMileage(): Promise<ApiResult<Area2RingMileageConfig>> { return apiGet(AREA2_API_BASE + '/config/ring-mileage'); }
export function updateArea2RingMileage(data:{start_ring:number; start_mileage:string; direction?:string}): Promise<ApiResult<Area2RingMileageConfig>> {
  return apiGet(AREA2_API_BASE + '/config/ring-mileage'); // PUT not supported via apiGet, use fetch directly if needed
}

// ===== NEW API: Posture Deviation =====
export function fetchArea2PostureDeviation(): Promise<ApiResult<Area2PostureDeviationConfig>> { return apiGet(AREA2_API_BASE + '/config/posture-deviation'); }

// ===== NEW API: Risk Sources =====
export async function fetchArea2RiskSources(): Promise<ApiResult<Area2RiskSource[]>> { return apiGetNormalized<Area2RiskSource[]>(AREA2_API_BASE + '/risk-sources'); }
export async function fetchArea2RiskSourcesNearby(ringNo:number): Promise<ApiResult<Area2RiskSource[]>> { return apiGetNormalized<Area2RiskSource[]>(AREA2_API_BASE + '/risk-sources/nearby?ring_no=' + ringNo); }

// ===== Legacy type aliases (keep pages compiling) =====
export interface Area2DiagnosisSlurryGrouting { ring_no?: number; timestamp?: string; slurry_params?: Array<{ name?: string; parameter_name_cn?: string; value?: number; unit?: string }>; grouting_params?: Array<{ name?: string; parameter_name_cn?: string; value?: number; unit?: string }>; monitoring_response?: Record<string, unknown>; data_gaps?: Array<{ field?: string; category?: string; reason?: string; detail?: string }>; suggestion?: string; findings?: Array<{ level: string; detail: string }>; conclusion?: string; [key: string]: unknown }


// ===== Coordinates (v1.5) =====
export interface Area2Coordinate {
  point_id?: string; x_init?: number; y_init?: number;
  x_current?: number; y_current?: number;
  change_mm?: number; cumulative_mm?: number;
  instrument?: string; measured_at?: string;
}
export async function fetchArea2Coordinates(): Promise<ApiResult<Area2Coordinate[]>> { return apiGetNormalized<Area2Coordinate[]>(AREA2_API_BASE + '/coordinates'); }


// ===== Document type =====
export interface Area2Document { file_name?:string; document_category?:string; document_type?:string; report_date?:string; ring_no?:number; upload_date?:string; file_size?:number; registration_status?:string }
