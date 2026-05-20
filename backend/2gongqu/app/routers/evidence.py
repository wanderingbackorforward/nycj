"""GET /api/area2/documents, /api/area2/evidence"""
from fastapi import APIRouter, Query
from ..services.evidence_service import get_documents, get_evidence

router = APIRouter()

@router.get("/documents")
async def documents():
    return get_documents()

@router.get("/evidence")
async def evidence(
    related_key: str = None, ring_no: int = None, point_code: str = None,
    limit: int = Query(default=500, le=1000)
):
    return get_evidence(related_key=related_key, ring_no=ring_no, point_code=point_code, limit=limit)
