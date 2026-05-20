"""GET /api/area2/rings"""
from fastapi import APIRouter, HTTPException
from ..services.ring_service import get_rings, get_ring_detail

router = APIRouter()

@router.get("/rings")
async def rings():
    return get_rings()

@router.get("/rings/{ring_no}")
async def ring_detail(ring_no: int):
    data = get_ring_detail(ring_no)
    if data is None:
        raise HTTPException(status_code=404, detail="环号不存在")
    return data
