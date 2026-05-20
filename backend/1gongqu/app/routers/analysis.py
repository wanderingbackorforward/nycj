from fastapi import APIRouter, Query
from ..services import analysis_service

router = APIRouter(tags=["analysis"], prefix="/analysis")


@router.get("/trend-acceleration")
async def trend_acceleration(
    monitoring_item: str = Query("", description="监测项目筛选"),
    side: str = Query("", description="东侧/西侧"),
    limit: int = Query(50, ge=1, le=500, description="返回数量上限")
):
    """变化加速度分析：每个测点的近3日速率变化方向和加速度"""
    return await analysis_service.get_trend_acceleration(monitoring_item, side, limit)


@router.get("/threshold-proximity")
async def threshold_proximity(
    date: str = Query("", description="查询日期，如 2026-04-14，默认最新"),
    monitoring_item: str = Query("", description="监测项目筛选"),
    side: str = Query("", description="东侧/西侧"),
    limit: int = Query(50, ge=1, le=500, description="返回数量上限")
):
    """设计限值逼近分析：距限值剩余量 + 按当前速率预测剩余天数"""
    return await analysis_service.get_threshold_proximity(date, monitoring_item, side, limit)


@router.get("/anomaly-detection")
async def anomaly_detection(
    monitoring_item: str = Query("", description="监测项目筛选"),
    side: str = Query("", description="东侧/西侧"),
    sigma: float = Query(2.0, ge=1.0, le=5.0, description="标准差倍数阈值"),
    limit: int = Query(50, ge=1, le=500, description="返回数量上限")
):
    """自身异常检测：当前值偏离自身历史均值超过 sigma 倍标准差"""
    return await analysis_service.get_anomaly_detection(monitoring_item, side, sigma, limit)


@router.get("/cross-correlation")
async def cross_correlation(
    side: str = Query("", description="东侧/西侧筛选")
):
    """跨监测项关联分析：地表沉降vs地下水位、桩顶vs深层位移等"""
    return await analysis_service.get_cross_correlation(side)


@router.get("/early-warning")
async def early_warning(
    date: str = Query("", description="查询日期，默认最新"),
    limit: int = Query(30, ge=1, le=200, description="返回数量上限")
):
    """工程预判预警：综合多信号评分排序（红色/橙色/黄色/蓝色）"""
    return await analysis_service.get_early_warning(date, limit)


@router.get("/zone-heatmap")
async def zone_heatmap(
    date: str = Query("", description="查询日期，默认最新")
):
    """分区态势热力图：按东侧/西侧×部位统计异常程度"""
    return await analysis_service.get_zone_heatmap(date)


@router.get("/daily-briefing")
async def daily_briefing(
    date: str = Query("", description="查询日期，默认最新")
):
    """每日工程研判简报：top恶化点+逼近限值点+分区摘要+一句话建议"""
    return await analysis_service.get_daily_briefing(date)
