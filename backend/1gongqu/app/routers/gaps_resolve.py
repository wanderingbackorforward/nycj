from fastapi import APIRouter, Body
from ..services import gaps_resolve_service, diagnose_service

router = APIRouter(tags=["gap-resolution"])


@router.post("/thresholds/bootstrap")
async def bootstrap_thresholds():
    """一键自动推导阈值。"""
    return await gaps_resolve_service.bootstrap_thresholds()


@router.get("/diagnose/{point_code}")
async def diagnose_point(point_code: str):
    """通用测点诊断。自动检查跳变、超限、偏离群体等异常。"""
    result = await diagnose_service.diagnose_point(point_code)
    if result is None:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={"error": f"测点 {point_code} 不存在"})
    return result


@router.get("/analyze/sensor-patterns")
async def analyze_sensor_patterns():
    """传感器编号逆向解析。"""
    return await gaps_resolve_service.analyze_sensor_patterns()


@router.get("/points/needing-coords")
async def points_needing_coords():
    """缺少空间坐标的测点清单。"""
    return await gaps_resolve_service.get_points_needing_coords()


@router.post("/points/coordinates")
async def batch_upsert_coords(payload: list = Body(...)):
    """批量更新测点空间坐标。"""
    return await gaps_resolve_service.batch_upsert_coords(payload)
