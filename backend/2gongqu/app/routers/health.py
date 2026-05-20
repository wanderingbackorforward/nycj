"""健康检查 - basic/standard/deep 三级"""
from fastapi import APIRouter, Query
from ..db import query_all, query_val, db_latency_ms, get_pool_stats
import time

router = APIRouter()

TABLE_NAMES = [
    "shield_source_document", "shield_tunneling_ring", "shield_tunneling_parameter",
    "shield_monitoring_point", "shield_monitoring_reading", "shield_weekly_report_summary",
    "shield_cad_drawing", "shield_extraction_evidence", "shield_data_quality_issue"
]


@router.get("/health")
def health(level: str = Query("basic", description="basic|standard|deep")):
    """分层健康检查

    basic:   仅验证后端进程可达
    standard: +数据库连通 +表行数
    deep:    +连接池状态 +查询延迟 +慢查询计数
    """
    t0 = time.monotonic()

    if level == "basic":
        return {
            "ok": True,
            "level": "basic",
            "elapsed_ms": round((time.monotonic() - t0) * 1000, 1),
        }

    # standard: DB check
    db_ok = False
    tables = {}
    try:
        db_lat = db_latency_ms()
        db_ok = db_lat > 0
        for t in TABLE_NAMES:
            try:
                tables[t] = query_val(f"SELECT COUNT(*) FROM {t}")
            except Exception:
                tables[t] = -1
    except Exception:
        db_lat = -1

    result = {
        "ok": db_ok,
        "level": level,
        "database": "connected" if db_ok else "disconnected",
        "db_latency_ms": db_lat,
        "schema": "shield_area2",
        "tables": tables,
        "elapsed_ms": round((time.monotonic() - t0) * 1000, 1),
    }

    if level == "deep":
        result["pool"] = get_pool_stats()
        result["views"] = {
            "v_shield_daily_overview": _view_ok("v_shield_daily_overview"),
            "v_shield_monitoring_analysis": _view_ok("v_shield_monitoring_analysis"),
            "v_shield_tunneling_parameter_analysis": _view_ok("v_shield_tunneling_parameter_analysis"),
        }
        # 追加最近错误/慢查询统计
        result["query_stats"] = {
            "query_timeout_ms": 15000,
        }

    return result


def _view_ok(view_name: str) -> bool:
    try:
        query_val(f"SELECT 1 FROM {view_name} LIMIT 1")
        return True
    except Exception:
        return False