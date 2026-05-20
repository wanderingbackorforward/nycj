"""中文映射表"""

PARAM_GROUP_CN = {
    "advance": "推进",
    "cutterhead": "刀盘",
    "slurry": "泥水/土压",
    "grouting": "同步注浆",
    "posture": "姿态/油缸行程",
    "unknown": "未分类",
}

STATUS_CN = {
    "normal": "正常",
    "exceed_design_limit": "超设计限值",
    "warning": "预警",
    "alarm": "报警",
    "unknown": "待确认",
    "derived_summary": "汇总数据",
}

UNKNOWN_REASON_CN = {
    "missing_threshold": "缺少阈值",
    "missing_design_limit": "缺少设计限值",
    "threshold_not_provided": "日报未提供阈值",
    "aggregate_summary_no_threshold": "汇总数据不参与阈值判定",
    "exceed_alarm_p99": "超P99报警限值",
    "exceed_warning_p95": "超P95预警限值",
    "exceed_design_p95": "超P95设计限值",
    "exceed_rate_alarm_p99": "日变化率超P99报警",
    "exceed_rate_warning_p95": "日变化率超P95预警",
    "below_p05": "低于P05下限",
    "exceed_p95": "超P95上限",
    None: "待确认",
}

LEVEL_CN = {
    "normal": "正常",
    "caution": "注意",
    "warning": "预警",
    "alarm": "报警",
    "unknown": "待确认",
}

DOC_CATEGORY_CN = {
    "tunneling_parameter_excel": "掘进参数",
    "daily_monitoring_xlsx": "日报监测",
    "weekly_report_pdf": "周报",
    "cad_drawing_dwg": "CAD图纸",
    "source_archive_rar": "原始压缩包",
    "unknown": "未知",
}

RELATED_TABLE_CN = {
    "tunneling_parameter": "掘进参数",
    "monitoring_reading": "监测读数",
    "weekly_report_summary": "周报摘要",
    "cad_drawing": "CAD图纸",
    "source_document": "源文件",
}

READING_ROLE_CN = {
    "analysis_primary": "分析主数据",
    "aggregate_summary": "汇总数据",
    "raw_evidence": "原始证据",
    "derived": "派生数据",
}

THRESHOLD_TARGET_CN = {
    "monitoring": "监测阈值",
    "tunneling_parameter": "掘进参数阈值",
}

CONFIDENCE_CN = {
    "high": "高",
    "medium": "中(统计推导)",
    "low": "低",
}

def param_group_cn(code):
    return PARAM_GROUP_CN.get(code, code)

def status_cn(code):
    return STATUS_CN.get(code, code or "待确认")

def level_cn(code):
    return LEVEL_CN.get(code, code or "待确认")

def doc_category_cn(code):
    return DOC_CATEGORY_CN.get(code, code)

def related_table_cn(code):
    return RELATED_TABLE_CN.get(code, code)

def reading_role_cn(code):
    return READING_ROLE_CN.get(code, code)

def unknown_reason_cn(reason):
    if reason is None:
        return "待确认"
    return UNKNOWN_REASON_CN.get(reason, reason)

def threshold_target_cn(code):
    return THRESHOLD_TARGET_CN.get(code, code)

def confidence_cn(code):
    return CONFIDENCE_CN.get(code, code)