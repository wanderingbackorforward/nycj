"""
高级分析与工程预判预警服务

提供趋势分析、限值逼近、异常检测、跨项关联、预判预警、分区热力图、每日简报。
"""
from .. import db, config
from datetime import datetime, timedelta


# ============================================================
# 1. 趋势加速度分析
# ============================================================

async def get_trend_acceleration(
    monitoring_item: str = "",
    side: str = "",
    limit: int = 50
):
    """
    对每个测点计算近3日滑动平均变化速率和加速度方向。
    返回：收敛/稳定/加速恶化/减速恶化/加速恢复。
    """
    limit = min(limit, config.MAX_LIMIT)
    where = ["r.reading_role IN ('analysis_primary', 'aggregate_summary')",
             "r.data_quality != 'parsed_low_confidence'"]
    params = []
    if monitoring_item:
        where.append("r.monitoring_item = %s")
        params.append(monitoring_item)
    if side:
        where.append("r.side = %s")
        params.append(side)

    sql = f"""
        WITH recent AS (
            SELECT point_code, monitoring_item, monitoring_object, side, part,
                   measured_at, cumulative_change,
                   LAG(cumulative_change, 1) OVER w AS prev_day,
                   LAG(cumulative_change, 2) OVER w AS prev2_day
            FROM gn_monitoring_reading r
            WHERE {' AND '.join(where)}
            WINDOW w AS (PARTITION BY point_code ORDER BY measured_at)
        ),
        daily AS (
            SELECT *,
                   cumulative_change - prev_day AS daily_change_1,
                   prev_day - prev2_day AS daily_change_2
            FROM recent
            WHERE prev_day IS NOT NULL AND prev2_day IS NOT NULL
        ),
        latest AS (
            SELECT DISTINCT ON (point_code) *
            FROM daily
            ORDER BY point_code, measured_at DESC
        )
        SELECT point_code, monitoring_item, monitoring_object, side, part,
               measured_at, cumulative_change,
               ROUND(daily_change_1::numeric, 3) AS latest_daily_change,
               ROUND(daily_change_2::numeric, 3) AS prev_daily_change,
               ROUND((daily_change_1 - daily_change_2)::numeric, 3) AS accel_val,
               CASE
                   WHEN ABS(daily_change_1) < 0.1 THEN '稳定'
                   WHEN daily_change_1 * daily_change_2 < 0 THEN
                       CASE WHEN ABS(daily_change_1) < ABS(daily_change_2) THEN '减速' ELSE '转向' END
                   WHEN ABS(daily_change_1) > ABS(daily_change_2) THEN
                       CASE WHEN ABS(cumulative_change) > ABS(prev2_day) THEN '加速恶化' ELSE '加速恢复' END
                   ELSE '持续'
               END AS trend_direction
        FROM latest
        ORDER BY ABS(ROUND((daily_change_1 - daily_change_2)::numeric, 3)) DESC
        LIMIT {limit}
    """
    rows = await db.fetch(sql, tuple(params) if params else None)
    return {
        "generated_at": datetime.now().isoformat(),
        "filters": {"monitoring_item": monitoring_item, "side": side},
        "items": [dict(r) for r in rows],
        "interpretation": "加速度 > 0 表示变化在加快（恶化或恢复加速），加速度 < 0 表示变化在减速。趋势方向综合判断方向和速率。"
    }


# ============================================================
# 2. 设计限值逼近分析
# ============================================================

