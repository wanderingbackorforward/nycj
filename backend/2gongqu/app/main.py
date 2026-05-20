"""2工区 后端 API v1.5"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import config
from .middleware.diagnostics import DiagnosticsMiddleware
from .routers import health, overview, rings, tunneling, monitoring, diagnosis, data_quality, evidence, system_status, analytics, config as config_router, risk_source, coordinates

app = FastAPI(title="2工区 盾构施工监控 API", version="1.5.0", docs_url=None, redoc_url=None)
app.add_middleware(DiagnosticsMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["GET","PUT","POST"], allow_headers=["*"])

app.include_router(health.router, prefix=config.API_PREFIX, tags=["健康检查"])
app.include_router(overview.router, prefix=config.API_PREFIX, tags=["指挥总览"])
app.include_router(rings.router, prefix=config.API_PREFIX, tags=["环号"])
app.include_router(tunneling.router, prefix=config.API_PREFIX, tags=["掘进参数"])
app.include_router(monitoring.router, prefix=config.API_PREFIX, tags=["监测数据"])
app.include_router(diagnosis.router, prefix=config.API_PREFIX, tags=["诊断"])
app.include_router(data_quality.router, prefix=config.API_PREFIX, tags=["数据质量"])
app.include_router(evidence.router, prefix=config.API_PREFIX, tags=["文档证据"])
app.include_router(system_status.router, prefix=config.API_PREFIX, tags=["系统状态"])
app.include_router(analytics.router, prefix=config.API_PREFIX, tags=["智能分析"])
app.include_router(config_router.router, prefix=config.API_PREFIX, tags=["系统配置"])
app.include_router(risk_source.router, prefix=config.API_PREFIX, tags=["风险源"])
app.include_router(coordinates.router, prefix=config.API_PREFIX, tags=["监测坐标"])