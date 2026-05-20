from .. import db

STATUS_CN_MAP = {
    "normal": "正常",
    "exceed_design_limit": "超设计限值",
    "warning": "预警",
    "alarm": "报警",
    "unknown": "待确认",
    "null": "(空)",
}

UNKNOWN_CN_MAP = {
    "raw_sensor_no_threshold": "原始传感器读数，无阈值",
    "missing_cumulative_change": "缺少累计变化值",
    "missing_design_limit": "缺少设计限值",
    "parsed_low_confidence": "字段识别低置信度",
    "non_numeric_value": "数值无法解析",
    "not_applicable": "不适用",
    "null": "(空)",
}

async def get_data_quality():
    # status_code 分布 — 列名是 reading_count 不是 count
    status = await db.fetch(
        "SELECT status_code, reading_count FROM v_gn_data_quality_summary "
        "WHERE status_code IS NOT NULL AND status_code != 'null' ORDER BY reading_count DESC"
    )
    unknown = await db.fetch(
        "SELECT unknown_reason, reading_count FROM v_gn_data_quality_summary "
        "WHERE unknown_reason IS NOT NULL AND unknown_reason != 'null' ORDER BY reading_count DESC"
    )
    confidence = await db.fetch(
        "SELECT parse_confidence, reading_count FROM v_gn_data_quality_summary "
        "WHERE parse_confidence IS NOT NULL AND parse_confidence != 'null' ORDER BY reading_count DESC"
    )
    role = await db.fetch(
        "SELECT reading_role, reading_count FROM v_gn_data_quality_summary "
        "WHERE reading_role IS NOT NULL AND reading_role != 'null' ORDER BY reading_count DESC"
    )
    review = await db.fetch(
        "SELECT review_level, count(*) AS cnt FROM gn_monitoring_reading "
        "WHERE review_level IS NOT NULL AND review_level != '' GROUP BY review_level ORDER BY cnt DESC"
    )

    ev_total = await db.fetch_val("SELECT count(*) FROM gn_extraction_evidence") or 0
    rd_total = await db.fetch_val("SELECT count(*) FROM gn_monitoring_reading") or 0
    src_total = await db.fetch_val("SELECT count(*) FROM gn_source_document") or 0

    return {
        "status_distribution": [
            {
                "status_code": r["status_code"],
                "status_display_cn": STATUS_CN_MAP.get(r["status_code"], r["status_code"]),
                "count": r["reading_count"]
            }
            for r in status
        ],
        "unknown_reason_distribution": [
            {
                "unknown_reason": r["unknown_reason"],
                "unknown_reason_cn": UNKNOWN_CN_MAP.get(r["unknown_reason"], r["unknown_reason"]),
                "count": r["reading_count"]
            }
            for r in unknown
        ],
        "confidence_distribution": [
            {"parse_confidence": r["parse_confidence"], "count": r["reading_count"]}
            for r in confidence
        ],
        "reading_role_distribution": [
            {"reading_role": r["reading_role"], "count": r["reading_count"]}
            for r in role
        ],
        "review_level_distribution": [
            {"review_level": r["review_level"], "count": r["cnt"]}
            for r in review
        ],
        "evidence_coverage": {
            "evidence_count": ev_total,
            "reading_count": rd_total,
            "coverage_ratio": f"{ev_total / rd_total * 100:.1f}%" if rd_total else "0%",
        },
        "data_gaps": [
            {"category": "阈值缺失", "description": "多数监测项目缺少正式预警/报警阈值，仅使用设计限值。unknown 占比约 64.7%。", "affected_count": 16145},
            {"category": "DSW13", "description": "DSW13 地下水位累计变化异常偏高（exceed_ratio 13.6），需人工确认单位和阈值口径。", "affected_count": 30},
            {"category": "max_sensor_no", "description": "支撑轴力 daily_max 的 max_sensor_no 字段已预留但当前数据未可靠识别。", "affected_count": 398},
            {"category": "空间坐标", "description": "监测点空间坐标未从 DWG/PDF 布置图中提取，暂无法做空间分析。", "affected_count": 0},
        ],
    }
