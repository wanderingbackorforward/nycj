"""阈值服务 - 查询与推导阈值配置"""
from ..db import query_all, query_val, query_one
from .cn_map import status_cn, unknown_reason_cn, confidence_cn, threshold_target_cn

THRESHOLD_LIST_SQL = """
    SELECT config_id, target_type, monitoring_item, parameter_group,
           parameter_name, parameter_name_cn,
           design_limit_lower, design_limit_upper,
           warning_threshold, alarm_threshold,
           rate_warning, rate_alarm,
           derivation_method, sample_count, confidence, notes, created_at
    FROM shield_threshold_config
    ORDER BY target_type, COALESCE(monitoring_item, parameter_name_cn)
"""

THRESHOLD_BY_TYPE_SQL = """
    SELECT * FROM shield_threshold_config WHERE target_type = %s
    ORDER BY COALESCE(monitoring_item, parameter_name_cn)
"""

ANALYTICS_OVERVIEW_SQL = """
SELECT
    (SELECT COUNT(*) FROM shield_monitoring_reading WHERE reading_role='analysis_primary') AS total_readings,
    (SELECT COUNT(*) FROM shield_monitoring_reading WHERE status_code='normal' AND reading_role='analysis_primary') AS normal_cnt,
    (SELECT COUNT(*) FROM shield_monitoring_reading WHERE status_code='warning' AND reading_role='analysis_primary') AS warning_cnt,
    (SELECT COUNT(*) FROM shield_monitoring_reading WHERE status_code='alarm' AND reading_role='analysis_primary') AS alarm_cnt,
    (SELECT COUNT(*) FROM shield_monitoring_reading WHERE status_code='exceed_design_limit' AND reading_role='analysis_primary') AS exceed_design_cnt,
    (SELECT COUNT(*) FROM shield_monitoring_reading WHERE status_code='unknown' AND reading_role='analysis_primary') AS unknown_cnt,
    (SELECT COUNT(*) FROM shield_tunneling_parameter WHERE value IS NOT NULL) AS total_tunneling,
    (SELECT COUNT(*) FROM shield_tunneling_parameter WHERE status_code='normal') AS tunneling_normal,
    (SELECT COUNT(*) FROM shield_tunneling_parameter WHERE status_code='exceed_design_limit') AS tunneling_exceed,
    (SELECT COUNT(*) FROM shield_threshold_config WHERE target_type='monitoring') AS monitoring_threshold_cnt,
    (SELECT COUNT(*) FROM shield_threshold_config WHERE target_type='tunneling_parameter') AS tunneling_threshold_cnt
"""

# 按监测项的超限统计
MONITORING_ALERT_BY_ITEM_SQL = """
    SELECT monitoring_item,
           COUNT(*) FILTER (WHERE status_code='normal') AS normal_cnt,
           COUNT(*) FILTER (WHERE status_code='warning') AS warning_cnt,
           COUNT(*) FILTER (WHERE status_code='alarm') AS alarm_cnt,
           COUNT(*) FILTER (WHERE status_code='exceed_design_limit') AS exceed_design_cnt,
           COUNT(*) FILTER (WHERE status_code='unknown') AS unknown_cnt
    FROM shield_monitoring_reading
    WHERE reading_role='analysis_primary'
    GROUP BY monitoring_item ORDER BY alarm_cnt DESC, warning_cnt DESC
"""

# 按环号的掘进参数超限统计
TUNNELING_EXCEED_BY_RING_SQL = """
    SELECT ring_no, parameter_group,
           COUNT(*) AS total_in_ring,
           COUNT(*) FILTER (WHERE status_code='exceed_design_limit') AS exceed_cnt
    FROM shield_tunneling_parameter WHERE value IS NOT NULL
    GROUP BY ring_no, parameter_group
    HAVING COUNT(*) FILTER (WHERE status_code='exceed_design_limit') > 0
    ORDER BY ring_no, parameter_group
"""


