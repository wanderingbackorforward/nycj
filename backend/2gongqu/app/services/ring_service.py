"""环号服务 - 含里程,优化查询"""
from ..db import query_all, query_one, query_val
from .cn_map import param_group_cn

RING_LIST_SQL = """
    SELECT r.ring_no, r.start_time, r.end_time, r.sample_count,
           r.first_seen_time, r.last_seen_time, r.mileage, r.chainage,
           COALESCE(pc.cnt, 0) AS param_count,
           COALESCE(mc.cnt, 0) AS mon_count
    FROM shield_tunneling_ring r
    LEFT JOIN (SELECT ring_no, COUNT(*) AS cnt FROM shield_tunneling_parameter GROUP BY ring_no) pc ON pc.ring_no = r.ring_no
    LEFT JOIN (SELECT ring_no, COUNT(*) AS cnt FROM shield_monitoring_reading GROUP BY ring_no) mc ON mc.ring_no = r.ring_no
    ORDER BY r.ring_no
"""

RING_DETAIL_SQL = "SELECT * FROM shield_tunneling_ring WHERE ring_no = %s"
RING_PARAMS_SQL = "SELECT * FROM shield_tunneling_parameter WHERE ring_no = %s ORDER BY measured_at"
RING_MON_SQL = """
    SELECT point_code, monitoring_item, current_value, cumulative_change, measured_at, status_code
    FROM shield_monitoring_reading WHERE ring_no = %s AND reading_role = 'analysis_primary' LIMIT 200
"""


def get_rings():
    rows = query_all(RING_LIST_SQL)
    result = []
    for r in rows:
        has_mileage = r.get("mileage") is not None
        label = "正常"
        if r["param_count"] == 0 and r["mon_count"] == 0:
            label = "无数据"
        elif not has_mileage:
            label = "缺里程"

        result.append({
            "ring_no": r["ring_no"],
            "start_time": str(r["start_time"]) if r.get("start_time") else None,
            "end_time": str(r["end_time"]) if r.get("end_time") else None,
            "sample_count": r.get("sample_count"),
            "first_seen_time": str(r["first_seen_time"]) if r.get("first_seen_time") else None,
            "last_seen_time": str(r["last_seen_time"]) if r.get("last_seen_time") else None,
            "mileage": r.get("mileage"),
            "chainage": r.get("chainage"),
            "parameter_count": r["param_count"],
            "monitoring_context_count": r["mon_count"],
            "data_quality_label": label
        })
    return result


def get_ring_detail(ring_no: int):
    ring = query_one(RING_DETAIL_SQL, (ring_no,))
    if not ring:
        return None
    params = query_all(RING_PARAMS_SQL, (ring_no,))
    mon = query_all(RING_MON_SQL, (ring_no,))

    groups = {}
    for p in params:
        g = p["parameter_group"] or "unknown"
        if g not in groups:
            groups[g] = {"group_code": g, "group_cn": param_group_cn(g), "parameters": []}
        groups[g]["parameters"].append({
            "name": p["parameter_name"],
            "name_cn": p["parameter_name_cn"],
            "value": p["value"],
            "unit": p["unit"]
        })

    gaps = []
    if not ring.get("mileage"):
        gaps.append({"field": "mileage", "reason": "缺少里程",
                     "impact": "无法定位"})

    r = ring
    return {
        "ring": {
            "ring_no": r["ring_no"], "start_time": str(r["start_time"]) if r.get("start_time") else None,
            "end_time": str(r["end_time"]) if r.get("end_time") else None,
            "sample_count": r.get("sample_count"), "mileage": r.get("mileage"),
            "chainage": r.get("chainage")
        },
        "parameterGroups": list(groups.values()),
        "parameterTrend": [],
        "monitoringContext": [dict(m) for m in mon],
        "findings": [],
        "actions": [],
        "dataGaps": gaps
    }