"""数据质量服务 — 反映智能阈值推导后的真实数据质量"""
from ..db import query_all, query_val

STATUS_SQL = "SELECT status_code, COUNT(*) FROM shield_monitoring_reading GROUP BY status_code"
REASON_SQL = "SELECT unknown_reason, COUNT(*) FROM shield_monitoring_reading WHERE unknown_reason IS NOT NULL GROUP BY unknown_reason"
CONF_SQL = "SELECT parse_confidence, COUNT(*) FROM shield_monitoring_reading GROUP BY parse_confidence"
ROLE_SQL = "SELECT reading_role, COUNT(*) FROM shield_monitoring_reading GROUP BY reading_role"
EVID_COV_SQL = "SELECT related_table, COUNT(*) FROM shield_extraction_evidence GROUP BY related_table"
CAD_SQL = "SELECT parse_status, COUNT(*) FROM shield_cad_drawing GROUP BY parse_status"
THRESHOLD_SQL = "SELECT COUNT(*) FROM shield_threshold_config"


def get_summary():
    status_dist = {r['status_code']: r['count'] for r in query_all(STATUS_SQL)}
    reason_dist = {r['unknown_reason'] or "null": r['count'] for r in query_all(REASON_SQL)}
    conf_dist = {r['parse_confidence']: r['count'] for r in query_all(CONF_SQL)}
    role_dist = {r['reading_role']: r['count'] for r in query_all(ROLE_SQL)}
    evid_dist = {r['related_table']: r['count'] for r in query_all(EVID_COV_SQL)}
    cad_dist = {r['parse_status']: r['count'] for r in query_all(CAD_SQL)}
    threshold_count = query_val(THRESHOLD_SQL) or 0

    cad_status = cad_dist.get("registered", 0)
    cad_total = sum(cad_dist.values())

    normal = status_dist.get('normal', 0)
    warning = status_dist.get('warning', 0)
    alarm = status_dist.get('alarm', 0)
    unknown = status_dist.get('unknown', 0)
    total = sum(status_dist.values())

    return {
        "status_code_dist": status_dist,
        "unknown_reason_dist": reason_dist,
        "parse_confidence_dist": conf_dist,
        "reading_role_dist": role_dist,
        "evidence_coverage": evid_dist,
        "cad_status": "registered" if cad_status == cad_total else "partial",
        "cad_status_cn": "仅登记" if cad_status == cad_total else "部分处理",
        "thresholdConfigCount": threshold_count,
        "thresholdDerivationMethod": "percentile_p95_p99",
        "thresholdConfidence": "medium (统计推导, 非设计值)",
        "alertCoverageRate": round((normal + warning + alarm) / total * 100, 1) if total > 0 else 0,
        "dataGaps": [
            {"field": "threshold_source", "reason": "当前阈值为统计推导(P95/P99)，非工程设计值",
             "impact": "预警/报警基于历史数据分布，建议从设计方案/规范补充正式限值",
             "status": "部分解决 — 已推导12项监测+34项掘进参数阈值"},
            {"field": "mileage", "reason": "缺少环号-里程映射",
             "impact": "无法将监测点按里程关联到具体环号，无法做位置相关的监测响应分析",
             "status": "P1 — 需从盾构导向系统/测量工程师获取"},
            {"field": "cad_geo", "reason": "CAD图纸仅登记元信息，未空间配准",
             "impact": "无法在图纸上叠加监测点、无法进行风险源空间分析",
             "status": "P2 — 需设计方/BIM团队提供坐标参考系"},
            {"field": "risk_source", "reason": "缺少区间风险源台账",
             "impact": "无法判断当前盾构位置是否接近风险源",
             "status": "P3 — 需项目安质部提供风险源清单"},
            {"field": "posture_deviation", "reason": "缺少正式姿态偏差限值",
             "impact": "姿态数据仅能展示趋势和统计超限，无法标注正式偏差过大",
             "status": "P2 — 当前已有 P05/P95 统计阈值可用"},
            {"field": "slurry_circulation", "reason": "缺少泥水环流参数（进出泥流量/密度差）",
             "impact": "无法评估泥水平衡状态",
             "status": "P2 — 需从盾构PLC导出环流参数"},
        ],
        "nextActions": [
            {"priority": "P1", "priority_cn": "高",
             "description": "从监测方案/施工方案提取每类监测项的设计限值、预警值、报警值，替换当前统计阈值"},
            {"priority": "P1", "priority_cn": "高",
             "description": "补充环号-里程对应表（1717环~1749环 → DK里程）"},
            {"priority": "P2", "priority_cn": "中",
             "description": "CAD图纸空间配准（转换为可查询坐标系，导出为GeoJSON）"},
            {"priority": "P2", "priority_cn": "中",
             "description": "补充盾构姿态允许偏差值（切口/盾尾水平偏差和垂直偏差限值）"},
            {"priority": "P2", "priority_cn": "中",
             "description": "从盾构PLC导出泥水环流相关参数（进出泥流量、密度差等）"},
            {"priority": "P3", "priority_cn": "低",
             "description": "补充区间风险源清单（名称、里程范围、风险等级、控制指标）"},
        ]
    }