def get_all_thresholds():
    rows = query_all(THRESHOLD_LIST_SQL)
    result = []
    for r in rows:
        result.append({
            "config_id": r["config_id"],
            "target_type": r["target_type"],
            "target_type_cn": threshold_target_cn(r["target_type"]),
            "monitoring_item": r.get("monitoring_item"),
            "parameter_group": r.get("parameter_group"),
            "parameter_name": r.get("parameter_name"),
            "parameter_name_cn": r.get("parameter_name_cn"),
            "design_limit_lower": r.get("design_limit_lower"),
            "design_limit_upper": r.get("design_limit_upper"),
            "warning_threshold": r.get("warning_threshold"),
            "alarm_threshold": r.get("alarm_threshold"),
            "rate_warning": r.get("rate_warning"),
            "rate_alarm": r.get("rate_alarm"),
            "derivation_method": r.get("derivation_method"),
            "sample_count": r.get("sample_count"),
            "confidence": r.get("confidence"),
            "confidence_cn": confidence_cn(r.get("confidence")),
            "notes": r.get("notes"),
        })
    return result


def get_thresholds_by_type(target_type: str):
    rows = query_all(THRESHOLD_BY_TYPE_SQL, (target_type,))
    result = []
    for r in rows:
        result.append({
            "config_id": r["config_id"],
            "target_type": r["target_type"],
            "target_type_cn": threshold_target_cn(r["target_type"]),
            "monitoring_item": r.get("monitoring_item"),
            "parameter_group": r.get("parameter_group"),
            "parameter_name": r.get("parameter_name"),
            "parameter_name_cn": r.get("parameter_name_cn"),
            "design_limit_lower": r.get("design_limit_lower"),
            "design_limit_upper": r.get("design_limit_upper"),
            "warning_threshold": r.get("warning_threshold"),
            "alarm_threshold": r.get("alarm_threshold"),
            "rate_warning": r.get("rate_warning"),
            "rate_alarm": r.get("rate_alarm"),
            "derivation_method": r.get("derivation_method"),
            "sample_count": r.get("sample_count"),
            "confidence": r.get("confidence"),
            "confidence_cn": confidence_cn(r.get("confidence")),
            "notes": r.get("notes"),
        })
    return result


def get_analytics_overview():
    row = query_one(ANALYTICS_OVERVIEW_SQL)
    item_rows = query_all(MONITORING_ALERT_BY_ITEM_SQL)
    exceed_rows = query_all(TUNNELING_EXCEED_BY_RING_SQL)

    monitoring_items = []
    for r in item_rows:
        monitoring_items.append({
            "monitoring_item": r["monitoring_item"],
            "normal_cnt": r["normal_cnt"],
            "warning_cnt": r["warning_cnt"],
            "alarm_cnt": r["alarm_cnt"],
            "exceed_design_cnt": r["exceed_design_cnt"],
            "unknown_cnt": r["unknown_cnt"],
        })

    tunneling_exceed = []
    for r in exceed_rows:
        tunneling_exceed.append({
            "ring_no": r["ring_no"],
            "parameter_group": r["parameter_group"],
            "total_in_ring": r["total_in_ring"],
            "exceed_cnt": r["exceed_cnt"],
        })

    total_readings = row["total_readings"] or 0
    return {
        "monitoring": {
            "total_readings": total_readings,
            "normal": row["normal_cnt"] or 0,
            "warning": row["warning_cnt"] or 0,
            "alarm": row["alarm_cnt"] or 0,
            "exceed_design_limit": row["exceed_design_cnt"] or 0,
            "unknown": row["unknown_cnt"] or 0,
            "by_item": monitoring_items,
        },
        "tunneling": {
            "total_parameters": row["total_tunneling"] or 0,
            "normal": row["tunneling_normal"] or 0,
            "exceed_design_limit": row["tunneling_exceed"] or 0,
            "exceed_by_ring": tunneling_exceed,
        },
        "thresholds": {
            "monitoring_count": row["monitoring_threshold_cnt"] or 0,
            "tunneling_count": row["tunneling_threshold_cnt"] or 0,
        },
        "dataGaps": [
            {"field": "threshold_confidence", "reason": "阈值为统计推导(P95/P99)，非工程设计值", "impact": "预警/报警基于历史数据分布，建议后续补充正式设计阈值"},
            {"field": "cad_registration", "reason": "CAD图纸仅登记未空间配准", "impact": "无法自动关联风险源空间位置"},
        ]
    }