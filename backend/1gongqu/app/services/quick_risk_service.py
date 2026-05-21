
# -*- coding: utf-8 -*-

from datetime import datetime
from typing import Any

from .. import db


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except:
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except:
        return default


def _priority_code(ratio: float, count: int = 0) -> str:
    if ratio >= 1.5 or count >= 10:
        return "high"
    if ratio >= 1.0 or count >= 3:
        return "medium"
    return "low"


def _state_code(suspected: int, pending: int) -> str:
    if suspected > 0:
        return "review_required"
    if pending > 0:
        return "attention"
    return "normal"


async def _resolve_date(date: str) -> str:
    if date:
        return date

    latest = await db.fetch_val(
        'SELECT MAX("date")::text FROM public.vw_risk_overview'
    )

    return latest or ""


async def _fetch_kpis(date: str):
    row = await db.fetch_one(
        """
        SELECT
            COUNT(*)::int AS readings,
            COUNT(DISTINCT point_code)::int AS monitoring_points,
            COUNT(*) FILTER (
                WHERE is_suspected_exceed IS TRUE
            )::int AS suspected_exceed,
            COUNT(*) FILTER (
                WHERE is_pending_confirm IS TRUE
            )::int AS pending_confirm
        FROM public.vw_risk_overview
        WHERE "date"::text = %s
        """,
        (date,),
    )

    if not row:
        return {
            "suspected_exceed": 0,
            "pending_confirm": 0,
            "monitoring_points": 0,
            "readings": 0,
        }

    return {
        "suspected_exceed": _safe_int(row.get("suspected_exceed")),
        "pending_confirm": _safe_int(row.get("pending_confirm")),
        "monitoring_points": _safe_int(row.get("monitoring_points")),
        "readings": _safe_int(row.get("readings")),
    }


async def _fetch_group_heatmap(date: str):
    rows = await db.fetch(
        """
        SELECT
            COALESCE(NULLIF(side, ''), '未分侧') AS side,
            COALESCE(NULLIF(part, ''), '未分组') AS part,
            COUNT(*)::int AS suspected_exceed,
            COUNT(DISTINCT point_code)::int AS points,
            MAX(exceed_ratio) AS max_ratio
        FROM public.vw_risk_overview
        WHERE "date"::text = %s
          AND is_suspected_exceed IS TRUE
        GROUP BY 1, 2
        ORDER BY suspected_exceed DESC, max_ratio DESC NULLS LAST
        LIMIT 12
        """,
        (date,),
    )

    return [
        {
            "side": r.get("side"),
            "part": r.get("part"),
            "suspected_exceed": _safe_int(r.get("suspected_exceed")),
            "points": _safe_int(r.get("points")),
            "max_ratio": round(_safe_float(r.get("max_ratio")), 4),
            "level_code": _priority_code(
                _safe_float(r.get("max_ratio")),
                _safe_int(r.get("suspected_exceed")),
            ),
        }
        for r in rows
    ]


async def _fetch_risk_types(date: str):
    rows = await db.fetch(
        """
        WITH ranked AS (
            SELECT
                monitoring_item,
                point_code,
                exceed_ratio,
                ROW_NUMBER() OVER (
                    PARTITION BY monitoring_item
                    ORDER BY exceed_ratio DESC NULLS LAST
                ) AS rn
            FROM public.vw_risk_overview
            WHERE "date"::text = %s
              AND is_suspected_exceed IS TRUE
        ),
        grouped AS (
            SELECT
                monitoring_item,
                COUNT(*)::int AS suspected_exceed,
                COUNT(DISTINCT point_code)::int AS points,
                MAX(exceed_ratio) AS max_ratio
            FROM public.vw_risk_overview
            WHERE "date"::text = %s
              AND is_suspected_exceed IS TRUE
            GROUP BY monitoring_item
        )
        SELECT
            g.monitoring_item,
            g.suspected_exceed,
            g.points,
            g.max_ratio,
            r.point_code AS representative_point
        FROM grouped g
        LEFT JOIN ranked r
          ON r.monitoring_item = g.monitoring_item
         AND r.rn = 1
        ORDER BY g.suspected_exceed DESC, g.max_ratio DESC NULLS LAST
        LIMIT 8
        """,
        (date, date),
    )

    return [
        {
            "monitoring_item": r.get("monitoring_item"),
            "suspected_exceed": _safe_int(r.get("suspected_exceed")),
            "points": _safe_int(r.get("points")),
            "max_ratio": round(_safe_float(r.get("max_ratio")), 4),
            "representative_point": r.get("representative_point"),
            "level_code": _priority_code(
                _safe_float(r.get("max_ratio")),
                _safe_int(r.get("suspected_exceed")),
            ),
        }
        for r in rows
    ]


async def get_quick_risk(date: str = "", limit: int = 8):
    date = await _resolve_date(date)

    kpis = await _fetch_kpis(date)

    rows = await db.fetch(
        """
        SELECT
            point_code,
            monitoring_item,
            monitoring_object,
            side,
            part,
            exceed_ratio
        FROM public.vw_risk_overview
        WHERE "date"::text = %s
          AND is_suspected_exceed IS TRUE
        ORDER BY exceed_ratio DESC NULLS LAST
        LIMIT %s
        """,
        (date, limit),
    )

    risk_records = []

    for row in rows:
        ratio = _safe_float(row.get("exceed_ratio"))

        risk_records.append(
            {
                "priority_code": _priority_code(ratio),
                "label_code": "suspected_exceed",
                "point_code": row.get("point_code"),
                "monitoring_item": row.get("monitoring_item"),
                "monitoring_object": row.get("monitoring_object"),
                "side": row.get("side"),
                "part": row.get("part"),
                "metric": f"{ratio:.2f}x",
                "ratio": round(ratio, 4),
                "reason_code": "design_limit_exceeded",
            }
        )

    return {
        "generated_at": datetime.now().isoformat(),
        "date": date,
        "state_code": _state_code(
            kpis["suspected_exceed"],
            kpis["pending_confirm"],
        ),
        "kpis": kpis,
        "risk_records": risk_records,
        "group_heatmap": await _fetch_group_heatmap(date),
        "risk_types": await _fetch_risk_types(date),
        "data_notes": [
            {"note_code": "unified_view"},
            {"note_code": "design_limit"},
            {"note_code": "group_heatmap"},
        ],
    }
