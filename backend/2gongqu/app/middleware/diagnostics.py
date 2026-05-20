"""诊断中间件 - 请求计时 + 统一错误 + 健康分级"""
import time
import traceback
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class DiagnosticsMiddleware(BaseHTTPMiddleware):
    """为每个请求注入 X-Response-Time，捕获未处理异常"""

    async def dispatch(self, request: Request, call_next):
        start = time.monotonic()
        try:
            response = await call_next(request)
            elapsed = (time.monotonic() - start) * 1000
            response.headers["X-Response-Time-Ms"] = f"{elapsed:.1f}"
            # 慢查询告警头
            if elapsed > 3000:
                response.headers["X-Slow-Query"] = "1"
            if elapsed > 10000:
                response.headers["X-Very-Slow"] = "1"
            return response
        except Exception as exc:
            elapsed = (time.monotonic() - start) * 1000
            return JSONResponse(
                status_code=500,
                content={
                    "ok": False,
                    "error": "internal_error",
                    "message": str(exc)[:500],
                    "elapsed_ms": round(elapsed, 1),
                    "endpoint": str(request.url.path),
                },
                headers={"X-Response-Time-Ms": f"{elapsed:.1f}", "X-Error": "1"}
            )