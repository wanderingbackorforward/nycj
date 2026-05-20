"""Posture deviation config service"""
from ..db import query_all, query_val

CONFIG_LIST_SQL = """
    SELECT config_id, deviation_type, deviation_name_cn,
           design_limit_mm, warning_limit_mm, alarm_limit_mm,
           direction, source, notes
    FROM shield_posture_deviation_config ORDER BY deviation_type
"""

UPDATE_SQL = """
    UPDATE shield_posture_deviation_config SET
        design_limit_mm = %s, warning_limit_mm = %s, alarm_limit_mm = %s,
        direction = %s, source = 'manual', notes = %s, updated_at = NOW()
    WHERE deviation_type = %s
"""

POSTURE_OVERVIEW_SQL = """
    SELECT p.parameter_name_cn,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE p.status_code='exceed_design_limit') AS exceed_cnt,
           MIN(p.value) AS min_v, MAX(p.value) AS max_v,
           t.design_limit_lower AS p05, t.design_limit_upper AS p95
    FROM shield_tunneling_parameter p
    LEFT JOIN shield_threshold_config t
        ON t.target_type='tunneling_parameter'
       AND t.parameter_group = p.parameter_group
       AND t.parameter_name_cn = p.parameter_name_cn
    WHERE p.parameter_group='posture' AND p.value IS NOT NULL
    GROUP BY p.parameter_name_cn, t.design_limit_lower, t.design_limit_upper
    ORDER BY exceed_cnt DESC, total DESC
"""


def get_posture_config():
    """Get posture deviation config and current threshold status"""
    configs = query_all(CONFIG_LIST_SQL)
    overview = query_all(POSTURE_OVERVIEW_SQL)

    p95_map = {}
    for o in overview:
        p95_map[o["parameter_name_cn"]] = o.get("p95")

    config_list = []
    configured_count = 0
    for c in configs:
        has_limit = c.get("design_limit_mm") is not None
        if has_limit:
            configured_count += 1

        stat_p95 = p95_map.get(c["deviation_name_cn"])

        config_list.append({
            "deviation_type": c["deviation_type"],
            "deviation_name_cn": c["deviation_name_cn"],
            "design_limit_mm": c.get("design_limit_mm"),
            "warning_limit_mm": c.get("warning_limit_mm"),
            "alarm_limit_mm": c.get("alarm_limit_mm"),
            "direction": c.get("direction", "both"),
            "source": c.get("source", "pending"),
            "notes": c.get("notes"),
            "configured": has_limit,
            "stat_p95": stat_p95,
        })

    param_stats = []
    for o in overview:
        param_stats.append({
            "parameter_name_cn": o["parameter_name_cn"],
            "total": o["total"],
            "exceed_p05_p95": o.get("exceed_cnt") or 0,
            "min": o.get("min_v"),
            "max": o.get("max_v"),
            "p05_statistical": o.get("p05"),
            "p95_statistical": o.get("p95"),
        })

    return {
        "configured": configured_count,
        "total_types": len(config_list),
        "configs": config_list,
        "currentParameterStats": param_stats,
        "dataGap": None if configured_count == 6 else "Missing deviation limits"
    }


def update_posture_config(deviation_type: str, design_limit_mm: float = None,
                          warning_limit_mm: float = None, alarm_limit_mm: float = None,
                          direction: str = "both", notes: str = None):
    """Update a posture deviation limit"""
    query_val(UPDATE_SQL, (design_limit_mm, warning_limit_mm, alarm_limit_mm, direction, notes, deviation_type))
    return {"ok": True, "deviation_type": deviation_type, "message": f"Updated {deviation_type}"}