from fastapi import APIRouter
from ..services import data_quality_service

router = APIRouter(tags=["data-quality"])

@router.get("/data-quality/summary")
async def data_quality_summary():
    return await data_quality_service.get_data_quality()
