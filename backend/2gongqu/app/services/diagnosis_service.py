"""Diagnosis service - shield tunnel construction assessment"""
from ..db import query_all, query_one
from .cn_map import param_group_cn, level_cn

DIAG_PARAM_SQL = """
    SELECT parameter_group, parameter_name, parameter_name_cn, value, unit,
           ring_no, measured_at
    FROM shield_tunneling_parameter
    WHERE ring_no = %s AND value IS NOT NULL
    ORDER BY measured_at
"""

DIAG_MON_SQL = """
    SELECT point_code, monitoring_item, current_value, cumulative_change, measured_at
    FROM shield_monitoring_reading
    WHERE ring_no = %s AND reading_role = 'analysis_primary' LIMIT 200
"""

LATEST_RING_SQL = "SELECT MAX(ring_no) AS r FROM shield_tunneling_ring"

COMPONENTS = [
    {"name": "Advance coordination", "group": "advance", "fields": ["advance speed", "total thrust"],
     "suggestion": "Supply advance speed and thrust control thresholds."},
    {"name": "Cutterhead load", "group": "cutterhead", "fields": ["cutterhead speed", "cutterhead torque"],
     "suggestion": "Supply cutterhead speed and torque design ranges."},
    {"name": "EPB / Slurry balance", "group": "slurry", "fields": ["chamber pressure", "face pressure", "slurry pressure"],
     "suggestion": "Supply chamber/slurry pressure control thresholds."},
    {"name": "Grouting status", "group": "grouting", "fields": ["grouting volume", "grouting pressure"],
     "suggestion": "Supply grouting volume and pressure control standards."},
    {"name": "Posture trend", "group": "posture", "fields": ["horizontal deviation", "vertical deviation", "pitch angle"],
     "suggestion": "Supply posture deviation thresholds."},
]

def _latest_ring():
    row = query_one(LATEST_RING_SQL)
    return row["r"] if row and row["r"] else 1749

def get_operation_diagnosis(ring_no: int = None):
    if ring_no is None:
        ring_no = _latest_ring()
    params = query_all(DIAG_PARAM_SQL, (ring_no,))
    mon = query_all(DIAG_MON_SQL, (ring_no,))
    
    components = []
    for comp in COMPONENTS:
        group_params = [p for p in params if p["parameter_group"] == comp["group"]]
        found_fields = set(p["parameter_name_cn"] for p in group_params)
        missing = [f for f in comp["fields"] if f not in found_fields]
        
        evidence = []
        if group_params:
            for p in group_params[:5]:
                evidence.append(f"{p['parameter_name_cn']}={p['value']}{p.get('unit','')}")
        
        level = "unknown"
        suggestion = comp["suggestion"]
        if missing:
            suggestion += f" Missing fields: {', '.join(missing)}."
        
        components.append({
            "name": comp["name"],
            "level": level,
            "level_cn": level_cn(level),
            "evidence": evidence,
            "suggestion": suggestion
        })
    
    return {
        "score": None,
        "level": "unknown",
        "level_cn": level_cn("unknown"),
        "headline": "Design thresholds missing, basic assessment based on parameter fluctuation and available data.",
        "components": components,
        "trend": [],
        "monitoringResponse": [dict(m) for m in mon[:20]],
        "dataGaps": [
            {"field": "threshold", "reason": "Missing control thresholds for parameter groups", "impact": "Cannot determine normal/abnormal"},
            {"field": "mileage", "reason": "Missing ring-mileage mapping", "impact": "Cannot associate spatial position"}
        ]
    }

def get_slurry_grouting_diagnosis(ring_no: int = None):
    if ring_no is None:
        ring_no = _latest_ring()
    params = query_all(DIAG_PARAM_SQL, (ring_no,))
    slurry_params = [p for p in params if p["parameter_group"] in ("slurry", "grouting")]
    mon = query_all(DIAG_MON_SQL, (ring_no,))
    
    slurry = []
    grouting = []
    for p in slurry_params:
        item = {"name": p["parameter_name_cn"], "value": p["value"], "unit": p.get("unit")}
        if p["parameter_group"] == "slurry":
            slurry.append(item)
        else:
            grouting.append(item)
    
    return {
        "ring_no": ring_no,
        "slurry_params": slurry,
        "grouting_params": grouting,
        "monitoring_response": [dict(m) for m in mon[:10]],
        "data_gaps": [
            "Slurry inflow/outflow data missing",
            "Slurry density data missing",
            "Grouting ratio design standard missing"
        ],
        "suggestion": "Only earth pressure/grouting parameter values available. Supplement slurry circulation data for complete diagnosis."
    }