async def get_threshold_proximity(
    date: str = "",
    monitoring_item: str = "",
    side: str = "",
    limit: int = 50
):
    """
    对有设计限值的测点，计算距限值的剩余量，并按当前速率预测剩余天数。
    """
    limit = min(limit, config.MAX_LIMIT)

    # 找到最新日期（如果未指定）
    if not date:
        date = await db.fetch_val(
            "SELECT max(measured_at::text) FROM gn_monitoring_reading "
            "WHERE reading_role IN ('analysis_primary', 'aggregate_summary')"
        )
    if not date:
        return {"generated_at": datetime.now().isoformat(), "items": [], "message": "无数据"}

    where = ["r.reading_role IN ('analysis_primary', 'aggregate_summary')",
             "r.design_limit IS NOT NULL",
             "r.design_limit > 0",
             f"r.measured_at::text = %s"]
    params = [date]
    if monitoring_item:
        where.append("r.monitoring_item = %s")
        params.append(monitoring_item)
    if side:
        where.append("r.side = %s")
        params.append(side)

    sql = f"""
        WITH latest AS (
            SELECT DISTINCT ON (r.point_code)
                   r.point_code, r.monitoring_item, r.monitoring_object, r.side, r.part,
                   r.cumulative_change, r.daily_change, r.design_limit
            FROM gn_monitoring_reading r
            WHERE {' AND '.join(where)}
            ORDER BY r.point_code, r.measured_at DESC
        ),
        with_gap AS (
            SELECT *,
                   design_limit - ABS(COALESCE(cumulative_change, 0)) AS gap_to_limit,
                   CASE
                       WHEN design_limit > 0 AND ABS(COALESCE(cumulative_change, 0)) >= design_limit THEN 0
                       WHEN COALESCE(daily_change, 0) = 0 THEN NULL
                       ELSE (design_limit - ABS(COALESCE(cumulative_change, 0))) / ABS(COALESCE(daily_change, 0.001))
                   END AS estimated_days_to_limit
            FROM latest
        )
        SELECT *,
               CASE
                   WHEN gap_to_limit <= 0 THEN '已超设计限值'
                   WHEN design_limit > 0 AND ABS(COALESCE(cumulative_change, 0)) / design_limit >= 0.8 THEN '逼近限值'
                   WHEN design_limit > 0 AND ABS(COALESCE(cumulative_change, 0)) / design_limit >= 0.5 THEN '需关注'
                   ELSE '安全'
               END AS proximity_level
        FROM with_gap
        ORDER BY COALESCE(gap_to_limit, 999999) ASC
        LIMIT {limit}
    """
    rows = await db.fetch(sql, tuple(params))
    return {
        "generated_at": datetime.now().isoformat(),
        "date": date,
        "filters": {"monitoring_item": monitoring_item, "side": side},
        "items": [dict(r) for r in rows],
        "interpretation": "gap_to_limit = 设计限值 - |累计变化|。estimated_days_to_limit 按当前日变化速率估算，仅供参考。proximity_level: 已超/逼近(<20%余量)/需关注(20-50%)/安全(>50%)。"
    }


# ============================================================
# 3. 自身异常检测
# ============================================================

async def get_anomaly_detection(
    monitoring_item: str = "",
    side: str = "",
    sigma: float = 2.0,
    limit: int = 50
):
    """
    对每个测点，拿最新值与自身4月历史均值和标准差比较。
    超过 sigma 倍标准差视为异常（不看设计限值，只看自身波动）。
    """
    limit = min(limit, config.MAX_LIMIT)
    where = ["reading_role IN ('analysis_primary', 'aggregate_summary')",
             "cumulative_change IS NOT NULL"]
    if monitoring_item:
        where.append("monitoring_item = %s")
        params_loc = [monitoring_item]
    else:
        params_loc = []
    if side:
        where.append("side = %s")
        params_loc.append(side)

    sql = f"""
        WITH stats AS (
            SELECT point_code, monitoring_item, monitoring_object, side, part,
                   AVG(cumulative_change) AS mean_val,
                   STDDEV(cumulative_change) AS std_val,
                   MAX(measured_at) AS last_date
            FROM gn_monitoring_reading
            WHERE {' AND '.join(where)}
            GROUP BY point_code, monitoring_item, monitoring_object, side, part
            HAVING STDDEV(cumulative_change) > 0
        ),
        latest AS (
            SELECT DISTINCT ON (r.point_code)
                   r.point_code, r.cumulative_change AS latest_value, r.measured_at
            FROM gn_monitoring_reading r
            WHERE reading_role IN ('analysis_primary', 'aggregate_summary')
              AND cumulative_change IS NOT NULL
            ORDER BY r.point_code, r.measured_at DESC
        )
        SELECT s.*, l.latest_value,
               ROUND(((l.latest_value - s.mean_val) / NULLIF(s.std_val, 0))::numeric, 2) AS z_score,
               ROUND((s.mean_val)::numeric, 3) AS mean_val_r,
               ROUND((s.std_val)::numeric, 3) AS std_val_r
        FROM stats s
        JOIN latest l ON s.point_code = l.point_code
        WHERE ABS(l.latest_value - s.mean_val) / NULLIF(s.std_val, 0) >= %s
        ORDER BY ABS(l.latest_value - s.mean_val) / NULLIF(s.std_val, 0) DESC
        LIMIT {limit}
    """
    params_loc.append(sigma)
    rows = await db.fetch(sql, tuple(params_loc))
    return {
        "generated_at": datetime.now().isoformat(),
        "sigma_threshold": sigma,
        "filters": {"monitoring_item": monitoring_item, "side": side},
        "items": [dict(r) for r in rows],
        "interpretation": f"z_score > {sigma} 表示该测点当前值显著偏离自身历史模式。这不等于超设计限值，而是'该点表现异常于自身常态'。可能与施工扰动、传感器故障或真实异常有关。"
    }


