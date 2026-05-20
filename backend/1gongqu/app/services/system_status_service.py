from .. import db, config

async def get_system_status():
    connected = True
    latest = await db.fetch_one("SELECT max(measured_at)::text as latest_date FROM gn_monitoring_reading")

    tables = {}
    for t in ["gn_source_document", "gn_monitoring_point", "gn_monitoring_reading", "gn_pdf_report_summary", "gn_extraction_evidence"]:
        c = await db.fetch_val(f"SELECT count(*) FROM {t}") or 0
        tables[t] = c

    view_status = {}
    for v in ["v_gn_analysis_reading", "v_gn_page_default_reading", "v_gn_manual_review_reading", "v_gn_evidence_reading", "v_gn_alert_review"]:
        try:
            c = await db.fetch_val(f"SELECT count(*) FROM {v}") or 0
            view_status[v] = True
        except:
            view_status[v] = False

    return {
        "database_connected": connected,
        "table_counts": tables,
        "view_status": view_status,
        "latest_import_time": latest["latest_date"] if latest else "",
        "source_file_count": tables.get("gn_source_document", 0),
        "data_completeness": "excel_30d_pdf_17_dwg_1",
        "known_issues": [
            "正式预警/报警阈值缺失，当前仅使用Excel设计限值列",
            "DSW13 地下水位累计变化异常偏高（exceed_ratio 13.6），需人工复核",
            "支撑轴力 daily_max 的 max_sensor_no 未可靠识别",
            "unknown 占比约 64.7%，主要为缺少设计限值",
            "CAD/DWG 中的测点空间坐标尚未提取",
        ],
        "next_actions": [
            "补充正式预警/报警阈值后重新判定状态",
            "人工复核 DSW13 地下水位数据",
            "后续改进parser记录 daily_max 源传感器",
            "对接前端指挥总览和监测异常页面",
        ],
    }
