from fastapi import APIRouter
from ..services import point_analysis_service

router = APIRouter(tags=["point-analysis"])

@router.get("/point-analysis/{point_code}")
async def point_analysis(point_code: str):
    result = await point_analysis_service.get_point_analysis(point_code)
    if not result:
        return {"error": "测点不存在", "point_code": point_code}
    return result