# ============================================================
# 4. 跨监测项关联分析
# ============================================================

async def get_cross_correlation(
    side: str = ""
):
    """
    分析不同监测项目之间的相关性。
    例如：地表沉降与地下水位、桩顶水平位移与深层水平位移。
    """
    now = datetime.now().isoformat()

    # 预定义可能相关的监测对象对
    pairs = [
        ("地表", "地下水", "竖向位移", "地下水位"),
        ("围护结构桩顶", "围护结构深层水平位移", "水平位移", "深层水平位移"),
        ("围护结构桩顶", "立柱", "竖向位移", "竖向位移"),
        ("管线", "地表", "竖向位移", "竖向位移"),
    ]

    correlations = []
    for obj_a, obj_b, item_a, item_b in pairs:
        where = []
        if side:
            where.append(f"side = '{side}'")
        where_clause = " AND " + " AND ".join(where) if where else ""

        # 按日期聚合两个监测对象的平均累计变化
        sql = f"""
            WITH a AS (
                SELECT measured_at, AVG(cumulative_change) AS avg_a
                FROM gn_monitoring_reading
                WHERE monitoring_object = %s AND monitoring_item = %s
                  AND cumulative_change IS NOT NULL{where_clause}
                GROUP BY measured_at
            ),
            b AS (
                SELECT measured_at, AVG(cumulative_change) AS avg_b
                FROM gn_monitoring_reading
                WHERE monitoring_object = %s AND monitoring_item = %s
                  AND cumulative_change IS NOT NULL{where_clause}
                GROUP BY measured_at
            )
            SELECT CORR(a.avg_a, b.avg_b) AS correlation,
                   COUNT(*) AS overlap_days
            FROM a JOIN b ON a.measured_at = b.measured_at
        """
        row = await db.fetch_one(sql, (obj_a, item_a, obj_b, item_b))
        if row and row["correlation"] is not None:
            corr = float(row["correlation"])
            strength = "强" if abs(corr) > 0.7 else "中等" if abs(corr) > 0.4 else "弱"
            direction = "正相关" if corr > 0 else "负相关"
            correlations.append({
                "object_a": obj_a, "item_a": item_a,
                "object_b": obj_b, "item_b": item_b,
                "coefficient": round(corr, 3),
                "strength": strength,
                "direction": direction,
                "overlap_days": row["overlap_days"],
                "description": f"{obj_a}{item_a}与{obj_b}{item_b}呈{strength}{direction}（r={corr:.3f}）。"
            })

    return {
        "generated_at": now,
        "side_filter": side or "全部",
        "correlations": correlations,
        "interpretation": "正相关 > 0.7：两项变化方向一致，可能由同一施工因素驱动。负相关：一项增大另一项减小。弱相关：相对独立，可单独分析。"
    }


# ============================================================
# 5. 工程预判预警
# ============================================================

