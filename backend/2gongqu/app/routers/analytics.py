"""阈值与分析 API"""
from fastapi import APIRouter, Query
from ..services.threshold_service import get_all_thresholds, get_thresholds_by_type, get_analytics_overview

router = APIRouter()


@router.get("/thresholds")
def list_thresholds(target_type: str = Query(None, description="monitoring or tunneling_parameter")):
    """查询当前阈值配置"""
    if target_type:
        return {"data": get_thresholds_by_type(target_type), "total": len(get_thresholds_by_type(target_type))}
    data = get_all_thresholds()
    return {"data": data, "total": len(data)}


@router.get("/analytics/overview")
def analytics_overview():
    """智能分析总览 - 含阈值推导后的状态分布、超限统计"""
    return get_analytics_overview()