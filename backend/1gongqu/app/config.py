import os
from dotenv import load_dotenv

load_dotenv()

PGHOST = os.getenv("PGHOST", "127.0.0.1")
PGPORT = int(os.getenv("PGPORT", "5432"))
PGDATABASE = os.getenv("PGDATABASE", "shield_monitor")
PGUSER = os.getenv("PGUSER", "shield_user")
PGPASSWORD = os.getenv("PGPASSWORD", "")

DATABASE_URL = f"host={PGHOST} port={PGPORT} dbname={PGDATABASE} user={PGUSER} password={PGPASSWORD}"

API_PREFIX = "/api/gn"
PROJECT_NAME = "工农路站"
WORK_AREA = "1工区"
CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
DEFAULT_LIMIT = 100
MAX_LIMIT = 1000
