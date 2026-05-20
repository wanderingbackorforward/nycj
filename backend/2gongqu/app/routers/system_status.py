"""GET /api/area2/system-status"""
from fastapi import APIRouter
from ..services.system_status_service import get_status

router = APIRouter()

@router.get("/system-status")
async def system_status():
    return get_status()
