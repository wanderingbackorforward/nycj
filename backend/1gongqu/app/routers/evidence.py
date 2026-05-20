from fastapi import APIRouter, Query
from ..services import evidence_service

router = APIRouter(tags=["evidence"])

@router.get("/evidence")
async def evidence(
    related_key: str = Query("", description="关联 reading_id"),
    point_code: str = Query("", description="测点编号"),
    reading_id: str = Query("", description="读数 UUID")
):
    items = await evidence_service.get_evidence(related_key, point_code, reading_id)
    if not items:
        return {"evidence": [], "data_gap": {"category": "证据缺失", "description": "未找到对应原始证据记录。"}}
    return {"evidence": items}
