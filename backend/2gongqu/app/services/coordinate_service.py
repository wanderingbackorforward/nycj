"""监测点坐标服务"""
from ..db import query_all

COORDS_SQL = """
    SELECT coord_id, point_id, coord_system, x_init, y_init,
           x_current, y_current, change_mm, cumulative_mm,
           instrument, source_file, notes
    FROM shield_monitoring_coordinate ORDER BY point_id
"""


def get_coordinates():
    rows = query_all(COORDS_SQL)
    result = []
    for r in rows:
        result.append({
            "coord_id": r["coord_id"],
            "point_id": r["point_id"],
            "coord_system": r.get("coord_system", "CGCS2000"),
            "x_init": r.get("x_init"),
            "y_init": r.get("y_init"),
            "x_current": r.get("x_current"),
            "y_current": r.get("y_current"),
            "change_mm": r.get("change_mm"),
            "cumulative_mm": r.get("cumulative_mm"),
            "instrument": r.get("instrument"),
            "source_file": r.get("source_file"),
            "notes": r.get("notes"),
        })
    return {"data": result, "total": len(result), "coord_system": "CGCS2000"}