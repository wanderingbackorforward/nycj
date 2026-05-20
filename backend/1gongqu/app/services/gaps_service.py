"""
数据缺口与配置服务

提供阈值配置管理、人工复核提交、缺口查询。
"""
from .. import db, config
from datetime import datetime
import uuid


async def get_thresholds():
    rows = await db.fetch(
        "SELECT * FROM gn_formal_threshold ORDER BY monitoring_item, monitoring_object"
    )
    return {
        "generated_at": datetime.now().isoformat(),
        "thresholds": [dict(r) for r in rows],
        "note": "若此表为空，则使用 Excel 设计限值作为唯一判断依据。请通过 POST /api/gn/thresholds 提交正式阈值。"
    }


async def upsert_threshold(payload: dict):
    tid = str(uuid.uuid4())
    now = datetime.now().isoformat()
    sql = (
        "INSERT INTO gn_formal_threshold (id, monitoring_item, monitoring_object, "
        "design_limit, warning_threshold, alarm_threshold, unit, threshold_source, updated_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) "
        "ON CONFLICT (monitoring_item, monitoring_object) "
        "DO UPDATE SET design_limit=EXCLUDED.design_limit, "
        "warning_threshold=EXCLUDED.warning_threshold, "
        "alarm_threshold=EXCLUDED.alarm_threshold, "
        "unit=EXCLUDED.unit, threshold_source=EXCLUDED.threshold_source, "
        "updated_at=EXCLUDED.updated_at"
    )
    await db.execute(sql, (
        tid, payload["monitoring_item"], payload.get("monitoring_object", ""),
        payload.get("design_limit"), payload.get("warning_threshold"),
        payload.get("alarm_threshold"), payload.get("unit", ""),
        payload.get("source", "manual"), now
    ))
    return {"ok": True, "id": tid}


async def get_manual_reviews(point_code: str = ""):
    if point_code:
        rows = await db.fetch(
            "SELECT * FROM gn_manual_review WHERE point_code = %s ORDER BY reviewed_at DESC LIMIT 20",
            (point_code,)
        )
    else:
        rows = await db.fetch(
            "SELECT * FROM gn_manual_review ORDER BY reviewed_at DESC LIMIT 50"
        )
    return {"generated_at": datetime.now().isoformat(), "reviews": [dict(r) for r in rows]}


async def submit_manual_review(payload: dict):
    rid = str(uuid.uuid4())
    now = datetime.now().isoformat()
    await db.execute(
        "INSERT INTO gn_manual_review (id, point_code, reading_id, review_verdict, reviewer, notes, reviewed_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (rid, payload["point_code"], payload.get("reading_id"),
         payload["review_verdict"], payload.get("reviewer", ""),
         payload.get("notes", ""), now)
    )
    if payload["review_verdict"] in ("data_error", "normal"):
        await db.execute(
            "UPDATE gn_monitoring_reading SET review_level = '人工已确认' WHERE point_code = %s",
            (payload["point_code"],)
        )
    return {"ok": True, "id": rid}


async def get_data_gaps():
    now = datetime.now().isoformat()
    threshold_count = await db.fetch_val("SELECT count(*) FROM gn_formal_threshold") or 0
    unknown_total = await db.fetch_val(
        "SELECT count(*) FROM gn_monitoring_reading WHERE status_code = 'unknown'"
    ) or 0
    unknown_by_reason = await db.fetch(
        "SELECT unknown_reason, count(*) AS cnt FROM gn_monitoring_reading "
        "WHERE status_code = 'unknown' GROUP BY unknown_reason ORDER BY cnt DESC"
    )
    dsw13 = await db.fetch_one(
        "SELECT point_code, cumulative_change, design_limit, review_level, measured_at "
        "FROM gn_monitoring_reading WHERE point_code = 'DSW13' ORDER BY measured_at DESC LIMIT 1"
    )
    support_raw = await db.fetch_val(
        "SELECT count(*) FROM gn_monitoring_reading WHERE reading_type = 'raw_sensor'"
    ) or 0
    support_daily_max = await db.fetch_val(
        "SELECT count(*) FROM gn_monitoring_reading WHERE reading_type = 'daily_max'"
    ) or 0
    max_sensor_filled = await db.fetch_val(
        "SELECT count(*) FROM gn_monitoring_reading WHERE reading_type = 'daily_max' AND max_sensor_no IS NOT NULL"
    ) or 0
    cad_files = await db.fetch("SELECT file_name FROM gn_source_document WHERE file_ext = 'dwg'")

    return {
        "generated_at": now,
        "project_name": config.PROJECT_NAME,
        "work_area": config.WORK_AREA,
        "gaps": [
            {
                "id": "gap-01",
                "title": "正式预警/报警阈值缺失",
                "priority": "P1",
                "description": "后端当前仅使用 Excel 中的设计限值列做判断，没有正式的预警值和报警值。",
                "impact": f"{unknown_total} 条数据状态为待确认，无法自动分级。",
                "backend_capability": "已提供 POST /api/gn/thresholds 接口，监测方可提交正式阈值后系统自动重判。",
                "thresholds_configured": threshold_count,
                "unknown_distribution": [{"reason": r["unknown_reason"], "count": r["cnt"]} for r in unknown_by_reason],
                "required_from": "监测单位 / 施工方技术负责人",
                "resolution": "从施工监测方案中提取每个监测项目的设计限值、预警值（通常限值70-80%）、报警值（通常限值100%），通过 API 提交。"
            },
            {
                "id": "gap-02",
                "title": "DSW13 地下水位数据待人工复核",
                "priority": "P1",
                "description": "累计变化 exceed_ratio 严重偏高，系统标记为重点复核但无法判断是真实异常还是数据问题。",
                "dsw13_status": {
                    "latest_cumulative_change": float(dsw13["cumulative_change"]) if dsw13 else None,
                    "design_limit": float(dsw13["design_limit"]) if dsw13 else None,
                    "review_level": dsw13["review_level"] if dsw13 else "unknown",
                    "latest_date": str(dsw13["measured_at"]) if dsw13 else "unknown"
                },
                "backend_capability": "已提供 POST /api/gn/manual-review 接口，现场工程师可提交复核结论。",
                "required_from": "现场监测工程师"
            },
            {
                "id": "gap-03",
                "title": "支撑轴力传感器编号识别不稳定",
                "priority": "P2",
                "description": f"共 {support_daily_max} 条 daily_max 记录中，{max_sensor_filled} 条可识别 max_sensor_no。",
                "backend_capability": f"{support_raw} 条原始传感器读数已作为 raw_sensor 证据保留，可逐条溯源到 Excel 行列。",
                "required_from": "监测数据录入方"
            },
            {
                "id": "gap-04",
                "title": "CAD 测点空间坐标未提取",
                "priority": "P2",
                "description": f"已有 {len(cad_files)} 份 DWG 文件登记，但测点空间坐标未从中提取。",
                "backend_capability": "gn_monitoring_point 表已预留坐标字段，后续填入即可启用空间查询。",
                "required_from": "设计方 / BIM 工程师"
            },
        ],
        "summary": {
            "p1_count": 2, "p2_count": 2, "total_gaps": 4,
            "resolvable_by_backend": 2, "needs_human_input": 4
        }
    }
