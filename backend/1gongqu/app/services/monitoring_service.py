from .. import db, config

async def get_monitoring_items():
    rows = await db.fetch("""
        SELECT monitoring_item, monitoring_object, count(DISTINCT point_code) AS point_count,
               count(*) AS reading_count, max(measured_at)::text AS latest_date
        FROM v_gn_page_default_reading
        GROUP BY monitoring_item, monitoring_object ORDER BY reading_count DESC
    """)
    items = []
    for r in rows:
        n = await db.fetch_val("SELECT count(*) FROM v_gn_page_default_reading WHERE monitoring_item = %s AND status_code = 'normal'", (r["monitoring_item"],)) or 0
        e = await db.fetch_val("SELECT count(*) FROM v_gn_page_default_reading WHERE monitoring_item = %s AND status_code = 'exceed_design_limit'", (r["monitoring_item"],)) or 0
        u = await db.fetch_val("SELECT count(*) FROM gn_monitoring_reading WHERE monitoring_item = %s AND status_code = 'unknown'", (r["monitoring_item"],)) or 0
        items.append({
            "monitoring_item": r["monitoring_item"],
            "monitoring_object": r["monitoring_object"],
            "point_count": r["point_count"],
            "reading_count": r["reading_count"],
            "normal_count": n,
            "exceed_count": e,
            "unknown_count": u,
            "latest_date": r["latest_date"] or "",
            "status_display_cn": "需复核" if e > 0 else ("待确认" if u > n else "正常"),
        })
    return {"items": items, "total": len(items)}

async def get_monitoring_points(item: str = "", side: str = "", part: str = "", limit: int = 100):
    limit = min(limit, config.MAX_LIMIT)
    where = ["1=1"]
    params = []
    idx = 1
    if item:
        where.append(f"monitoring_item = %s"); params.append(item); idx += 1
    if side:
        where.append(f"side = %s"); params.append(side); idx += 1
    if part:
        where.append(f"part = %s"); params.append(part); idx += 1

    sql = f"""
        SELECT p.point_code, p.point_name, p.monitoring_item, p.monitoring_object, p.side, p.part,
               p.first_seen_date::text, p.last_seen_date::text, p.design_limit, p.parse_confidence
        FROM gn_monitoring_point p
        WHERE {' AND '.join(where)}
        ORDER BY p.point_code LIMIT {limit}
    """
    rows = await db.fetch(sql, tuple(params))
    points = []
    for r in rows:
        latest = await db.fetch_one(
            "SELECT status_code, status_display_cn, current_value, cumulative_change FROM v_gn_page_default_reading WHERE point_code = %s ORDER BY measured_at DESC LIMIT 1",
            (r["point_code"],)
        )
        points.append({
            "point_code": r["point_code"],
            "point_name": r["point_name"] or r["point_code"],
            "monitoring_item": r["monitoring_item"],
            "monitoring_object": r["monitoring_object"],
            "side": r["side"] or "",
            "part": r["part"] or "",
            "first_seen_date": r["first_seen_date"] or "",
            "last_seen_date": r["last_seen_date"] or "",
            "latest_status": latest["status_code"] if latest else "",
            "latest_status_cn": latest["status_display_cn"] if latest else "",
            "latest_value": latest["current_value"] if latest else None,
            "latest_cumulative_change": latest["cumulative_change"] if latest else None,
            "design_limit": r["design_limit"],
            "data_quality_label": r["parse_confidence"] or "",
        })
    return {"points": points, "total": len(points)}

async def get_readings(point_code: str, start_date: str = "", end_date: str = ""):
    where = ["point_code = %s"]
    params = [point_code]
    idx = 2
    if start_date:
        where.append(f"measured_at >= %s"); params.append(start_date); idx += 1
    if end_date:
        where.append(f"measured_at <= %s"); params.append(end_date); idx += 1
    sql = "SELECT * FROM v_gn_page_default_reading WHERE " + " AND ".join(where) + " ORDER BY measured_at"
    rows = await db.fetch(sql, tuple(params))

    readings = []
    dl = None
    item = ""
    unit = ""
    for r in rows:
        dl = dl or r.get("design_limit")
        item = item or (r.get("monitoring_item") or "")
        unit = unit or (r.get("unit") or "")
        readings.append({
            "measured_at": str(r.get("measured_at", "")),
            "current_value": r.get("current_value"),
            "cumulative_change": r.get("cumulative_change"),
            "daily_change": r.get("daily_change"),
            "design_limit": r.get("design_limit"),
            "status_code": r.get("status_code", ""),
            "status_display_cn": r.get("status_display_cn", ""),
            "review_level": r.get("review_level", ""),
            "source_file_name": r.get("source_file_name", ""),
            "source_sheet_name": r.get("source_sheet_name", ""),
            "row_index": r.get("row_index"),
            "evidence_text": r.get("evidence_text", ""),
        })

    return {
        "point_code": point_code,
        "monitoring_item": item,
        "unit": unit,
        "design_limit": dl,
        "readings": readings,
        "chart": {
            "x": "measured_at",
            "y": "cumulative_change",
            "mark_line": "design_limit",
            "interpretation": "累计变化接近或超过设计限值时需要复核。" if dl else "当前无设计限值，无法绘制阈值参考线。",
        },
    }

async def get_alerts(date: str = "", status_code: str = "", review_level: str = "", limit: int = 100):
    limit = min(limit, config.MAX_LIMIT)
    where = ["1=1"]
    params = []
    idx = 1
    if date:
        where.append(f"measured_at = %s"); params.append(date); idx += 1
    if status_code:
        where.append(f"status_code = %s"); params.append(status_code); idx += 1
    if review_level:
        where.append(f"review_level = %s"); params.append(review_level); idx += 1

    sql = f"SELECT * FROM v_gn_alert_review WHERE {' AND '.join(where)} ORDER BY ABS(cumulative_change)/NULLIF(design_limit,0) DESC NULLS LAST LIMIT {limit}"
    rows = await db.fetch(sql, tuple(params))

    alerts = []
    for r in rows:
        er = None
        cc = r.get("cumulative_change")
        dl = r.get("design_limit")
        if cc and dl and dl != 0:
            er = round(abs(cc) / abs(dl), 2)
        rl = r.get("review_level", "")
        sa = ""
        if rl == "重点复核":
            sa = "请优先核对原始表格、单位和设计限值含义。"
        elif r.get("point_code") == "DSW13":
            sa = "该地下水位数据 exceed_ratio 异常偏高，建议人工确认单位和阈值口径。"
        elif r.get("status_code") == "unknown":
            sa = "需补充设计限值后才能判断状态。"
        elif rl:
            sa = f"累计变化超设计限值（{rl}），建议核实。"
        alerts.append({
            "point_code": r.get("point_code", ""),
            "monitoring_item": r.get("monitoring_item", ""),
            "monitoring_object": r.get("monitoring_object", ""),
            "side": r.get("side", ""),
            "part": r.get("part", ""),
            "measured_at": str(r.get("measured_at", "")),
            "current_value": r.get("current_value"),
            "cumulative_change": cc,
            "design_limit": dl,
            "exceed_ratio": er,
            "review_level": rl,
            "source_file_name": r.get("source_file_name", ""),
            "source_sheet_name": r.get("source_sheet_name", ""),
            "row_index": r.get("row_index"),
            "evidence_text": r.get("evidence_text", ""),
            "suggested_action": sa,
        })
    return {"total": len(alerts), "alerts": alerts}



