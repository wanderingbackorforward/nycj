from .. import db, config
from datetime import datetime

async def get_overview(date: str):
    now = datetime.now().isoformat()

    # Cards
    point_count = await db.fetch_val(
        "SELECT count(DISTINCT point_code) FROM gn_monitoring_reading WHERE measured_at = %s", (date,)
    ) or 0
    reading_count = await db.fetch_val(
        "SELECT count(*) FROM gn_monitoring_reading WHERE measured_at = %s", (date,)
    ) or 0
    exceed_count = await db.fetch_val(
        "SELECT count(*) FROM v_gn_page_default_reading WHERE measured_at = %s AND status_code = 'exceed_design_limit'", (date,)
    ) or 0
    unknown_count = await db.fetch_val(
        "SELECT count(*) FROM gn_monitoring_reading WHERE measured_at = %s AND status_code = 'unknown'", (date,)
    ) or 0

    # Status distribution
    status_rows = await db.fetch(
        "SELECT status_code, status_display_cn, count(*) AS cnt FROM gn_monitoring_reading WHERE measured_at = %s GROUP BY status_code, status_display_cn ORDER BY cnt DESC", (date,)
    )
    status_dist = [{"status_code": r["status_code"], "status_display_cn": r["status_display_cn"], "count": r["cnt"]} for r in status_rows]

    # Overall level
    severe_cnt = await db.fetch_val(
        "SELECT count(*) FROM v_gn_alert_review WHERE measured_at = %s AND review_level = '重点复核'", (date,)
    ) or 0
    if severe_cnt > 0:
        overall_level = "severe_review"
        overall_level_cn = "重点复核"
        headline = f"当日存在 {severe_cnt} 条重点复核记录，建议优先确认。"
    elif exceed_count > 0:
        overall_level = "exceed_design_limit"
        overall_level_cn = "超设计限值"
        headline = f"当日存在 {exceed_count} 条超设计限值记录。"
    elif unknown_count > 0:
        overall_level = "pending_review"
        overall_level_cn = "待确认"
        headline = f"当日 {unknown_count} 条读数因缺少阈值无法自动判断。"
    else:
        overall_level = "normal"
        overall_level_cn = "正常"
        headline = "当日监测数据未见异常。"

    # Priority findings
    findings = []
    top = await db.fetch(
        "SELECT point_code, monitoring_item, ROUND(cumulative_change::numeric,2) AS cum, design_limit, review_level FROM v_gn_alert_review WHERE measured_at = %s AND review_level = '重点复核' ORDER BY ABS(cumulative_change)/NULLIF(design_limit,0) DESC LIMIT 3", (date,)
    )
    for r in top:
        findings.append({"level": "重点复核", "title": f"{r['point_code']} {r['monitoring_item']}", "detail": f"累计变化 {r['cum']}，设计限值 {r['design_limit']}，exceed_ratio 偏高。"})

    # Data gaps
    gaps = []
    if unknown_count > 100:
        gaps.append({"category": "阈值缺失", "description": f"当日 {unknown_count} 条读数因缺少设计限值无法自动判断。", "affected_count": unknown_count})

    # Actions
    actions = []
    if severe_cnt > 0:
        actions.append({"priority": "高", "action": "人工复核重点超标记录", "target": "/monitoring-alerts"})
    if unknown_count > 0:
        actions.append({"priority": "中", "action": "补充设计限值或人工确认 unknown 数据", "target": "/system-status"})

    return {
        "generated_at": now,
        "project_name": config.PROJECT_NAME,
        "work_area": config.WORK_AREA,
        "date": date,
        "overall_level": overall_level,
        "overall_level_cn": overall_level_cn,
        "headline": headline,
        "cards": [
            {"name": "监测点数量", "value": point_count, "unit": "个"},
            {"name": "读数数量", "value": reading_count, "unit": "条"},
            {"name": "超设计限值", "value": exceed_count, "unit": "条"},
            {"name": "待确认", "value": unknown_count, "unit": "条"},
        ],
        "status_distribution": status_dist,
        "priority_findings": findings,
        "actions": actions,
        "data_gaps": gaps,
    }

