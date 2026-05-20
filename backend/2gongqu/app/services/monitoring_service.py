"""监测数据服务 - 含智能阈值查询"""
from ..db import query_all, query_val
from .cn_map import status_cn, unknown_reason_cn, reading_role_cn

ITEMS_SQL = """
    SELECT m.monitoring_item, m.monitoring_object,
           COUNT(DISTINCT m.point_code) AS point_cnt,
           COUNT(*) AS reading_cnt,
           SUM(CASE WHEN m.reading_role = 'analysis_primary' THEN 1 ELSE 0 END) AS ap_cnt,
           SUM(CASE WHEN m.reading_role = 'aggregate_summary' THEN 1 ELSE 0 END) AS as_cnt,
           SUM(CASE WHEN m.parse_confidence = 'high' THEN 1 ELSE 0 END) AS h_cnt,
           SUM(CASE WHEN m.parse_confidence = 'medium' THEN 1 ELSE 0 END) AS m_cnt,
           SUM(CASE WHEN m.status_code = 'normal' THEN 1 ELSE 0 END) AS normal_cnt,
           SUM(CASE WHEN m.status_code = 'warning' THEN 1 ELSE 0 END) AS warning_cnt,
           SUM(CASE WHEN m.status_code = 'alarm' THEN 1 ELSE 0 END) AS alarm_cnt
    FROM shield_monitoring_reading m
    GROUP BY m.monitoring_item, m.monitoring_object
    ORDER BY reading_cnt DESC
"""

READING_SQL_BASE = """
    SELECT point_code, monitoring_item, measured_at, current_value, cumulative_change,
           daily_change, status_code, unknown_reason, status_reason, reading_role, parse_confidence,
           source_file_name, source_sheet_name, row_index, evidence_text
    FROM shield_monitoring_reading
    WHERE 1=1
"""

SUMMARY_SQL = """
    SELECT reading_role, COUNT(*) FROM shield_monitoring_reading GROUP BY reading_role
"""

STATUS_SQL = "SELECT status_code, COUNT(*) FROM shield_monitoring_reading GROUP BY status_code"
UNKNOWN_REASON_SQL = "SELECT unknown_reason, COUNT(*) FROM shield_monitoring_reading WHERE unknown_reason IS NOT NULL GROUP BY unknown_reason"
CONFIDENCE_SQL = "SELECT parse_confidence, COUNT(*) FROM shield_monitoring_reading GROUP BY parse_confidence"
ITEM_DIST_SQL = "SELECT monitoring_item, COUNT(*) FROM shield_monitoring_reading GROUP BY monitoring_item ORDER BY 2 DESC"

# 获取监测项的阈值
THRESHOLD_SQL = """
    SELECT monitoring_item, design_limit_upper, warning_threshold, alarm_threshold,
           rate_warning, rate_alarm, derivation_method, confidence
    FROM shield_threshold_config WHERE target_type='monitoring'
"""


def get_items():
    rows = query_all(ITEMS_SQL)
    result = []
    for r in rows:
        total = r["reading_cnt"]
        normal = r.get("normal_cnt") or 0
        warning = r.get("warning_cnt") or 0
        alarm = r.get("alarm_cnt") or 0

        if alarm > 0:
            status_label = "报警"
        elif warning > 0:
            status_label = "预警"
        elif normal > 0:
            status_label = "正常"
        else:
            status_label = "待确认"

        result.append({
            "monitoring_item": r["monitoring_item"],
            "monitoring_object": r.get("monitoring_object"),
            "point_count": r["point_cnt"],
            "reading_count": total,
            "analysis_primary_count": r["ap_cnt"],
            "aggregate_summary_count": r["as_cnt"],
            "parse_confidence_high": r["h_cnt"],
            "parse_confidence_medium": r["m_cnt"],
            "normal_cnt": normal,
            "warning_cnt": warning,
            "alarm_cnt": alarm,
            "status_display_cn": status_label,
        })
    return result


