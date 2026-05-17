import { AREA2_API_BASE } from '../config/api';
import { apiGetStable, apiGet, ApiResult } from './http';

// ===== 基础类型 =====
export type Area2Health = { ok?: boolean; database?: string; schema?: string; project?: string; tables?: Record<string,number>; views?: Record<string,boolean> };

// ===== Overview =====
export interface Area2Overview {
  generatedAt?: string; projectName?: string; workArea?: string; date?: string;
  overallLevel?: string; overallLevelCn?: string; headline?: string;
  position?: { currentRing?: number; ringRange?: number[]; chainage?: string; mileage?: string; positionSource?: string; dataGap?: string };
  cards?: Array<{ name: string; value: number; unit: string }>;
  parameterSummary?: Array<{ group_code: string; group_cn: string; sample_count: number; ring_count: number; time_range?: string; exceed_count?: number; normal_count?: number }>;
  monitoringSummary?: Array<{ item: string; readings: number; points: number; normal_cnt?: number; warning_cnt?: number; alarm_cnt?: number }>;
  findings?: Array<Record<string,unknown>>;
  actions?: Array<{ priority: string; priority_cn: string; description: string }>;
  dataGaps?: Array<{ field: string; reason: string; impact: string }>;
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
  gapStatus?: Array<{ category:string; status:string; detail:string; action:string }>;
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
  monitoring?: { total_readings:number; normal:number; warning:number; alarm:number; exceed_design_limit:number; by_item?:Array<Record<string,unknown>>; by_ring?:Array<Record<string,unknown>> };
  tunneling?: { total_params:number; normal:number; exceed:number; by_group?:Array<Record<string,unknown>>; by_ring?:Array<Record<string,unknown>> };
}

// ===== Ring Mileage Config =====
export interface Area2RingMileageConfig {
  startRing?: number; startMileage?: string; direction?: string;
  rings?: Array<{ ring_no:number; chainage:string; mileage:string }>;
  status?: string; message?: string;
}

// ===== Posture Deviation =====
export interface Area2PostureDeviationConfig {
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
export async function fetchArea2TunnelingParams(params?:string): Promise<ApiResult<Area2TunnelingParameter[]>> { const qs = params ? '?' + params : ''; const r = await apiGet<unknown>(AREA2_API_BASE + '/tunneling/parameters' + qs); if (r.ok && r.data) { const d = r.data as Record<string,unknown>; r.data = (Array.isArray(d.data) ? d.data : d) as Area2TunnelingParameter[]; } return r as ApiResult<Area2TunnelingParameter[]>; }
export async function fetchArea2TunnelingGroups(): Promise<ApiResult<Area2TunnelingGroup[]>> { const r = await apiGet<unknown>(AREA2_API_BASE + '/tunneling/groups'); if (r.ok && r.data) { const d = r.data as Record<string,unknown>; r.data = (Array.isArray(d.value) ? d.value : d) as Area2TunnelingGroup[]; } return r as ApiResult<Area2TunnelingGroup[]>; }
export async function fetchArea2MonitoringItems(): Promise<ApiResult<Area2MonitoringItem[]>> { const r = await apiGet<unknown>(AREA2_API_BASE + '/monitoring/items'); if (r.ok && r.data) { const d = r.data as Record<string,unknown>; r.data = (Array.isArray(d.value) ? d.value : d) as Area2MonitoringItem[]; } return r as ApiResult<Area2MonitoringItem[]>; }
export async function fetchArea2MonitoringReadings(params?:string): Promise<ApiResult<Area2MonitoringReading[]>> { const qs = params ? '?' + params : ''; const r = await apiGet<unknown>(AREA2_API_BASE + '/monitoring/readings' + qs); if (r.ok && r.data) { const d = r.data as Record<string,unknown>; r.data = (Array.isArray(d.value) ? d.value : Array.isArray(d.data) ? d.data : d) as Area2MonitoringReading[]; } return r as ApiResult<Area2MonitoringReading[]>; }
export function fetchArea2MonitoringSummary(): Promise<ApiResult<Area2MonitoringSummary>> { return apiGet(AREA2_API_BASE + '/monitoring/summary'); }
export async function fetchArea2Documents(): Promise<ApiResult<Area2Document[]>> { const r = await apiGet<unknown>(AREA2_API_BASE + '/documents'); if (r.ok && r.data) { const d = r.data as Record<string,unknown>; r.data = (Array.isArray(d.value) ? d.value : d) as Area2Document[]; } return r as ApiResult<Area2Document[]>; }
export function fetchArea2Evidence(): Promise<ApiResult<unknown[]>> { return apiGet(AREA2_API_BASE + '/evidence'); }
export function fetchArea2DataQuality(): Promise<ApiResult<Area2DataQuality>> { return apiGet(AREA2_API_BASE + '/data-quality/summary'); }

// ===== Diagnosis (existing) =====
export function fetchArea2DiagnosisOperation(): Promise<ApiResult<Record<string,unknown>>> { return apiGet(AREA2_API_BASE + '/diagnosis/operation'); }
export function fetchArea2DiagnosisSlurryGrouting(ringNo?:number): Promise<ApiResult<Record<string,unknown>>> { const qs = ringNo ? '?ring_no=' + ringNo : ''; return apiGet(AREA2_API_BASE + '/diagnosis/slurry-grouting' + qs); }

// ===== NEW API: Thresholds =====
export function fetchArea2Thresholds(targetType?:string): Promise<ApiResult<Area2ThresholdsResponse>> { const qs = targetType ? '?target_type=' + targetType : ''; return apiGet(AREA2_API_BASE + '/thresholds' + qs); }

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
export function fetchArea2RiskSources(): Promise<ApiResult<Area2RiskSource[]>> { return apiGet(AREA2_API_BASE + '/risk-sources'); }
export function fetchArea2RiskSourcesNearby(ringNo:number): Promise<ApiResult<Area2RiskSource[]>> { return apiGet(AREA2_API_BASE + '/risk-sources/nearby?ring_no=' + ringNo); }

// ===== Legacy type aliases (keep pages compiling) =====
export type Area2DiagnosisSlurryGrouting = Record<string,unknown>;

// ===== Document type =====
export interface Area2Document { file_name?:string; document_category?:string; document_type?:string; report_date?:string; ring_no?:number; upload_date?:string; file_size?:number; registration_status?:string }