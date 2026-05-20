import psycopg
from psycopg.rows import dict_row
from .config import DATABASE_URL

_conn = None

async def get_conn():
    global _conn
    if _conn is not None:
        try:
            async with _conn.cursor() as cur:
                await cur.execute('SELECT 1')
            return _conn
        except Exception:
            try:
                await _conn.close()
            except Exception:
                pass
            _conn = None
    _conn = await psycopg.AsyncConnection.connect(
        DATABASE_URL,
        row_factory=dict_row,
        options='-c tcp_keepalives_idle=60 -c tcp_keepalives_interval=10 -c tcp_keepalives_count=3'
    )
    return _conn

async def _reset_conn():
    global _conn
    if _conn is not None:
        try:
            await _conn.close()
        except Exception:
            pass
    _conn = None

async def fetch(sql: str, params=None):
    for attempt in (1, 2):
        try:
            conn = await get_conn()
            async with conn.cursor() as cur:
                await cur.execute(sql, params)
                return await cur.fetchall()
        except psycopg.OperationalError:
            if attempt == 1:
                await _reset_conn()
                continue
            raise

async def execute(sql: str, params=None):
    conn = await get_conn()
    async with conn.cursor() as cur:
        await cur.execute(sql, params)
    await conn.commit()

async def fetch_one(sql: str, params=None):
    rows = await fetch(sql, params)
    return rows[0] if rows else None

async def fetch_val(sql: str, params=None):
    row = await fetch_one(sql, params)
    return list(row.values())[0] if row else None