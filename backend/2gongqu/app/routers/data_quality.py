"""GET /api/area2/data-quality/summary"""
from fastapi import APIRouter
from ..services.data_quality_service import get_summary

router = APIRouter()

@router.get("/data-quality/summary")
async def dq_summary():
    return get_summary()