def get_readings(point_code=None, item=None, start_date=None, end_date=None, include_summary=False, limit=500):
    sql = READING_SQL_BASE
    params = []
    if not include_summary:
        sql += " AND reading_role = 'analysis_primary'"
    if point_code:
        sql += " AND point_code = %s"
        params.append(point_code)
    if item:
        sql += " AND monitoring_item = %s"
        params.append(item)
    if start_date:
        sql += " AND measured_at >= %s"
        params.append(start_date)
    if end_date:
        sql += " AND measured_at <= %s"
        params.append(end_date)
    sql += " ORDER BY measured_at LIMIT %s"
    params.append(min(limit, 1000))

    rows = query_all(sql, tuple(params))

    # 获取阈值映射
    thresholds = {}
    for t in query_all(THRESHOLD_SQL):
        thresholds[t["monitoring_item"]] = t

    data = []
    for r in rows:
        item = r.get("monitoring_item")
        t = thresholds.get(item, {})
        reason = r.get("unknown_reason")
        code = r.get("status_code") or "unknown"

        data.append({
            "point_code": r.get("point_code"),
            "monitoring_item": item,
            "measured_at": str(r["measured_at"]) if r.get("measured_at") else None,
            "current_value": r.get("current_value"),
            "cumulative_change": r.get("cumulative_change"),
            "daily_change": r.get("daily_change"),
            "status_code": code,
            "status_display_cn": status_cn(code),
            "status_reason": r.get("status_reason"),
            "unknown_reason": reason,
            "unknown_reason_cn": unknown_reason_cn(reason),
            "reading_role": r.get("reading_role") or "analysis_primary",
            "reading_role_cn": reading_role_cn(r.get("reading_role")),
            "parse_confidence": r.get("parse_confidence") or "medium",
            "source_file_name": r.get("source_file_name"),
            "source_sheet_name": r.get("source_sheet_name"),
            "row_index": r.get("row_index"),
            "evidence_text": r.get("evidence_text"),
            # 阈值参考
            "threshold": {
                "design_limit_upper": t.get("design_limit_upper"),
                "warning_threshold": t.get("warning_threshold"),
                "alarm_threshold": t.get("alarm_threshold"),
                "rate_warning": t.get("rate_warning"),
                "rate_alarm": t.get("rate_alarm"),
                "derivation_method": t.get("derivation_method"),
                "threshold_confidence": t.get("confidence"),
            } if t else None,
        })
    return {"data": data, "total": len(data)}


def get_summary():
    total = query_val("SELECT COUNT(*) FROM shield_monitoring_reading")
    ap = query_val("SELECT COUNT(*) FROM shield_monitoring_reading WHERE reading_role = 'analysis_primary'")
    as_cnt = query_val("SELECT COUNT(*) FROM shield_monitoring_reading WHERE reading_role = 'aggregate_summary'")

    status_dist = {r['status_code']: r['count'] for r in query_all(STATUS_SQL)}
    reason_dist = {r['unknown_reason'] or "null": r['count'] for r in query_all(UNKNOWN_REASON_SQL)}
    conf_dist = {r['parse_confidence']: r['count'] for r in query_all(CONFIDENCE_SQL)}
    item_dist = [{"item": r['monitoring_item'], "count": r['count']} for r in query_all(ITEM_DIST_SQL)]

    # 阈值统计
    normal_ap = query_val("SELECT COUNT(*) FROM shield_monitoring_reading WHERE status_code='normal' AND reading_role='analysis_primary'")
    warning_ap = query_val("SELECT COUNT(*) FROM shield_monitoring_reading WHERE status_code='warning' AND reading_role='analysis_primary'")
    alarm_ap = query_val("SELECT COUNT(*) FROM shield_monitoring_reading WHERE status_code='alarm' AND reading_role='analysis_primary'")

    return {
        "total_readings": total,
        "analysis_primary_count": ap,
        "aggregate_summary_count": as_cnt,
        "status_code_dist": status_dist,
        "unknown_reason_dist": reason_dist,
        "monitoring_item_dist": item_dist,
        "parse_confidence_dist": conf_dist,
        "alert_summary": {
            "normal": normal_ap or 0,
            "warning": warning_ap or 0,
            "alarm": alarm_ap or 0,
        },
        "dataGaps": [
            {"field": "threshold_source", "reason": "当前阈值为统计推导(P95/P99)，非工程设计值", "impact": "预警/报警基于历史数据分布，建议从设计方案补充正式阈值"},
            {"field": "design_limit", "reason": "design_limit 暂用 P95 近似", "impact": "如需精确设计限值，需从施工图或规范获取"},
        ]
    }