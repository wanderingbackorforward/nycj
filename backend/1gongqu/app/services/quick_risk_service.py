# -*- coding: utf-8 -*-

from datetime import datetime
from typing import Any

from .. import db


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _priority_from_ratio(ratio: float, count: int = 0) -> str:
    if ratio >= 1.5 or count >= 10:
        return "高"
    if ratio >= 1.0 or count >= 3:
        return "中"
    return "低"


def _state_from_kpis(suspected_exceed: int, pending_confirm: int) -> str:
    if suspected_exceed > 0:
        return "需复核"
    if pending_confirm > 0:
        return "关注"
    return "正常"


def _build_title(suspected_exceed: int, pending_confirm: int) -> str:
    if suspected_exceed > 0:
        return f"今日有 {suspected_exceed} 条疑似超限记录需要复核"
    if pending_confirm > 0:
        return f"今日有 {pending_confirm} 条待确认数据需要处理"
    return "今日未发现明显整体风险"


async def _resolve_date(date: str) -> str:
    if date:
        return date

    latest = await db.fetch_val(
        """
        SELECT MAX("date")::text
        FROM public.vw_risk_overview
        """
    )

    return latest or ""


async def _fetch_kpis(date: str) -> dict[str, int]:
    row = await db.fetch_one(
        """
        SELECT
            COUNT(*)::int AS readings,
            COUNT(DISTINCT point_code)::int AS monitoring_points,
            COUNT(*) FILTER (WHERE is_suspected_exceed IS TRUE)::int AS suspected_exceed,
            COUNT(*) FILTER (WHERE is_pending_confirm IS TRUE)::int AS pending_confirm
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


async def _fetch_risk_records(date: str, limit: int) -> list[dict[str, Any]]:
    rows = await db.fetch(
        """
        SELECT
            point_code,
            monitoring_item,
            monitoring_object,
            side,
            part,
            cumulative_change,
            design_limit,
            exceed_ratio
        FROM public.vw_risk_overview
        WHERE "date"::text = %s
          AND is_suspected_exceed IS TRUE
        ORDER BY
            exceed_ratio DESC NULLS LAST,
            ABS(COALESCE(cumulative_change, 0)) DESC NULLS LAST
        LIMIT %s
        """,
        (date, limit),
    )

    records: list[dict[str, Any]] = []

    for row in rows:
        ratio = _safe_float(row.get("exceed_ratio"))
        records.append(
            {
                "priority": _priority_from_ratio(ratio),
                "label": "疑似超限",
                "point_code": row.get("point_code"),
                "monitoring_item": row.get("monitoring_item") or "未知监测项",
                "monitoring_object": row.get("monitoring_object") or "未知对象",
                "side": row.get("side") or "未分侧",
                "part": row.get("part") or "未分组",
                "metric": f"{ratio:.2f}x",
                "ratio": round(ratio, 4),
                "reason": "超过设计限值，需复核是否形成正式预警",
            }
        )

    return records


async def _fetch_group_heatmap(date: str) -> list[dict[str, Any]]:
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
        GROUP BY
            COALESCE(NULLIF(side, ''), '未分侧'),
            COALESCE(NULLIF(part, ''), '未分组')
        ORDER BY
            suspected_exceed DESC,
            max_ratio DESC NULLS LAST
        LIMIT 12
        """,
        (date,),
    )

    items: list[dict[str, Any]] = []

    for row in rows:
        count = _safe_int(row.get("suspected_exceed"))
        max_ratio = _safe_float(row.get("max_ratio"))
        side = row.get("side") or "未分侧"
        part = row.get("part") or "未分组"

        items.append(
            {
                "group": f"{side} · {part}",
                "side": side,
                "part": part,
                "suspected_exceed": count,
                "points": _safe_int(row.get("points")),
                "max_ratio": round(max_ratio, 4),
                "level": _priority_from_ratio(max_ratio, count),
            }
        )

    return items


async def _fetch_risk_types(date: str) -> list[dict[str, Any]]:
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
        ORDER BY
            g.suspected_exceed DESC,
            g.max_ratio DESC NULLS LAST
        LIMIT 8
        """,
        (date, date),
    )

    items: list[dict[str, Any]] = []

    for row in rows:
        count = _safe_int(row.get("suspected_exceed"))
        max_ratio = _safe_float(row.get("max_ratio"))

        items.append(
            {
                "monitoring_item": row.get("monitoring_item") or "未知监测项",
                "suspected_exceed": count,
                "points": _safe_int(row.get("points")),
                "max_ratio": round(max_ratio, 4),
                "representative_point": row.get("representative_point"),
                "level": _priority_from_ratio(max_ratio, count),
            }
        )

    return items


def _build_data_notes() -> list[dict[str, str]]:
    return [
        {
            "title": "研判口径",
            "status": "统一风险视图",
            "description": "当前页面基于 vw_risk_overview 汇总，不再混用多个接口口径。",
        },
        {
            "title": "阈值口径",
            "status": "设计限值",
            "description": "当前疑似超限主要基于设计限值，正式预警/报警阈值待补录。",
        },
        {
            "title": "空间口径",
            "status": "分组热力",
            "description": "测点坐标尚未补录，当前按侧别和部位做分组热力，不是真实空间热力图。",
        },
    ]


async def get_quick_risk(date: str = "", limit: int = 8) -> dict[str, Any]:
    limit = max(1, min(limit, 50))
    resolved_date = await _resolve_date(date)

    if not resolved_date:
        return {
            "generated_at": datetime.now().isoformat(),
            "date": date or "",
            "state": "未判定",
            "title": "暂无可用监测数据",
            "reason": "统一风险视图中未查询到数据。",
            "action": "请检查 vw_risk_overview 是否已建立并包含数据。",
            "kpis": {
                "suspected_exceed": 0,
                "pending_confirm": 0,
                "monitoring_points": 0,
                "readings": 0,
            },
            "risk_records": [],
            "group_heatmap": [],
            "risk_types": [],
            "data_notes": _build_data_notes(),
        }

    kpis = await _fetch_kpis(resolved_date)
    suspected_exceed = kpis["suspected_exceed"]
    pending_confirm = kpis["pending_confirm"]

    state = _state_from_kpis(suspected_exceed, pending_confirm)

    return {
        "generated_at": datetime.now().isoformat(),
        "date": resolved_date,
        "state": state,
        "title": _build_title(suspected_exceed, pending_confirm),
        "reason": "当前研判基于统一风险视图；疑似超限尚不等同于正式报警，需要人工复核。",
        "action": "优先查看高倍数疑似超限点位，再处理待确认数据。",
        "kpis": kpis,
        "risk_records": await _fetch_risk_records(resolved_date, limit),
        "group_heatmap": await _fetch_group_heatmap(resolved_date),
        "risk_types": await _fetch_risk_types(resolved_date),
        "data_notes": _build_data_notes(),
    }
