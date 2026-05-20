"""
工农路站 1工区 Backend API v1
FastAPI 应用入口, 注册所有 router。
"""
import sys, os, asyncio, selectors

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .config import CORS_ORIGINS, API_PREFIX, PROJECT_NAME, WORK_AREA
from .routers import (
    health, overview, monitoring, point_analysis,
    data_quality, source_documents, evidence, system_status,
    analysis, gaps, gaps_resolve,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(
    title=f"{PROJECT_NAME} {WORK_AREA} Backend API v1",
    description="工农路站主体基坑施工监测数据后端服务",
    version="1.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix=API_PREFIX)
app.include_router(overview.router, prefix=API_PREFIX)
app.include_router(monitoring.router, prefix=API_PREFIX)
app.include_router(point_analysis.router, prefix=API_PREFIX)
app.include_router(data_quality.router, prefix=API_PREFIX)
app.include_router(source_documents.router, prefix=API_PREFIX)
app.include_router(evidence.router, prefix=API_PREFIX)
app.include_router(gaps.router, prefix=API_PREFIX)
app.include_router(gaps_resolve.router, prefix=API_PREFIX)
app.include_router(analysis.router, prefix=API_PREFIX)
app.include_router(system_status.router, prefix=API_PREFIX)