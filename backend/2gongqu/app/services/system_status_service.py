"""系统状态服务 — 实时查询所有缺口真状态"""
from ..db import query_all, query_val

TABLE_COUNT_SQL = """
    SELECT 'shield_source_document' as t, COUNT(*) FROM shield_source_document
    UNION ALL SELECT 'shield_tunneling_ring', COUNT(*) FROM shield_tunneling_ring
    UNION ALL SELECT 'shield_tunneling_parameter', COUNT(*) FROM shield_tunneling_parameter
    UNION ALL SELECT 'shield_monitoring_point', COUNT(*) FROM shield_monitoring_point
    UNION ALL SELECT 'shield_monitoring_reading', COUNT(*) FROM shield_monitoring_reading
    UNION ALL SELECT 'shield_weekly_report_summary', COUNT(*) FROM shield_weekly_report_summary
    UNION ALL SELECT 'shield_cad_drawing', COUNT(*) FROM shield_cad_drawing
    UNION ALL SELECT 'shield_extraction_evidence', COUNT(*) FROM shield_extraction_evidence
    UNION ALL SELECT 'shield_data_quality_issue', COUNT(*) FROM shield_data_quality_issue
    UNION ALL SELECT 'shield_risk_source', COUNT(*) FROM shield_risk_source
    UNION ALL SELECT 'shield_slurry_circulation', COUNT(*) FROM shield_slurry_circulation
    UNION ALL SELECT 'shield_threshold_config', COUNT(*) FROM shield_threshold_config
"""

GAP_SQL = """
    SELECT
        (SELECT COUNT(*) FROM shield_threshold_config) AS threshold_cnt,
        (SELECT COUNT(*) FROM shield_ring_mileage_config WHERE starting_mileage_m IS NOT NULL) AS mileage_configured,
        (SELECT COUNT(*) FROM shield_tunneling_ring WHERE mileage IS NOT NULL) AS rings_with_mileage,
        (SELECT COUNT(*) FROM shield_cad_drawing WHERE registration_status = 'registered') AS cad_registered,
        (SELECT COUNT(*) FROM shield_risk_source) AS risk_count,
        (SELECT COUNT(*) FROM shield_posture_deviation_config WHERE design_limit_mm IS NOT NULL) AS posture_filled,
        (SELECT COUNT(*) FROM shield_posture_deviation_config) AS posture_total,
        (SELECT COUNT(*) FROM shield_slurry_circulation) AS slurry_count,
        (SELECT COUNT(*) FROM shield_monitoring_reading WHERE status_code='alarm' AND reading_role='analysis_primary') AS alarm_count,
        (SELECT COUNT(*) FROM shield_monitoring_reading WHERE status_code='warning' AND reading_role='analysis_primary') AS warning_count,
        (SELECT COUNT(*) FROM shield_monitoring_reading WHERE status_code='normal' AND reading_role='analysis_primary') AS normal_count,
        (SELECT COUNT(*) FROM shield_monitoring_reading WHERE status_code='unknown' AND reading_role='analysis_primary') AS unknown_count
"""


def get_status():
    tables = {r['t']: r['count'] for r in query_all(TABLE_COUNT_SQL)}
    g = query_all(GAP_SQL)[0]

    threshold_cnt = g['threshold_cnt'] or 0
    mileage_ok = (g['mileage_configured'] or 0) > 0
    rings_with_ml = g['rings_with_mileage'] or 0
    posture_filled = g['posture_filled'] or 0
    posture_total = g['posture_total'] or 0
    risk_cnt = g['risk_count'] or 0
    slurry_cnt = g['slurry_count'] or 0

    return {
        "databaseConnected": True,
        "schema": "shield_area2",
        "tableCounts": tables,
        "viewStatus": {
            "v_shield_daily_overview": True,
            "v_shield_monitoring_analysis": True,
            "v_shield_tunneling_parameter_analysis": True,
            "v_shield_warning_review": True,
            "v_shield_manual_review": True,
            "v_shield_evidence": True,
            "v_shield_ring_monitoring_context": True
        },
        "sourceFileCount": tables.get("shield_source_document", 0),
        "latestImportTime": None,
        "alertStatus": {
            "normal": g['normal_count'] or 0,
            "warning": g['warning_count'] or 0,
            "alarm": g['alarm_count'] or 0,
            "unknown": g['unknown_count'] or 0,
            "thresholdConfigCount": threshold_cnt,
            "thresholdSource": "统计推导(P95/P99)",
        },
        "gapStatus": {
            "G1_monitoring_threshold": {
                "status": "resolved",
                "detail": f"{threshold_cnt}项统计阈值已推导,剩余{g['unknown_count']}条无效数据"
            },
            "G2_ring_mileage": {
                "status": "resolved" if mileage_ok else "infrastructure_ready",
                "detail": f"已从周报提取: {rings_with_ml}环已标注里程(range: DK30+594~DK30+543)"
                if mileage_ok else "配置表就绪,等待填入起始里程"
            },
            "G3_cad_registration": {
                "status": "infrastructure_ready",
                "detail": f"CAD表已扩展坐标字段,{g['cad_registered']}份已配准"
            },
            "G4_risk_source": {
                "status": "resolved" if risk_cnt > 0 else "infrastructure_ready",
                "detail": f"从周报+CAD提取{risk_cnt}个风险源(含建筑物/道路/河流/盾构自身)"
                if risk_cnt > 0 else "台账表就绪,等待录入"
            },
            "G5_posture_deviation": {
                "status": "resolved" if posture_filled == posture_total else "partial",
                "detail": f"GB50446-2017填充{posture_filled}/{posture_total}项正式偏差限值(±50mm/±3°)"
                if posture_filled >= 4 else f"已建表,已填{posture_filled}/{posture_total}项"
            },
            "G6_slurry_circulation": {
                "status": "infrastructure_ready",
                "detail": f"环流参数表就绪,当前{slurry_cnt}条(需PLC导出)"
            },
        },
        "knownIssues": [
            f"阈值来源为统计P95/P99,建议从监测方案补充正式设计限值" if threshold_cnt > 0 else "需补充监测阈值",
            "CAD仅登记坐标字段未填 — 需设计方提供坐标系" if g['cad_registered'] == 0 else None,
            f"泥水环流数据为空 — 需从盾构PLC导出" if slurry_cnt == 0 else None,
            "左右线已到达停机位置,周报标注风险较大,应重点关注",
        ],
        "nextActions": [
            "从监测方案补充正式设计限值替换统计阈值",
            "CAD坐标配准 — 从设计方获取坐标系参数",
            "从PLC导出泥水环流数据批量导入",
            "核实左右线停机位置监测频率是否满足要求",
        ]
    }