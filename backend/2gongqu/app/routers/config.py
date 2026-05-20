"""系统配置 API - 里程、姿态偏差等"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from ..services.mileage_service import get_config as get_mileage, set_config as set_mileage
from ..services.posture_service import get_posture_config, update_posture_config

router = APIRouter()


class MileageConfigRequest(BaseModel):
    starting_ring_no: int = 1717
    starting_mileage_m: float
    starting_chainage: Optional[str] = None
    ring_width_m: float = 1.2
    direction: str = "increasing"
    notes: Optional[str] = None


class PostureConfigRequest(BaseModel):
    design_limit_mm: Optional[float] = None
    warning_limit_mm: Optional[float] = None
    alarm_limit_mm: Optional[float] = None
    direction: str = "both"
    notes: Optional[str] = None


# --- 环号里程 ---
@router.get("/config/ring-mileage")
def get_ring_mileage():
    return get_mileage()

@router.put("/config/ring-mileage")
def update_ring_mileage(body: MileageConfigRequest):
    return set_mileage(
        starting_ring_no=body.starting_ring_no,
        starting_mileage_m=body.starting_mileage_m,
        starting_chainage=body.starting_chainage,
        ring_width_m=body.ring_width_m,
        direction=body.direction,
        notes=body.notes,
    )


# --- 姿态偏差 ---
@router.get("/config/posture-deviation")
def get_posture_deviation():
    """获取姿态偏差配置(含当前P05/P95统计阈值对比)"""
    return get_posture_config()

@router.put("/config/posture-deviation/{deviation_type}")
def update_posture_deviation(deviation_type: str, body: PostureConfigRequest):
    """设置某类姿态偏差的正式设计限值"""
    return update_posture_config(
        deviation_type=deviation_type,
        design_limit_mm=body.design_limit_mm,
        warning_limit_mm=body.warning_limit_mm,
        alarm_limit_mm=body.alarm_limit_mm,
        direction=body.direction,
        notes=body.notes,
    )