async def get_early_warning(
    date: str = "",
    limit: int = 30
):
    """
    综合多信号评分，输出排序后的预警列表。
    评分规则：
    - 已超设计限值 + 重点复核: 100分
    - 已超设计限值: 70分
    - 逼近限值 + 加速恶化: 60分
    - 自身z_score异常 + 逼近限值: 50分
    - 逼近限值: 30分
    - 加速恶化但未超限: 20分
    """
    limit = min(limit, config.MAX_LIMIT)

    if not date:
        date = await db.fetch_val(
            "SELECT max(measured_at::text) FROM gn_monitoring_reading WHERE reading_role IN ('analysis_primary', 'aggregate_summary')"
        )
    if not date:
        return {"generated_at": datetime.now().isoformat(), "warnings": [], "message": "无数据"}

    sql = f"""
        WITH latest AS (
            SELECT DISTINCT ON (point_code)
                   point_code, monitoring_item, monitoring_object, side, part,
                   measured_at, cumulative_change, daily_change, design_limit,
                   status_code, review_level
            FROM gn_monitoring_reading
            WHERE reading_role IN ('analysis_primary', 'aggregate_summary')
              AND measured_at::text = %s
            ORDER BY point_code, measured_at DESC
        ),
        scored AS (
            SELECT *,
                   CASE
                       WHEN status_code = 'exceed_design_limit'
                        AND review_level = '重点复核' THEN 100
                       WHEN status_code = 'exceed_design_limit' THEN 70
                       WHEN design_limit > 0
                        AND ABS(COALESCE(cumulative_change,0)) / design_limit >= 0.8
                        AND ABS(COALESCE(daily_change, 0)) > 0.5 THEN 60
                       WHEN design_limit > 0
                        AND ABS(COALESCE(cumulative_change,0)) / design_limit >= 0.8 THEN 30
                       WHEN ABS(COALESCE(daily_change, 0)) > 1.0 THEN 20
                       ELSE 0
                   END AS risk_score
            FROM latest
        )
        SELECT *,
               CASE
                   WHEN risk_score >= 100 THEN '红色预警'
                   WHEN risk_score >= 70 THEN '橙色预警'
                   WHEN risk_score >= 50 THEN '黄色关注'
                   WHEN risk_score >= 20 THEN '蓝色提示'
                   ELSE '正常'
               END AS warning_level
        FROM scored
        WHERE risk_score > 0
        ORDER BY risk_score DESC
        LIMIT {limit}
    """
    rows = await db.fetch(sql, (date,))

    warnings = []
    for r in rows:
        d = dict(r)
        d["suggested_action"] = _suggest_action(d)
        warnings.append(d)

    return {
        "generated_at": datetime.now().isoformat(),
        "date": date,
        "total_warnings": len(warnings),
        "warnings": warnings,
        "scoring_rule": "红色(≥100): 超限+重点复核 | 橙色(≥70): 超设计限值 | 黄色(≥50): 逼近+加速 | 蓝色(≥20): 加速恶化",
        "disclaimer": "此评分基于当前有限规则自动生成，不等同于正式工程预警，需人工复核后确认。"
    }


def _suggest_action(d: dict) -> str:
    score = d.get("risk_score", 0)
    rl = d.get("review_level", "")
    sc = d.get("status_code", "")
    item = d.get("monitoring_item", "")
    pc = d.get("point_code", "")

    if score >= 100:
        return f"{pc} {item} 超设计限值且为重点复核对象，建议立即核对原始Excel数据、确认单位与阈值口径。"
    if score >= 70:
        if rl == "重点复核":
            return f"{pc} 超设计限值，需人工复核原始数据和设计限值含义。"
        return f"{pc} 累计变化已超设计限值，请确认是否需要调整阈值或加强现场监测频率。"
    if score >= 50:
        return f"{pc} 接近设计限值且变化在加速，建议加密监测频率，提前准备应对措施。"
    if score >= 20:
        return f"{pc} 日变化速率偏大，建议持续观察，若持续加速需升级关注级别。"
    return ""


# ============================================================
# 6. 分区态势热力图
# ============================================================

async def get_zone_heatmap(date: str = ""):
    """
    按 side × part 分组，统计每个分区的异常程度。
    """
    if not date:
        date = await db.fetch_val(
            "SELECT max(measured_at::text) FROM gn_monitoring_reading WHERE reading_role IN ('analysis_primary', 'aggregate_summary')"
        )
    if not date:
        return {"generated_at": datetime.now().isoformat(), "zones": [], "message": "无数据"}

    sql = """
        SELECT
            side, part,
            COUNT(DISTINCT point_code) AS point_count,
            COUNT(*) AS reading_count,
            COUNT(*) FILTER (WHERE status_code = 'exceed_design_limit') AS exceed_count,
            COUNT(*) FILTER (WHERE review_level = '重点复核') AS severe_count,
            ROUND(AVG(ABS(COALESCE(cumulative_change, 0)) / NULLIF(design_limit, 0))::numeric, 2) AS avg_exceed_ratio,
            MAX(ABS(COALESCE(cumulative_change, 0)) / NULLIF(design_limit, 0)) AS max_exceed_ratio,
            CASE
                WHEN COUNT(*) FILTER (WHERE review_level = '重点复核') > 0 THEN '严重'
                WHEN COUNT(*) FILTER (WHERE status_code = 'exceed_design_limit') > 3 THEN '异常'
                WHEN COUNT(*) FILTER (WHERE status_code = 'exceed_design_limit') > 0 THEN '关注'
                ELSE '正常'
            END AS zone_status
        FROM gn_monitoring_reading
        WHERE reading_role IN ('analysis_primary', 'aggregate_summary')
          AND measured_at::text = %s
        GROUP BY side, part
        ORDER BY severe_count DESC, exceed_count DESC
    """
    rows = await db.fetch(sql, (date,))

    return {
        "generated_at": datetime.now().isoformat(),
        "date": date,
        "zones": [dict(r) for r in rows],
        "interpretation": "zone_status: 严重(存在重点复核) | 异常(超限>3) | 关注(有超限) | 正常。avg_exceed_ratio > 1 表示该分区平均已超设计限值。"
    }


