from fastapi import APIRouter, Query, Body
from ..services import gaps_service

router = APIRouter(tags=["data-gaps"])


@router.get("/data-gaps")
async def data_gaps():
    """查询当前所有数据缺口的结构化信息。"""
    return await gaps_service.get_data_gaps()


@router.get("/thresholds")
async def get_thresholds():
    """获取已配置的正式预警/报警阈值列表。"""
    return await gaps_service.get_thresholds()


@router.post("/thresholds")
async def upsert_threshold(payload: dict = Body(...)):
    """
    提交或更新监测项目的正式阈值。

    payload 示例:
    {
        "monitoring_item": "竖向位移",
        "monitoring_object": "地表",
        "design_limit": 30.0,
        "warning_threshold": 21.0,
        "alarm_threshold": 30.0,
        "unit": "mm",
        "source": "施工监测方案 v2.0"
    }
    """
    return await gaps_service.upsert_threshold(payload)


@router.get("/manual-review")
async def get_manual_reviews(
    point_code: str = Query("", description="按测点筛选，空则返回最近50条")
):
    """查询人工复核记录。"""
    return await gaps_service.get_manual_reviews(point_code)


@router.post("/manual-review")
async def submit_manual_review(payload: dict = Body(...)):
    """
    提交人工复核结论。

    payload 示例:
    {
        "point_code": "DSW13",
        "review_verdict": "confirmed_anomaly",
        "reviewer": "张工",
        "notes": "现场确认井水位确实异常，非数据录入错误"
    }

    review_verdict 可选值: confirmed_anomaly / data_error / normal / needs_further_check
    """
    return await gaps_service.submit_manual_review(payload)
