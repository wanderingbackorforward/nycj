"""掘进参数服务 - 含智能阈值判定"""
from ..db import query_all, query_val
from .cn_map import param_group_cn, status_cn

PARAM_SQL_BASE = """
    SELECT p.ring_no, p.measured_at, p.parameter_group, p.parameter_name, p.parameter_name_cn,
           p.value, p.unit, p.status_code, p.status_reason,
           p.source_file_name, p.row_index, p.evidence_text
    FROM shield_tunneling_parameter p
    WHERE p.value IS NOT NULL
"""

GROUPS_SQL = """
    SELECT parameter_group, COUNT(*) AS param_cnt, COUNT(DISTINCT ring_no) AS ring_cnt,
           MIN(measured_at) AS first_t, MAX(measured_at) AS last_t,
           SUM(CASE WHEN status_code='normal' THEN 1 ELSE 0 END) AS normal_cnt,
           SUM(CASE WHEN status_code='exceed_design_limit' THEN 1 ELSE 0 END) AS exceed_cnt
    FROM shield_tunneling_parameter WHERE value IS NOT NULL
    GROUP BY parameter_group ORDER BY param_cnt DESC
"""

THRESHOLD_SQL = """
    SELECT parameter_group, parameter_name_cn, design_limit_lower, design_limit_upper,
           derivation_method, confidence
    FROM shield_threshold_config WHERE target_type='tunneling_parameter'
"""


def get_parameters(ring_no=None, group=None, start_time=None, end_time=None, limit=500):
    sql = PARAM_SQL_BASE
    params = []
    conditions = []
    if ring_no:
        conditions.append("p.ring_no = %s")
        params.append(ring_no)
    if group:
        conditions.append("p.parameter_group = %s")
        params.append(group)
    if start_time:
        conditions.append("p.measured_at >= %s")
        params.append(start_time)
    if end_time:
        conditions.append("p.measured_at <= %s")
        params.append(end_time)
    if conditions:
        sql += " AND " + " AND ".join(conditions)
    sql += " ORDER BY p.measured_at LIMIT %s"
    params.append(min(limit, 1000))

    rows = query_all(sql, tuple(params))

    # 获取阈值
    thresholds = {}
    for t in query_all(THRESHOLD_SQL):
        key = (t["parameter_group"], t["parameter_name_cn"])
        thresholds[key] = t

    data = []
    for r in rows:
        key = (r["parameter_group"], r["parameter_name_cn"])
        t = thresholds.get(key, {})
        code = r.get("status_code") or "unknown"

        data.append({
            "ring_no": r["ring_no"],
            "measured_at": str(r["measured_at"]) if r.get("measured_at") else None,
            "parameter_group": r["parameter_group"] or "unknown",
            "parameter_group_cn": param_group_cn(r["parameter_group"]),
            "parameter_name": r["parameter_name"],
            "parameter_name_cn": r["parameter_name_cn"],
            "value": r["value"],
            "unit": r.get("unit"),
            "status_code": code,
            "status_display_cn": status_cn(code),
            "status_reason": r.get("status_reason"),
            "source_file_name": r.get("source_file_name"),
            "row_index": r.get("row_index"),
            "evidence_text": r.get("evidence_text"),
            "threshold": {
                "design_limit_lower": t.get("design_limit_lower"),
                "design_limit_upper": t.get("design_limit_upper"),
                "derivation_method": t.get("derivation_method"),
                "threshold_confidence": t.get("confidence"),
            } if t else None,
        })

    total = len(data)
    return {
        "data": data,
        "total": total,
        "chart": {
            "x": "measured_at", "series": ["value"], "groupBy": "parameter_name_cn",
            "interpretation": "用于观察掘进参数波动。阈值基于历史数据 P05/P95 统计推导，非工程设计值。"
        }
    }


def get_groups():
    rows = query_all(GROUPS_SQL)
    result = []
    for r in rows:
        g = r["parameter_group"]
        exceed = r.get("exceed_cnt") or 0
        data_gap = None
        if not r.get("first_t"):
            data_gap = "该分组当前无可用数据"
        elif exceed > 0:
            data_gap = f"该分组有 {exceed} 条参数超 P05/P95 统计限值"

        result.append({
            "group_code": g,
            "group_name_cn": param_group_cn(g),
            "parameter_count": r["param_cnt"],
            "ring_count": r["ring_cnt"],
            "sample_count": r["param_cnt"],
            "normal_count": r.get("normal_cnt") or 0,
            "exceed_count": exceed,
            "latest_time": str(r["last_t"]) if r.get("last_t") else None,
            "data_gap": data_gap,
        })
    return result