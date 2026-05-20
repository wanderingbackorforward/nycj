"""风险源台账服务"""
from ..db import query_all, query_val, query_one

LIST_SQL = """
    SELECT risk_source_id, name, risk_category, risk_level,
           start_mileage_m, end_mileage_m, start_ring_no, end_ring_no,
           control_surface_settlement_mm, control_convergence_mm,
           status, crossing_date_start, crossing_date_end,
           monitoring_requirements, notes
    FROM shield_risk_source ORDER BY
        CASE risk_level WHEN '1' THEN 1 WHEN '2' THEN 2 WHEN '3' THEN 3 WHEN '4' THEN 4 ELSE 5 END,
        COALESCE(start_ring_no, 99999)
"""

DETAIL_SQL = "SELECT * FROM shield_risk_source WHERE risk_source_id = %s"

INSERT_SQL = """
    INSERT INTO shield_risk_source (name, risk_category, risk_level,
        start_mileage_m, end_mileage_m, start_ring_no, end_ring_no,
        control_surface_settlement_mm, control_underground_settlement_mm,
        control_convergence_mm, monitoring_requirements, emergency_measures,
        status, notes, source_document)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    RETURNING risk_source_id
"""

UPDATE_SQL = """
    UPDATE shield_risk_source SET name=%s, risk_category=%s, risk_level=%s,
        start_mileage_m=%s, end_mileage_m=%s, start_ring_no=%s, end_ring_no=%s,
        control_surface_settlement_mm=%s, control_underground_settlement_mm=%s,
        control_convergence_mm=%s, monitoring_requirements=%s, emergency_measures=%s,
        status=%s, notes=%s, updated_at=NOW()
    WHERE risk_source_id=%s
"""

NEAR_RING_SQL = """
    SELECT * FROM shield_risk_source
    WHERE (start_ring_no IS NULL OR start_ring_no <= %s)
      AND (end_ring_no IS NULL OR end_ring_no >= %s)
      AND status IN ('active','monitoring')
    ORDER BY risk_level
"""

RISK_CATEGORY_CN = {
    'building': '建筑物', 'pipeline': '管线', 'existing_tunnel': '既有隧道',
    'bridge': '桥梁', 'river': '河流', 'railway': '铁路',
    'highway': '公路', 'other': '其他'
}
RISK_LEVEL_CN = {'1': '一级', '2': '二级', '3': '三级', '4': '四级'}


def get_risk_sources():
    rows = query_all(LIST_SQL)
    result = []
    for r in rows:
        result.append({
            "risk_source_id": r["risk_source_id"],
            "name": r["name"],
            "risk_category": r.get("risk_category"),
            "risk_category_cn": RISK_CATEGORY_CN.get(r.get("risk_category"), r.get("risk_category")),
            "risk_level": r.get("risk_level"),
            "risk_level_cn": RISK_LEVEL_CN.get(r.get("risk_level"), r.get("risk_level")),
            "mileage_range": f"{r.get('start_mileage_m')} ~ {r.get('end_mileage_m')}" if r.get("start_mileage_m") else None,
            "ring_range": f"{r.get('start_ring_no')} ~ {r.get('end_ring_no')}" if r.get("start_ring_no") else None,
            "control_surface_settlement_mm": r.get("control_surface_settlement_mm"),
            "control_convergence_mm": r.get("control_convergence_mm"),
            "status": r.get("status"),
        })
    return {"data": result, "total": len(result)}


def get_nearby_risks(ring_no: int):
    rows = query_all(NEAR_RING_SQL, (ring_no, ring_no))
    result = []
    for r in rows:
        result.append({
            "risk_source_id": r["risk_source_id"],
            "name": r["name"],
            "risk_category_cn": RISK_CATEGORY_CN.get(r.get("risk_category"), r.get("risk_category")),
            "risk_level_cn": RISK_LEVEL_CN.get(r.get("risk_level"), r.get("risk_level")),
            "control_surface_settlement_mm": r.get("control_surface_settlement_mm"),
            "control_convergence_mm": r.get("control_convergence_mm"),
        })
    return {"ring_no": ring_no, "nearby_risks": result, "count": len(result)}


def create_risk_source(data: dict):
    rid = query_val(INSERT_SQL, (
        data["name"], data.get("risk_category"), data.get("risk_level"),
        data.get("start_mileage_m"), data.get("end_mileage_m"),
        data.get("start_ring_no"), data.get("end_ring_no"),
        data.get("control_surface_settlement_mm"),
        data.get("control_underground_settlement_mm"),
        data.get("control_convergence_mm"),
        data.get("monitoring_requirements"),
        data.get("emergency_measures"),
        data.get("status", "active"),
        data.get("notes"),
        data.get("source_document")
    ))
    return {"ok": True, "risk_source_id": str(rid)}


def update_risk_source(risk_source_id: str, data: dict):
    existing = query_one(DETAIL_SQL, (risk_source_id,))
    if not existing:
        return {"ok": False, "error": "not found"}

    query_val(UPDATE_SQL, (
        data.get("name", existing["name"]),
        data.get("risk_category", existing.get("risk_category")),
        data.get("risk_level", existing.get("risk_level")),
        data.get("start_mileage_m", existing.get("start_mileage_m")),
        data.get("end_mileage_m", existing.get("end_mileage_m")),
        data.get("start_ring_no", existing.get("start_ring_no")),
        data.get("end_ring_no", existing.get("end_ring_no")),
        data.get("control_surface_settlement_mm", existing.get("control_surface_settlement_mm")),
        data.get("control_underground_settlement_mm", existing.get("control_underground_settlement_mm")),
        data.get("control_convergence_mm", existing.get("control_convergence_mm")),
        data.get("monitoring_requirements", existing.get("monitoring_requirements")),
        data.get("emergency_measures", existing.get("emergency_measures")),
        data.get("status", existing.get("status")),
        data.get("notes", existing.get("notes")),
        risk_source_id
    ))
    return {"ok": True, "risk_source_id": risk_source_id}