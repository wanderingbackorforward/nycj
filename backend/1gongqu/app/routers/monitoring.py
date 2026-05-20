from fastapi import APIRouter, Query
from ..services import monitoring_service

router = APIRouter(tags=["monitoring"])

@router.get("/monitoring/items")
async def monitoring_items():
    return await monitoring_service.get_monitoring_items()

@router.get("/monitoring/points")
async def monitoring_points(
    item: str = Query("", description="监测项目筛选"),
    side: str = Query("", description="侧别: 东侧/西侧/不分侧"),
    part: str = Query("", description="部位: 桩顶/立柱/支撑/管线/地表/建筑物/地下水/测斜孔"),
    limit: int = Query(100, ge=1, le=1000, description="返回上限")
):
    return await monitoring_service.get_monitoring_points(item, side, part, limit)

@router.get("/monitoring/readings")
async def monitoring_readings(
    point_code: str = Query("", description="测点编号，为空则返回最新日期全部读数"),
    start_date: str = Query("", description="起始日期，如 2026-04-01"),
    end_date: str = Query("", description="结束日期，如 2026-04-30"),
    limit: int = Query(100, ge=1, le=1000, description="返回上限")
):
    return await monitoring_service.get_readings(point_code, start_date, end_date)

@router.get("/monitoring/alerts")
async def monitoring_alerts(
    date: str = Query("", description="筛选日期"),
    status_code: str = Query("", description="状态筛选"),
    review_level: str = Query("", description="复核等级: 轻微超设计限值/明显超设计限值/重点复核"),
    limit: int = Query(100, ge=1, le=1000)
):
    return await monitoring_service.get_alerts(date, status_code, review_level, limit)