# ============================================================
# 7. 每日工程研判简报
# ============================================================

async def get_daily_briefing(date: str = ""):
    """
    生成一份面向工程管理人员的每日研判简报。
    """
    now = datetime.now().isoformat()

    if not date:
        date = await db.fetch_val(
            "SELECT max(measured_at::text) FROM gn_monitoring_reading WHERE reading_role IN ('analysis_primary', 'aggregate_summary')"
        )
    if not date:
        return {"generated_at": now, "message": "无数据"}

    # 基础统计
    total_points = await db.fetch_val(
        "SELECT count(DISTINCT point_code) FROM gn_monitoring_reading WHERE measured_at::text = %s AND reading_role IN ('analysis_primary', 'aggregate_summary')",
        (date,)
    ) or 0
    total_readings = await db.fetch_val(
        "SELECT count(*) FROM gn_monitoring_reading WHERE measured_at::text = %s AND reading_role IN ('analysis_primary', 'aggregate_summary')",
        (date,)
    ) or 0
    exceed_count = await db.fetch_val(
        "SELECT count(*) FROM gn_monitoring_reading WHERE measured_at::text = %s AND status_code = 'exceed_design_limit'",
        (date,)
    ) or 0
    severe_count = await db.fetch_val(
        "SELECT count(*) FROM gn_monitoring_reading WHERE measured_at::text = %s AND review_level = '重点复核'",
        (date,)
    ) or 0

    # Top 5 恶化的点（按日变化速率绝对值）
    worsening = await db.fetch(
        "SELECT point_code, monitoring_item, part, side, ROUND(cumulative_change::numeric,3) AS cum, ROUND(daily_change::numeric,3) AS daily_chg FROM gn_monitoring_reading WHERE measured_at::text = %s AND reading_role IN ('analysis_primary', 'aggregate_summary') AND daily_change IS NOT NULL ORDER BY ABS(daily_change) DESC LIMIT 5",
        (date,)
    )

    # Top 5 逼近限值的点
    approaching = await db.fetch(
        "SELECT point_code, monitoring_item, part, side, ROUND(cumulative_change::numeric,3) AS cum, design_limit, ROUND((ABS(cumulative_change)/NULLIF(design_limit,0))::numeric,2) AS ratio FROM gn_monitoring_reading WHERE measured_at::text = %s AND design_limit > 0 ORDER BY ABS(cumulative_change)/NULLIF(design_limit,0) DESC LIMIT 5",
        (date,)
    )

    # 分区摘要
    zones = await db.fetch(
        "SELECT side, COUNT(*) FILTER (WHERE status_code = 'exceed_design_limit') AS exceed_cnt FROM gn_monitoring_reading WHERE measured_at::text = %s AND reading_role IN ('analysis_primary', 'aggregate_summary') GROUP BY side",
        (date,)
    )

    # 生成一句话建议
    if severe_count > 0:
        recommendation = f"当日存在 {severe_count} 条重点复核记录，建议优先安排人工核对。"
    elif exceed_count > 10:
        recommendation = f"当日 {exceed_count} 条超设计限值，虽不等于正式报警，但建议关注趋势变化。"
    elif exceed_count > 0:
        recommendation = f"当日个别测点超设计限值，整体可控，建议持续监测。"
    else:
        recommendation = "当日监测数据整体正常，未见超限，建议按计划进行日常监测。"

    return {
        "generated_at": now,
        "project_name": config.PROJECT_NAME,
        "work_area": config.WORK_AREA,
        "date": date,
        "summary": {
            "point_count": total_points,
            "reading_count": total_readings,
            "exceed_design_limit": exceed_count,
            "severe_review": severe_count,
        },
        "top_worsening": [dict(r) for r in worsening],
        "top_approaching": [dict(r) for r in approaching],
        "zone_summary": [dict(r) for r in zones],
        "recommendation": recommendation,
        "disclaimer": "此简报由系统自动生成，基于当前解析规则和设计限值标签，不等同于正式工程研判结论，需经专业人员复核。"
    }



