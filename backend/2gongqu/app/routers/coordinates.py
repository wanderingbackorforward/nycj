"""监测点坐标 API"""
from fastapi import APIRouter
from ..services.coordinate_service import get_coordinates

router = APIRouter()


@router.get("/coordinates")
def list_coordinates():
    """查询所有监测点CGCS2000坐标(从日报石桥河坐标sheet提取)"""
    return get_coordinates()