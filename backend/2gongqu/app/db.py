"""数据库连接管理 - 带超时/重试/健康检查"""
from contextlib import contextmanager
import time
import psycopg2
from psycopg2 import pool, errors
from .config import config

_pool = None
_pool_stats = {"created_at": 0, "total_queries": 0, "total_errors": 0, "slow_queries": 0}

QUERY_TIMEOUT_MS = 15000  # 单查询超时 15s
CONNECT_TIMEOUT = 5       # 连接超时 5s


def get_pool():
    global _pool
    if _pool is None:
        _pool = pool.ThreadedConnectionPool(
            minconn=2, maxconn=10,
            host=config.DB_HOST, port=config.DB_PORT,
            dbname=config.DB_NAME, user=config.DB_USER,
            password=config.DB_PASSWORD,
            connect_timeout=CONNECT_TIMEOUT,
        )
        _pool_stats["created_at"] = time.time()
    return _pool


def get_pool_stats():
    """连接池诊断信息"""
    return {
        "pool_created_seconds_ago": round(time.time() - _pool_stats["created_at"], 0) if _pool_stats["created_at"] else None,
        "total_queries": _pool_stats["total_queries"],
        "total_errors": _pool_stats["total_errors"],
        "slow_queries": _pool_stats["slow_queries"],
        "db_host": config.DB_HOST,
        "db_name": config.DB_NAME,
        "schema": config.DB_SCHEMA,
        "query_timeout_ms": QUERY_TIMEOUT_MS,
    }


@contextmanager
def get_conn():
    p = get_pool()
    conn = p.getconn()
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute(f"SET search_path TO {config.DB_SCHEMA}, public")
            cur.execute(f"SET statement_timeout TO '{QUERY_TIMEOUT_MS}ms'")
        yield conn
    except Exception:
        conn.rollback()
        _pool_stats["total_errors"] += 1
        raise
    else:
        conn.commit()
    finally:
        p.putconn(conn)


@contextmanager
def query(sql, params=None):
    t0 = time.monotonic()
    _pool_stats["total_queries"] += 1
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params or ())
                columns = [desc[0] for desc in cur.description] if cur.description else []
                rows = cur.fetchall() if cur.description else []
                elapsed = (time.monotonic() - t0) * 1000
                if elapsed > 3000:
                    _pool_stats["slow_queries"] += 1
                yield columns, rows
    except errors.QueryCanceled:
        raise Exception(f"查询超时({QUERY_TIMEOUT_MS}ms): {sql[:120]}")
    except Exception:
        raise


def query_all(sql, params=None):
    with query(sql, params) as (cols, rows):
        return [dict(zip(cols, row)) for row in rows]


def query_one(sql, params=None):
    with query(sql, params) as (cols, rows):
        if rows:
            return dict(zip(cols, rows[0]))
        return None


def query_val(sql, params=None):
    with query(sql, params) as (_, rows):
        return rows[0][0] if rows else None


def execute(sql, params=None):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())


def execute_returning(sql, params=None):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            row = cur.fetchone()
            return row[0] if row else None


def db_latency_ms():
    """数据库连通延迟"""
    t0 = time.monotonic()
    try:
        query_val("SELECT 1")
        return round((time.monotonic() - t0) * 1000, 1)
    except Exception:
        return -1