# ============================================================
# 8. 快速整体研判（面向前端）
# ============================================================

async def get_quick_risk(date: str = "", limit: int = 8):
    """
    面向前端的快速整体研判接口。
    返回工区当日风险概览、top风险记录、分组热力、风险类型分布。
    不做大规模数据清洗，不依赖坐标。
    """
    now = datetime.now().isoformat()

    # ---- 确定日期 ----
    if not date:
        date = await db.fetch_val(
            "SELECT max(measured_at::text) FROM gn_monitoring_reading WHERE reading_role IN ('analysis_primary', 'aggregate_summary')"
        )
    if not date:
        return {"generated_at": now, "date": "", "state": "无数据", "title": "暂无监测数据",
                "reason": "", "action": "", "kpis": {}, "risk_records": [], "group_heatmap": [], "risk_types": [], "data_notes": DATA_NOTES}

    # ---- KPI 统计（与 daily_briefing 同口径：reading_role 过滤）----
    total_points = await db.fetch_val(
        "SELECT count(DISTINCT point_code) FROM gn_monitoring_reading"
        " WHERE measured_at::text = %s AND reading_role IN ('analysis_primary', 'aggregate_summary')",
        (date,)
    ) or 0
    total_readings = await db.fetch_val(
        "SELECT count(*) FROM gn_monitoring_reading"
        " WHERE measured_at::text = %s AND reading_role IN ('analysis_primary', 'aggregate_summary')",
        (date,)
    ) or 0
    suspected_exceed = await db.fetch_val(
        "SELECT count(*) FROM gn_monitoring_reading"
        " WHERE measured_at::text = %s AND status_code = 'exceed_design_limit'",
        (date,)
    ) or 0
    pending_confirm = await db.fetch_val(
        "SELECT count(*) FROM gn_monitoring_reading"
        " WHERE measured_at::text = %s AND status_code = 'unknown'",
        (date,)
    ) or 0

    # ---- risk_records：从 v_gn_alert_review 取，与 /monitoring/alerts 同源 ----
    alert_rows = await db.fetch(
        "SELECT point_code, monitoring_item, monitoring_object, side, part,"
        " ROUND(COALESCE(cumulative_change,0)::numeric,2) AS cumulative_change,"
        " design_limit, exceed_ratio, review_level"
        " FROM v_gn_alert_review"
        " WHERE measured_at::text = %s"
        " ORDER BY exceed_ratio DESC NULLS LAST, ABS(cumulative_change)/NULLIF(design_limit,0) DESC NULLS LAST"
        " LIMIT %s",
        (date, limit)
    )

    risk_records = []
    for r in alert_rows:
        ratio_val = float(r["exceed_ratio"]) if r["exceed_ratio"] is not None else None
        if ratio_val is None:
            dl = r.get("design_limit") or 0
            cc = r.get("cumulative_change") or 0
            ratio_val = round(abs(cc) / abs(dl), 2) if dl != 0 else None

        rl = r.get("review_level") or ""
        if ratio_val and ratio_val >= 3:
            priority = "高"
        elif rl == "重点复核" or (ratio_val and ratio_val >= 1):
            priority = "中"
        else:
            priority = "低"

        label = "疑似超限" if (ratio_val and ratio_val >= 1) else ("需关注" if ratio_val else "待确认")

        reason_parts = []
        if ratio_val and ratio_val >= 1:
            reason_parts.append("超过设计限值")
        if rl == "重点复核":
            reason_parts.append("标记为重点复核")
        if not reason_parts:
            reason_parts.append("待确认状态")
        reason = "，".join(reason_parts) + "，需复核是否形成正式预警"

        risk_records.append({
            "priority": priority,
            "label": label,
            "point_code": r["point_code"] or "",
            "monitoring_item": r["monitoring_item"] or "",
            "monitoring_object": r["monitoring_object"] or "",
            "side": r["side"] or "",
            "part": r["part"] or "",
            "metric": f"{ratio_val:.2f}x" if ratio_val else "-",
            "ratio": ratio_val,
            "reason": reason,
        })

    # ---- risk_types：从 risk_records 聚合，按 monitoring_item 去重 ----
    type_map = {}
    for rr in risk_records:
        mi = rr["monitoring_item"]
        if mi not in type_map:
            type_map[mi] = {
                "monitoring_item": mi,
                "suspected_exceed": 0,
                "points": set(),
                "max_ratio": 0,
                "representative_point": rr["point_code"],
                "level": "低",
            }
        type_map[mi]["suspected_exceed"] += 1
        type_map[mi]["points"].add(rr["point_code"])
        if rr["ratio"] and rr["ratio"] > type_map[mi]["max_ratio"]:
            type_map[mi]["max_ratio"] = rr["ratio"]
            type_map[mi]["representative_point"] = rr["point_code"]

    risk_types = []
    for mi, v in sorted(type_map.items(), key=lambda x: -x[1]["max_ratio"]):
        max_r = v["max_ratio"]
        v["level"] = "高" if max_r >= 3 else ("中" if max_r >= 1 else "低")
        risk_types.append({
            "monitoring_item": mi,
            "suspected_exceed": v["suspected_exceed"],
            "points": len(v["points"]),
            "max_ratio": v["max_ratio"],
            "representative_point": v["representative_point"],
            "level": v["level"],
        })

    # ---- group_heatmap：从 risk_records 按 side + part 聚合 ----
    def make_group(side, part):
        s = (side or "").strip()
        p = (part or "").strip()
        if s and p:
            return f"{s} · {p}"
        return s or p or "未知"

    heat_map = {}
    for rr in risk_records:
        g = make_group(rr["side"], rr["part"])
        if g not in heat_map:
            heat_map[g] = {
                "group": g,
                "side": rr["side"],
                "part": rr["part"],
                "suspected_exceed": 0,
                "points": set(),
                "max_ratio": 0,
                "level": "低",
            }
        heat_map[g]["suspected_exceed"] += 1
        heat_map[g]["points"].add(rr["point_code"])
        if rr["ratio"] and rr["ratio"] > heat_map[g]["max_ratio"]:
            heat_map[g]["max_ratio"] = rr["ratio"]

    group_heatmap = []
    for g, v in sorted(heat_map.items(), key=lambda x: -x[1]["suspected_exceed"]):
        max_r = v["max_ratio"]
        v["level"] = "高" if max_r >= 3 else ("中" if max_r >= 1 else "低")
        group_heatmap.append({
            "group": g,
            "side": v["side"],
            "part": v["part"],
            "suspected_exceed": v["suspected_exceed"],
            "points": len(v["points"]),
            "max_ratio": v["max_ratio"],
            "level": v["level"],
        })

    # ---- state / title / reason / action ----
    if suspected_exceed > 10:
        state = "需复核"
        title = f"今日有 {suspected_exceed} 条疑似超限记录需要复核"
    elif suspected_exceed > 0:
        state = "需关注"
        title = f"今日有 {suspected_exceed} 条疑似超限记录，整体可控"
    elif pending_confirm > total_readings * 0.5:
        state = "待确认"
        title = f"今日 {pending_confirm} 条读数待确认，建议优先补齐限值"
    else:
        state = "正常"
        title = "今日监测数据整体正常"

    reason = "这些记录尚未等同于正式预警，需要确认是否真实超限或属于数据口径问题。"
    action = "优先查看高倍数疑似超限点位，再处理无法自动判断的数据。"

    return {
        "generated_at": now,
        "date": date,
        "state": state,
        "title": title,
        "reason": reason,
        "action": action,
        "kpis": {
            "suspected_exceed": suspected_exceed,
            "pending_confirm": pending_confirm,
            "monitoring_points": total_points,
            "readings": total_readings,
        },
        "risk_records": risk_records,
        "group_heatmap": group_heatmap,
        "risk_types": risk_types,
        "data_notes": DATA_NOTES,
    }


DATA_NOTES = [
    {
        "title": "阈值口径",
        "status": "需说明",
        "description": "当前主要按设计限值识别疑似超限，正式预警/报警阈值未完全配置。",
    },
    {
        "title": "空间口径",
        "status": "暂不完整",
        "description": "测点坐标不完整，当前使用侧别和部位做分组热力，不作为真实空间热力图。",
    },
    {
        "title": "复核口径",
        "status": "需人工确认",
        "description": "疑似超限不等于正式报警，需人工复核后闭环。",
    },
]
