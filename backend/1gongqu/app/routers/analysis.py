# -*- coding: utf-8 -*-

from fastapi import APIRouter, Query

from ..services import analysis_service, quick_risk_service

router = APIRouter(tags=["analysis"], prefix="/analysis")


@router.get("/quick-risk")
async def quick_risk(
    date: str = Query("", description="Query date, for example 2026-04-14. Empty means latest date."),
    limit: int = Query(8, ge=1, le=50, description="Maximum number of risk records."),
):
    return await quick_risk_service.get_quick_risk(date=date, limit=limit)


@router.get("/trend-acceleration")
async def trend_acceleration(
    monitoring_item: str = Query("", description="Monitoring item filter"),
    side: str = Query("", description="Side filter"),
    limit: int = Query(50, ge=1, le=500, description="Maximum rows"),
):
    return await analysis_service.get_trend_acceleration(monitoring_item, side, limit)


@router.get("/threshold-proximity")
async def threshold_proximity(
    date: str = Query("", description="Query date, for example 2026-04-14. Empty means latest date."),
    monitoring_item: str = Query("", description="Monitoring item filter"),
    side: str = Query("", description="Side filter"),
    limit: int = Query(50, ge=1, le=500, description="Maximum rows"),
):
    return await analysis_service.get_threshold_proximity(date, monitoring_item, side, limit)


@router.get("/anomaly-detection")
async def anomaly_detection(
    monitoring_item: str = Query("", description="Monitoring item filter"),
    side: str = Query("", description="Side filter"),
    sigma: float = Query(2.0, ge=1.0, le=5.0, description="Sigma threshold"),
    limit: int = Query(50, ge=1, le=500, description="Maximum rows"),
):
    return await analysis_service.get_anomaly_detection(monitoring_item, side, sigma, limit)


@router.get("/cross-correlation")
async def cross_correlation(
    side: str = Query("", description="Side filter"),
):
    return await analysis_service.get_cross_correlation(side)


@router.get("/early-warning")
async def early_warning(
    date: str = Query("", description="Query date. Empty means latest date."),
    limit: int = Query(30, ge=1, le=200, description="Maximum rows"),
):
    return await analysis_service.get_early_warning(date, limit)


@router.get("/zone-heatmap")
async def zone_heatmap(
    date: str = Query("", description="Query date. Empty means latest date."),
):
    return await analysis_service.get_zone_heatmap(date)


@router.get("/daily-briefing")
async def daily_briefing(
    date: str = Query("", description="Query date. Empty means latest date."),
):
    return await analysis_service.get_daily_briefing(date)
