"""GET /api/area2/tunneling/*"""
from fastapi import APIRouter, Query
from ..services.tunneling_service import get_parameters, get_groups

router = APIRouter()

@router.get("/tunneling/parameters")
async def parameters(
    ring_no: int = None, group: str = None,
    start_time: str = None, end_time: str = None,
    limit: int = Query(default=500, le=1000)
):
    return get_parameters(ring_no=ring_no, group=group, start_time=start_time, end_time=end_time, limit=limit)

@router.get("/tunneling/groups")
async def groups():
    return get_groups()
