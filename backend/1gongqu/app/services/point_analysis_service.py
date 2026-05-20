from .. import db

async def get_point_analysis(point_code: str):
    point = await db.fetch_one("SELECT * FROM gn_monitoring_point WHERE point_code = %s", (point_code,))
    if not point:
        return None

    # 趋势数据：直接查原始表，不做 view 过滤，确保全量透出
    trend_rows = await db.fetch(
        """
        SELECT measured_at, current_value, cumulative_change, daily_change,
               design_limit, status_code, status_display_cn, review_level,
               source_file_name, source_sheet_name, row_index,
               reading_role, reading_type, data_quality
        FROM gn_monitoring_reading
        WHERE point_code = %s
        ORDER BY measured_at
        """,
        (point_code,)
    )

    evidence = await db.fetch(
        """
        SELECT e.* FROM gn_extraction_evidence e
        JOIN gn_monitoring_reading r ON e.related_key = r.reading_id::text
        WHERE r.point_code = %s ORDER BY r.measured_at DESC LIMIT 10
        """,
        (point_code,)
    )

    trend_data = []
    has_exceed = False
    has_severe = False
    all_unknown = True
    for t in trend_rows:
        if t.get("status_code") == "exceed_design_limit":
            has_exceed = True
        if t.get("review_level") == "重点复核":
            has_severe = True
        if t.get("status_code") != "unknown":
            all_unknown = False
        trend_data.append({
            "date": str(t.get("measured_at", "")),
            "current_value": t.get("current_value"),
            "cumulative_change": t.get("cumulative_change"),
            "daily_change": t.get("daily_change"),
            "design_limit": t.get("design_limit"),
            "status_code": t.get("status_code"),
            "status_display_cn": t.get("status_display_cn", ""),
            "review_level": t.get("review_level"),
            "reading_role": t.get("reading_role"),
            "source": f"{t.get('source_file_name','')}/{t.get('source_sheet_name','')} row {t.get('row_index','')}"
        })

    findings = []
    if has_severe:
        findings.append({"level": "重点复核", "detail": "该测点存在重点复核记录，需人工审核原始数据。"})
    elif has_exceed:
        findings.append({"level": "超设计限值", "detail": "累计变化超设计限值，不等于正式报警，建议复核。"})
    if all_unknown and len(trend_rows) > 0:
        findings.append({"level": "缺少阈值", "detail": "该测点读数因缺少设计限值无法自动判断状态。"})

    # 区分数据角色统计
    roles = {}
    for t in trend_rows:
        r = t.get("reading_role", "unknown")
        roles[r] = roles.get(r, 0) + 1

    return {
        "point": {
            "point_code": point.get("point_code"),
            "point_name": point.get("point_name"),
            "monitoring_item": point.get("monitoring_item"),
            "monitoring_object": point.get("monitoring_object"),
            "side": point.get("side", ""),
            "part": point.get("part", ""),
            "design_limit": point.get("design_limit"),
            "unit": point.get("unit", ""),
            "first_seen": str(point.get("first_seen_date", "")),
            "last_seen": str(point.get("last_seen_date", "")),
        },
        "latest": trend_data[-1] if trend_data else {},
        "trend": trend_data,
        "trend_count": len(trend_data),
        "reading_roles": roles,
        "evidence": [{
            "evidence_id": e.get("evidence_id"),
            "file_name": e.get("file_name"),
            "sheet_name": e.get("sheet_name"),
            "page_no": e.get("page_no"),
            "row_index": e.get("row_index"),
            "extraction_method": e.get("extraction_method"),
            "confidence": e.get("confidence"),
        } for e in evidence[:10]],
        "findings": findings,
        "actions": [
            {"action": "查看源 Excel 核对原始行数据", "detail": f"该测点共 {len(trend_data)} 条记录，{len(evidence)} 条证据"}
        ],
        "data_gaps": [{"category": "阈值缺失", "description": "缺少正式预警/报警阈值"}] if all_unknown else [],
    }
