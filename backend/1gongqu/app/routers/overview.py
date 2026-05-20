from fastapi import APIRouter, Query
from ..services import overview_service

router = APIRouter(tags=["overview"])

@router.get("/overview")
async def overview(date: str = Query(..., description="查询日期，例如 2026-04-14")):
    return await overview_service.get_overview(date)
