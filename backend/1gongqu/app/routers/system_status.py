from fastapi import APIRouter
from ..services import system_status_service

router = APIRouter(tags=["system-status"])

@router.get("/system-status")
async def system_status():
    return await system_status_service.get_system_status()
