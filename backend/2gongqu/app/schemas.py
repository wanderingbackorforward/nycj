"""Pydantic 响应模型 - 所有前端可见字段必须中文化"""
from typing import Optional, Any
from pydantic import BaseModel

# --- 通用 ---
class HealthResponse(BaseModel):
    ok: bool
    database: str
    schema: str
    project: str
    tables: dict
    views: dict

class DataGap(BaseModel):
    field: str
    reason: str
    impact: str

class Finding(BaseModel):
    level: str
    level_cn: str
    message: str
    source: str

class Action(BaseModel):
    priority: str
    priority_cn: str
    description: str

# --- 指挥总览 ---
class Position(BaseModel):
    currentRing: Optional[int]
    ringRange: Optional[list]
    mileage: Optional[float]
    positionSource: str
    dataGap: Optional[str]

class OverviewResponse(BaseModel):
    generatedAt: str
    projectName: str
    workArea: str
    date: Optional[str]
    overallLevel: str
    overallLevelCn: str
    headline: str
    position: Position
    cards: list = []
    parameterSummary: list = []
    monitoringSummary: list = []
    findings: list = []
    actions: list = []
    dataGaps: list = []

# --- 环号 ---
class RingItem(BaseModel):
    ring_no: int
    start_time: Optional[str]
    end_time: Optional[str]
    sample_count: Optional[int]
    first_seen_time: Optional[str]
    last_seen_time: Optional[str]
    parameter_count: int
    monitoring_context_count: int
    data_quality_label: str

class RingDetailResponse(BaseModel):
    ring: Optional[dict]
    parameterGroups: list = []
    parameterTrend: list = []
    monitoringContext: list = []
    findings: list = []
    actions: list = []
    dataGaps: list = []

# --- 掘进参数 ---
class TunnelingParamItem(BaseModel):
    ring_no: Optional[int]
    measured_at: Optional[str]
    parameter_group: str
    parameter_group_cn: str
    parameter_name: str
    parameter_name_cn: str
    value: Optional[float]
    unit: Optional[str]
    status_code: str
    status_display_cn: str
    status_reason: Optional[str]
    source_file_name: Optional[str]
    row_index: Optional[int]
    evidence_text: Optional[str]
    threshold: Optional[dict] = None

class TunnelingGroupItem(BaseModel):
    group_code: str
    group_name_cn: str
    parameter_count: int
    ring_count: int
    sample_count: int
    normal_count: int
    exceed_count: int
    latest_time: Optional[str]
    data_gap: Optional[str]

class TunnelingParamResponse(BaseModel):
    data: list = []
    total: int = 0
    chart: dict = {}

# --- 诊断 ---
class DiagComponent(BaseModel):
    name: str
    level: str
    level_cn: str
    evidence: list = []
    suggestion: str

class DiagnosisResponse(BaseModel):
    score: Optional[int] = None
    level: str
    level_cn: str
    headline: str
    components: list = []
    trend: list = []
    monitoringResponse: list = []
    dataGaps: list = []

# --- 监测 ---
class MonitoringItemSummary(BaseModel):
    monitoring_item: str
    monitoring_object: Optional[str]
    point_count: int
    reading_count: int
    analysis_primary_count: int
    aggregate_summary_count: int
    parse_confidence_high: int
    parse_confidence_medium: int
    normal_cnt: int
    warning_cnt: int
    alarm_cnt: int
    status_display_cn: str

class MonitoringReadingItem(BaseModel):
    point_code: Optional[str]
    monitoring_item: Optional[str]
    measured_at: Optional[str]
    current_value: Optional[float]
    cumulative_change: Optional[float]
    daily_change: Optional[float]
    status_code: str
    status_display_cn: str
    status_reason: Optional[str]
    unknown_reason: Optional[str]
    unknown_reason_cn: str
    reading_role: str
    reading_role_cn: str
    parse_confidence: str
    source_file_name: Optional[str]
    source_sheet_name: Optional[str]
    row_index: Optional[int]
    evidence_text: Optional[str]
    threshold: Optional[dict] = None

class MonitoringSummaryResponse(BaseModel):
    total_readings: int
    analysis_primary_count: int
    aggregate_summary_count: int
    status_code_dist: dict = {}
    unknown_reason_dist: dict = {}
    monitoring_item_dist: list = []
    parse_confidence_dist: dict = {}
    alert_summary: dict = {}
    dataGaps: list = []

# --- 文档/证据 ---
class DocumentItem(BaseModel):
    source_document_id: str
    file_name: str
    document_category: str
    document_category_cn: str
    report_date: Optional[str]
    date_range_start: Optional[str]
    date_range_end: Optional[str]
    parse_status: str
    related_count: int
    evidence_count: int

class EvidenceItem(BaseModel):
    evidence_id: str
    related_table: str
    related_table_cn: str
    related_key: Optional[str]
    file_name: Optional[str]
    sheet_name: Optional[str]
    page_no: Optional[int]
    row_index: Optional[int]
    raw_text: Optional[str]
    extraction_method: str
    confidence: str

# --- 数据质量 ---
class DataQualitySummaryResponse(BaseModel):
    status_code_dist: dict = {}
    unknown_reason_dist: dict = {}
    parse_confidence_dist: dict = {}
    reading_role_dist: dict = {}
    evidence_coverage: dict = {}
    cad_status: str
    cad_status_cn: str
    dataGaps: list = []
    nextActions: list = []

# --- 系统状态 ---
class SystemStatusResponse(BaseModel):
    databaseConnected: bool
    schema: str
    tableCounts: dict = {}
    viewStatus: dict = {}
    sourceFileCount: int
    latestImportTime: Optional[str]
    knownIssues: list = []
    nextActions: list = []

# --- 阈值 ---
class ThresholdItem(BaseModel):
    config_id: str
    target_type: str
    target_type_cn: str
    monitoring_item: Optional[str] = None
    parameter_group: Optional[str] = None
    parameter_name: Optional[str] = None
    parameter_name_cn: Optional[str] = None
    design_limit_lower: Optional[float] = None
    design_limit_upper: Optional[float] = None
    warning_threshold: Optional[float] = None
    alarm_threshold: Optional[float] = None
    rate_warning: Optional[float] = None
    rate_alarm: Optional[float] = None
    derivation_method: Optional[str] = None
    sample_count: Optional[int] = None
    confidence: Optional[str] = None
    confidence_cn: Optional[str] = None
    notes: Optional[str] = None

class ThresholdListResponse(BaseModel):
    data: list = []
    total: int = 0

# --- 分析总览 ---
class MonitoringAnalytics(BaseModel):
    total_readings: int
    normal: int
    warning: int
    alarm: int
    exceed_design_limit: int
    unknown: int
    by_item: list = []

class TunnelingAnalytics(BaseModel):
    total_parameters: int
    normal: int
    exceed_design_limit: int
    exceed_by_ring: list = []

class AnalyticsOverviewResponse(BaseModel):
    monitoring: MonitoringAnalytics
    tunneling: TunnelingAnalytics
    thresholds: dict = {}
    dataGaps: list = []