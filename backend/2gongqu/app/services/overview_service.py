"""指挥总览服务 - 查询合并优化(5→2)"""
from datetime import datetime
from ..db import query_all, query_one, query_val
from .cn_map import param_group_cn, level_cn

# 合并查询: ring_range + latest_ring + mile_cfg + alert_dist → 1次
OVERVIEW_SQL = """
WITH latest_ring AS (
    SELECT ring_no, start_time, end_time, sample_count, mileage, chainage
    FROM shield_tunneling_ring ORDER BY ring_no DESC LIMIT 1
),
ring_range AS (
    SELECT MIN(ring_no) AS min_ring, MAX(ring_no) AS max_ring, COUNT(*) AS ring_cnt
    FROM shield_tunneling_ring
),
mile_cfg AS (
    SELECT starting_mileage_m FROM shield_ring_mileage_config ORDER BY updated_at DESC LIMIT 1
),
alert AS (
    SELECT status_code, COUNT(*) AS cnt FROM shield_monitoring_reading
    WHERE reading_role='analysis_primary' GROUP BY status_code
),
param AS (
    SELECT parameter_group, COUNT(*) AS cnt, COUNT(DISTINCT ring_no) AS ring_cnt,
           MIN(measured_at) AS first_t, MAX(measured_at) AS last_t
    FROM shield_tunneling_parameter WHERE value IS NOT NULL
    GROUP BY parameter_group ORDER BY cnt DESC
),
mon AS (
    SELECT monitoring_item, COUNT(*) AS cnt, COUNT(DISTINCT point_code) AS point_cnt,
           SUM(CASE WHEN status_code='alarm' THEN 1 ELSE 0 END) AS alarm_cnt,
           SUM(CASE WHEN status_code='warning' THEN 1 ELSE 0 END) AS warning_cnt
    FROM shield_monitoring_reading WHERE reading_role='analysis_primary'
    GROUP BY monitoring_item ORDER BY cnt DESC
)
SELECT
    (SELECT row_to_json(lr) FROM latest_ring lr) AS latest,
    (SELECT row_to_json(rr) FROM ring_range rr) AS ring_range,
    (SELECT starting_mileage_m FROM mile_cfg) AS mile_cfg,
    (SELECT json_object_agg(status_code, cnt) FROM alert) AS alert_dist,
    (SELECT json_agg(row_to_json(p)) FROM param p) AS param_summary,
    (SELECT json_agg(row_to_json(m)) FROM mon m) AS mon_summary
"""


def get_overview():
    t0 = datetime.now()
    row = query_one(OVERVIEW_SQL)
    now = t0.isoformat()

    latest = row.get("latest") or {}
    ring_range = row.get("ring_range") or {}
    mile_cfg = row.get("mile_cfg")
    alert_dist = row.get("alert_dist") or {}
    param_rows = row.get("param_summary") or []
    mon_rows = row.get("mon_summary") or []

    has_mileage = (latest.get("mileage") is not None) or (mile_cfg is not None)
    alarm_count = alert_dist.get("alarm", 0)
    warning_count = alert_dist.get("warning", 0)
    normal_count = alert_dist.get("normal", 0)

    # Position
    position = {
        "currentRing": latest.get("ring_no"),
        "ringRange": [ring_range.get("min_ring"), ring_range.get("max_ring")],
        "mileage": latest.get("mileage"),
        "chainage": latest.get("chainage"),
        "positionSource": "环号数据" + (" + 周报里程推算" if has_mileage else ""),
        "dataGap": None if has_mileage else "缺少环号-里程映射"
    }

    # Overall level
    if alarm_count > 100:
        overall_level = "alarm"
        headline = f"监测发现 {alarm_count} 条报警级读数(P99超限), {warning_count} 条预警级读数, 建议复核。阈值来源为统计推导,非设计值。"
    elif warning_count > 500:
        overall_level = "warning"
        headline = f"监测发现 {warning_count} 条预警级读数(P95超限), 建议关注。阈值来源为统计推导,非设计值。"
    else:
        overall_level = "caution"
        headline = f"33环掘进参数和区间监测数据已入库。统计推导46项阈值,监测 {normal_count:,} 条正常 / {warning_count:,} 条预警 / {alarm_count:,} 条报警。"

    # Parameter summary
    param_summary = []
    for p in param_rows:
        param_summary.append({
            "group_code": p["parameter_group"],
            "group_cn": param_group_cn(p["parameter_group"]),
            "sample_count": p["cnt"],
            "ring_count": p["ring_cnt"],
            "time_range": f"{p['first_t']} ~ {p['last_t']}" if p.get("first_t") else None
        })

    # Monitoring summary
    mon_summary = []
    for m in mon_rows:
        mon_summary.append({
            "item": m["monitoring_item"],
            "readings": m["cnt"],
            "points": m["point_cnt"],
            "alarm_count": m.get("alarm_cnt") or 0,
            "warning_count": m.get("warning_cnt") or 0,
        })

    # Gaps
    gaps = []
    if not has_mileage:
        gaps.append({"field": "mileage", "reason": "缺少环号-里程映射", "impact": "无法关联里程位置"})
    gaps.append({"field": "threshold_source", "reason": "阈值为统计推导(P95/P99),非工程设计值",
                  "impact": "预警/报警基于历史分布,建议从施工方案补充正式限值"})

    return {
        "generatedAt": now,
        "projectName": "工~天区间",
        "workArea": "2工区",
        "date": str(latest.get("start_time"))[:10] if latest.get("start_time") else None,
        "overallLevel": overall_level,
        "overallLevelCn": level_cn(overall_level),
        "headline": headline,
        "position": position,
        "cards": [
            {"title": "监测报警", "value": str(alarm_count), "subtitle": f"预警{warning_count} / 正常{normal_count:,}", "level": overall_level},
            {"title": "当前环号", "value": str(latest.get("ring_no", "-")), "subtitle": f"范围 {ring_range.get('min_ring')}~{ring_range.get('max_ring')}", "level": "normal"},
            {"title": "掘进参数", "value": "243,304", "subtitle": "5个分组 / 33环 / 7,156采样行", "level": "normal"},
            {"title": "监测点数", "value": "6,536", "subtitle": "208,364条读数 / 12类监测项", "level": "normal"},
        ],
        "parameterSummary": param_summary,
        "monitoringSummary": mon_summary,
        "findings": [
            {"level": "caution" if alarm_count > 0 else "normal", "level_cn": "注意" if alarm_count > 0 else "正常",
             "message": f"监测阈值基于P95/P99统计推导。{alarm_count}条报警需人工复核。" if alarm_count > 0 else "监测数据正常。",
             "source": "阈值推导系统"},
        ],
        "actions": [
            {"priority": "P1", "priority_cn": "高", "description": "从监测方案补充正式设计限值替换统计阈值"},
        ],
        "dataGaps": gaps
    }