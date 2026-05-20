"""GET /api/area2/monitoring/*"""
from fastapi import APIRouter, Query
from ..services.monitoring_service import get_items, get_readings, get_summary

router = APIRouter()

@router.get("/monitoring/items")
async def items():
    return get_items()

@router.get("/monitoring/readings")
async def readings(
    point_code: str = None, item: str = None,
    start_date: str = None, end_date: str = None,
    include_summary: bool = False,
    limit: int = Query(default=500, le=1000)
):
    return get_readings(point_code=point_code, item=item, start_date=start_date, end_date=end_date, include_summary=include_summary, limit=limit)

@router.get("/monitoring/summary")
async def summary():
    return get_summary()
