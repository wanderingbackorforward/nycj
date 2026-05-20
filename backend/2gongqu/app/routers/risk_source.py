"""风险源 API"""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional
from ..services.risk_source_service import (
    get_risk_sources, get_nearby_risks, create_risk_source, update_risk_source
)

router = APIRouter()


class RiskSourceCreate(BaseModel):
    name: str
    risk_category: Optional[str] = None
    risk_level: Optional[str] = None
    start_mileage_m: Optional[float] = None
    end_mileage_m: Optional[float] = None
    start_ring_no: Optional[int] = None
    end_ring_no: Optional[int] = None
    control_surface_settlement_mm: Optional[float] = None
    control_underground_settlement_mm: Optional[float] = None
    control_convergence_mm: Optional[float] = None
    monitoring_requirements: Optional[str] = None
    emergency_measures: Optional[str] = None
    status: str = "active"
    notes: Optional[str] = None
    source_document: Optional[str] = None


class RiskSourceUpdate(BaseModel):
    name: Optional[str] = None
    risk_category: Optional[str] = None
    risk_level: Optional[str] = None
    start_mileage_m: Optional[float] = None
    end_mileage_m: Optional[float] = None
    start_ring_no: Optional[int] = None
    end_ring_no: Optional[int] = None
    control_surface_settlement_mm: Optional[float] = None
    control_underground_settlement_mm: Optional[float] = None
    control_convergence_mm: Optional[float] = None
    monitoring_requirements: Optional[str] = None
    emergency_measures: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


@router.get("/risk-sources")
def list_risk_sources():
    """风险源台账列表"""
    return get_risk_sources()


@router.get("/risk-sources/nearby")
def nearby_risks(ring_no: int = Query(..., description="当前环号")):
    """查询某环附近的活跃风险源"""
    return get_nearby_risks(ring_no)


@router.post("/risk-sources")
def add_risk_source(body: RiskSourceCreate):
    """新增风险源"""
    return create_risk_source(body.model_dump(exclude_none=True))


@router.put("/risk-sources/{risk_source_id}")
def edit_risk_source(risk_source_id: str, body: RiskSourceUpdate):
    """更新风险源"""
    return update_risk_source(risk_source_id, body.model_dump(exclude_none=True))