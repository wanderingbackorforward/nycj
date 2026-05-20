"""GET /api/area2/diagnosis/*"""
from fastapi import APIRouter, Query
from typing import Optional
from ..services.diagnosis_service import get_operation_diagnosis, get_slurry_grouting_diagnosis

router = APIRouter()

@router.get("/diagnosis/operation")
async def operation(ring_no: Optional[int] = Query(default=None, description="Ring number, defaults to latest")):
    return get_operation_diagnosis(ring_no)

@router.get("/diagnosis/slurry-grouting")
async def slurry_grouting(ring_no: Optional[int] = Query(default=None, description="Ring number, defaults to latest")):
    return get_slurry_grouting_diagnosis(ring_no)