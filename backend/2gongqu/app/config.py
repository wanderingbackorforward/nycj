"""2工区 后端配置 - 所有敏感信息通过环境变量读取"""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")
except ImportError:
    pass

class Config:
    DB_HOST = os.getenv("PGHOST", "127.0.0.1")
    DB_PORT = int(os.getenv("PGPORT", "5432"))
    DB_NAME = os.getenv("PGDATABASE", "shield_monitor")
    DB_USER = os.getenv("PGUSER", "shield_user")
    DB_PASSWORD = os.getenv("PGPASSWORD", "")
    DB_SCHEMA = os.getenv("PGSCHEMA", "shield_area2")
    API_PREFIX = "/api/area2"
    # 允许前端开发端口 + 生产环境
    CORS_ORIGINS = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    MAX_LIMIT = 1000

config = Config()