"""环号里程配置服务"""
from ..db import query_all, query_val, query_one, execute, execute_returning

CONFIG_SQL = """
    SELECT config_id, starting_ring_no, starting_mileage_m, starting_chainage,
           ring_width_m, direction, updated_at, notes
    FROM shield_ring_mileage_config ORDER BY updated_at DESC LIMIT 1
"""

CALC_SQL = "SELECT * FROM fn_calc_ring_mileage()"

UPDATE_CONFIG_SQL = """
    INSERT INTO shield_ring_mileage_config (starting_ring_no, starting_mileage_m, starting_chainage, ring_width_m, direction, notes)
    VALUES (%s, %s, %s, %s, %s, %s)
"""

APPLY_SQL = "SELECT fn_apply_ring_mileage() AS cnt"


def get_config():
    cfg = query_one(CONFIG_SQL)
    rings = query_all(CALC_SQL)

    calculated = []
    for r in rings:
        calculated.append({
            "ring_no": r["ring_no"],
            "chainage": r.get("chainage"),
            "mileage_m": r.get("mileage_m"),
        })

    has_mileage = cfg and cfg.get("starting_mileage_m") is not None

    return {
        "configured": has_mileage,
        "config": {
            "starting_ring_no": cfg.get("starting_ring_no") if cfg else 1717,
            "starting_mileage_m": cfg.get("starting_mileage_m") if cfg else None,
            "starting_chainage": cfg.get("starting_chainage") if cfg else None,
            "ring_width_m": cfg.get("ring_width_m") if cfg else 1.2,
            "direction": cfg.get("direction") if cfg else "increasing",
            "notes": cfg.get("notes") if cfg else None,
        } if cfg else None,
        "rings": calculated,
        "dataGap": None if has_mileage else "缺少起始环里程"
    }


def set_config(starting_ring_no: int, starting_mileage_m: float,
               starting_chainage: str = None, ring_width_m: float = 1.2,
               direction: str = "increasing", notes: str = None):
    execute(UPDATE_CONFIG_SQL, (
        starting_ring_no, starting_mileage_m, starting_chainage,
        ring_width_m, direction, notes
    ))

    applied = query_val(APPLY_SQL)

    return {
        "ok": True,
        "applied_rings": applied,
        "message": f"已设置起始环{starting_ring_no}里程={starting_mileage_m}m,自动推算出{applied}环"
    }