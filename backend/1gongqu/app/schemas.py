from pydantic import BaseModel
from typing import Optional, Any

class HealthTables(BaseModel):
    gn_source_document: int = 0
    gn_monitoring_point: int = 0
    gn_monitoring_reading: int = 0
    gn_extraction_evidence: int = 0

class HealthViews(BaseModel):
    v_gn_page_default_reading: bool = False
    v_gn_manual_review_reading: bool = False
    v_gn_alert_review: bool = False

class HealthResponse(BaseModel):
    ok: bool
    database: str
    project: str
    work_area: str
    tables: HealthTables
    views: HealthViews

class Card(BaseModel):
    name: str
    value: Any
    unit: str = ""

class StatusDist(BaseModel):
    status_code: str
    status_display_cn: str
    count: int

class Finding(BaseModel):
    level: str
    title: str
    detail: str

class Action(BaseModel):
    priority: str
    action: str
    target: str = ""

class DataGap(BaseModel):
    category: str
    description: str
    affected_count: int = 0

class OverviewResponse(BaseModel):
    generated_at: str
    project_name: str
    work_area: str
    date: str
    overall_level: str
    overall_level_cn: str
    headline: str
    cards: list[Card] = []
    status_distribution: list[StatusDist] = []
    priority_findings: list[Finding] = []
    actions: list[Action] = []
    data_gaps: list[DataGap] = []

class MonitoringItem(BaseModel):
    monitoring_item: str
    monitoring_object: str
    point_count: int
    reading_count: int
    normal_count: int
    exceed_count: int
    unknown_count: int
    latest_date: str = ""
    status_display_cn: str = ""

class MonitoringItemList(BaseModel):
    items: list[MonitoringItem]
    total: int

class MonitoringPoint(BaseModel):
    point_code: str
    point_name: str
    monitoring_item: str
    monitoring_object: str
    side: str
    part: str
    first_seen_date: str = ""
    last_seen_date: str = ""
    latest_status: str = ""
    latest_status_cn: str = ""
    latest_value: Optional[float] = None
    latest_cumulative_change: Optional[float] = None
    design_limit: Optional[float] = None
    data_quality_label: str = ""

class MonitoringPointList(BaseModel):
    points: list[MonitoringPoint]
    total: int

class Reading(BaseModel):
    measured_at: str
    current_value: Optional[float] = None
    cumulative_change: Optional[float] = None
    daily_change: Optional[float] = None
    design_limit: Optional[float] = None
    status_code: str = ""
    status_display_cn: str = ""
    review_level: str = ""
    source_file_name: str = ""
    source_sheet_name: str = ""
    row_index: Optional[int] = None
    evidence_text: str = ""

class ChartSuggestion(BaseModel):
    x: str = "measured_at"
    y: str = "cumulative_change"
    mark_line: str = "design_limit"
    interpretation: str = ""

class ReadingsResponse(BaseModel):
    point_code: str
    monitoring_item: str = ""
    unit: str = ""
    design_limit: Optional[float] = None
    readings: list[Reading] = []
    chart: ChartSuggestion = ChartSuggestion()

class AlertItem(BaseModel):
    point_code: str
    monitoring_item: str
    monitoring_object: str
    side: str
    part: str
    measured_at: str
    current_value: Optional[float] = None
    cumulative_change: Optional[float] = None
    design_limit: Optional[float] = None
    exceed_ratio: Optional[float] = None
    review_level: str = ""
    source_file_name: str = ""
    source_sheet_name: str = ""
    row_index: Optional[int] = None
    evidence_text: str = ""
    suggested_action: str = ""

class AlertsResponse(BaseModel):
    total: int
    alerts: list[AlertItem]

class PointAnalysisResponse(BaseModel):
    point: dict = {}
    latest: dict = {}
    trend: list[dict] = []
    evidence: list[dict] = []
    findings: list[dict] = []
    actions: list[dict] = []
    data_gaps: list[dict] = []

class DataQualityCount(BaseModel):
    status_code: str = ""
    unknown_reason: str = ""
    count: int = 0

class DataQualityResponse(BaseModel):
    status_distribution: list[dict] = []
    unknown_reason_distribution: list[dict] = []
    confidence_distribution: list[dict] = []
    reading_role_distribution: list[dict] = []
    review_level_distribution: list[dict] = []
    evidence_coverage: dict = {}
    data_gaps: list[DataGap] = []

class SourceDocument(BaseModel):
    source_document_id: str
    file_name: str
    document_category: str
    report_date: str = ""
    date_range_start: str = ""
    date_range_end: str = ""
    parse_status: str = ""
    reading_count: int = 0
    evidence_count: int = 0
    has_pdf_summary: bool = False

class SourceDocumentList(BaseModel):
    documents: list[SourceDocument]
    total: int

class EvidenceItem(BaseModel):
    evidence_id: str
    related_table: str
    related_key: str
    file_name: str
    sheet_name: str = ""
    page_no: Optional[int] = None
    row_index: Optional[int] = None
    raw_text: str = ""
    raw_row_json: str = ""
    extraction_method: str = ""
    confidence: str = ""

class SystemStatusResponse(BaseModel):
    database_connected: bool
    table_counts: dict = {}
    view_status: dict = {}
    latest_import_time: str = ""
    source_file_count: int = 0
    data_completeness: str = ""
    known_issues: list[str] = []
    next_actions: list[str] = []
