from fastapi import APIRouter, Query
from ..services import evidence_service

router = APIRouter(tags=["source-documents"])

@router.get("/source-documents")
async def source_documents(
    category: str = Query("", description="daily_excel / daily_pdf / weekly_pdf")
):
    return await evidence_service.get_source_documents(category)
