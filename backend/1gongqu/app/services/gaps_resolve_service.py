"""
缺口自动化解决服务

① 从已有数据自动推导阈值并批量填充
② DSW13 全量证据诊断
③ 传感器编号逆向解析
④ 测点坐标清单 + 批量录入
"""
from .. import db, config
from datetime import datetime
import uuid
import json


# ============================================================
# ① 阈值自动推导
# ============================================================

async def bootstrap_thresholds():
    """
    从 gn_monitoring_reading 中提取每个监测项的 design_limit 最频值，
    自动填充 gn_formal_threshold。
    预警值 = 设计限值 × 0.75，报警值 = 设计限值。
    """
    now = datetime.now().isoformat()

    # 找每个 monitoring_item + monitoring_object 组合的 design_limit 众数
    rows = await db.fetch("""
        WITH ranked AS (
            SELECT monitoring_item, monitoring_object, design_limit, COUNT(*) AS cnt,
                   ROW_NUMBER() OVER (PARTITION BY monitoring_item, monitoring_object ORDER BY COUNT(*) DESC) AS rn
            FROM gn_monitoring_reading
            WHERE design_limit IS NOT NULL AND design_limit > 0
            GROUP BY monitoring_item, monitoring_object, design_limit
        )
        SELECT monitoring_item, monitoring_object, design_limit
        FROM ranked WHERE rn = 1
        ORDER BY monitoring_item, monitoring_object
    """)

    inserted = []
    skipped = []
    for r in rows:
        item = r["monitoring_item"]
        obj = r["monitoring_object"] or ""
        dl = float(r["design_limit"])

        # 检查是否已存在
        existing = await db.fetch_one(
            "SELECT id, threshold_source FROM gn_formal_threshold WHERE monitoring_item = %s AND monitoring_object = %s",
            (item, obj)
        )
        if existing and existing.get("threshold_source") == "manual":
            skipped.append(f"{item}/{obj} (人工已配置，跳过)")
            continue

        tid = str(uuid.uuid4())
        await db.execute(
            "INSERT INTO gn_formal_threshold (id, monitoring_item, monitoring_object, "
            "design_limit, warning_threshold, alarm_threshold, unit, threshold_source, updated_at) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) "
            "ON CONFLICT (monitoring_item, monitoring_object) "
            "DO UPDATE SET design_limit=EXCLUDED.design_limit, "
            "warning_threshold=EXCLUDED.warning_threshold, "
            "alarm_threshold=EXCLUDED.alarm_threshold, "
            "unit=EXCLUDED.unit, threshold_source=EXCLUDED.threshold_source, "
            "updated_at=EXCLUDED.updated_at",
            (tid, item, obj, dl, round(dl * 0.75, 2), dl, "mm", "auto-derived-from-excel", now)
        )
        inserted.append(f"{item}/{obj}: design={dl}, warning={round(dl*0.75,2)}, alarm={dl}")

    return {
        "generated_at": now,
        "inserted_count": len(inserted),
        "skipped_count": len(skipped),
        "inserted": inserted,
        "skipped": skipped,
        "note": "预警值 = 设计限值 × 0.75（行业常用比例），报警值 = 设计限值。此自动推导仅供参考，建议监测方确认后调整。"
    }


# ============================================================
# ② DSW13 全量证据诊断
# ============================================================

async def diagnose_dsw13():
    """
    对 DSW13 进行全量诊断：
    - 逐条列出所有读数和来源
    - 检查初始值一致性
    - 检查累计变化计算链
    - 对比同期其他地下水位点
    """
    now = datetime.now().isoformat()

    # 所有 DSW13 读数
    readings = await db.fetch(
        "SELECT measured_at, current_value, cumulative_change, daily_change, "
        "design_limit, initial_value, last_value, unit, data_quality, "
        "source_file_name, source_sheet_name, row_index, raw_row_json "
        "FROM gn_monitoring_reading "
        "WHERE point_code = 'DSW13' "
        "ORDER BY measured_at"
    )

    # DSW13 证据
    evidence = await db.fetch(
        "SELECT e.* FROM gn_extraction_evidence e "
        "JOIN gn_monitoring_reading r ON e.related_key = r.reading_id::text "
        "WHERE r.point_code = 'DSW13' "
        "ORDER BY e.row_index LIMIT 20"
    )

    # 同期其他地下水点（如果存在）
    siblings = await db.fetch(
        "SELECT point_code, measured_at, cumulative_change, design_limit "
        "FROM gn_monitoring_reading "
        "WHERE monitoring_item = '地下水位' "
        "AND point_code != 'DSW13' "
        "ORDER BY measured_at DESC LIMIT 30"
    )

    # 诊断
    findings = []
    units = set()
    for rd in readings:
        raw = rd.get("raw_row_json")
        if raw:
            try:
                raw_obj = json.loads(raw) if isinstance(raw, str) else raw
                for k, v in raw_obj.items():
                    if v and str(v).strip():
                        units.add(str(v)[:20])
            except:
                pass

    # 检查 initial_value 一致性
    init_vals = [r["initial_value"] for r in readings if r.get("initial_value") is not None]
    if len(set(init_vals)) > 1:
        findings.append({
            "level": "warning",
            "detail": f"初始值不一致：存在 {len(set(init_vals))} 个不同的初始值 {list(set(init_vals))[:5]}，请确认哪一个是正确的。"
        })

    # 检查 cumulative_change 与 daily_change 的连贯性
    cum_changes = [(r["measured_at"], r["cumulative_change"], r.get("daily_change"))
                   for r in readings if r.get("cumulative_change") is not None]
    if len(cum_changes) >= 2:
        max_jump = 0
        for i in range(1, len(cum_changes)):
            diff = abs((cum_changes[i][1] or 0) - (cum_changes[i-1][1] or 0))
            if diff > max_jump:
                max_jump = diff
        if max_jump > 10:
            findings.append({
                "level": "critical",
                "detail": f"累计变化存在大幅跳变（最大日变化 {max_jump:.1f}），请确认是否为数据录入错误。"
            })

    # 对比同类型点
    if siblings:
        sibling_avg = sum(abs(s["cumulative_change"] or 0) for s in siblings) / len(siblings)
        dsw13_max = max(abs(r["cumulative_change"] or 0) for r in readings if r.get("cumulative_change") is not None)
        if dsw13_max > sibling_avg * 3:
            findings.append({
                "level": "critical",
                "detail": f"DSW13 最大累计变化 ({dsw13_max:.1f}) 远高于同期其他水位点均值 ({sibling_avg:.1f})，建议现场核查。"
            })

    if not findings:
        findings.append({"level": "info", "detail": "未发现明显数据异常，exceed_ratio 偏高可能为真实水位变化，建议现场确认。"})

    return {
        "generated_at": now,
        "point_code": "DSW13",
        "reading_count": len(readings),
        "evidence_count": len(evidence),
        "date_range": {
            "from": str(readings[0]["measured_at"]) if readings else "N/A",
            "to": str(readings[-1]["measured_at"]) if readings else "N/A"
        },
        "readings": [{
            "date": str(r["measured_at"]),
            "current_value": r["current_value"],
            "cumulative_change": r["cumulative_change"],
            "daily_change": r.get("daily_change"),
            "initial_value": r.get("initial_value"),
            "source": f"{r['source_file_name']}/{r['source_sheet_name']} row {r['row_index']}"
        } for r in readings[-10:]],  # 最近10条
        "siblings_comparison": [{
            "point_code": s["point_code"],
            "latest_cumulative": s["cumulative_change"],
            "date": str(s["measured_at"])
        } for s in siblings[:10]],
        "findings": findings,
        "recommendation": (
            "若 findings 中存在 critical，建议优先排查数据录入错误（小数点位、单位混淆、正负号）；"
            "若数据无误，则通过 POST /api/gn/manual-review 标记为 confirmed_anomaly。"
        )
    }


# ============================================================
# ③ 传感器编号逆向解析
# ============================================================

async def analyze_sensor_patterns():
    """
    分析支撑轴力 raw_sensor 的列名模式，尝试提取传感器编号。
    """
    now = datetime.now().isoformat()

    # 获取所有 raw_sensor 记录的 raw_column_name
    cols = await db.fetch(
        "SELECT DISTINCT raw_column_name, source_file_name, source_sheet_name, "
        "COUNT(*) AS cnt "
        "FROM gn_monitoring_reading "
        "WHERE reading_type = 'raw_sensor' AND raw_column_name IS NOT NULL "
        "GROUP BY raw_column_name, source_file_name, source_sheet_name "
        "ORDER BY cnt DESC LIMIT 50"
    )

    # 按来源分组
    by_file = {}
    for c in cols:
        key = c["source_file_name"] or "unknown"
        if key not in by_file:
            by_file[key] = []
        by_file[key].append({
            "column": c["raw_column_name"],
            "sheet": c["source_sheet_name"],
            "count": c["cnt"]
        })

    # 尝试用正则提取传感器编号
    import re
    patterns = [
        (r'[传感][感器]+\s*(\d+)', '传感器N'),
        (r'[Ss](\d+)', 'S{N}'),
        (r'第?(\d+)[路组个]', '第N路'),
        (r'(\d+)#', '{N}#'),
        (r'[Zz][Cc][Ll][-_]?(\d+)', 'ZCL-N'),
    ]

    matched = {}
    unmatched = []
    for c in cols:
        col = c["raw_column_name"] or ""
        found = False
        for pat, label in patterns:
            m = re.search(pat, col)
            if m:
                sensor_no = m.group(1)
                if label not in matched:
                    matched[label] = []
                matched[label].append({
                    "column": col,
                    "sensor_no": sensor_no,
                    "file": c["source_file_name"],
                    "sheet": c["source_sheet_name"],
                    "count": c["cnt"]
                })
                found = True
                break
        if not found:
            unmatched.append({"column": col, "count": c["cnt"], "file": c["source_file_name"]})

    return {
        "generated_at": now,
        "total_columns": len(cols),
        "matched_count": sum(len(v) for v in matched.values()),
        "unmatched_count": len(unmatched),
        "matched_by_pattern": {k: v[:10] for k, v in matched.items()},
        "unmatched_columns": unmatched[:20],
        "recommendation": (
            "若 matched_by_pattern 中识别到了传感器编号，可将匹配规则应用到 parser；"
            "若 unmatched_columns 仍较多，需要监测方提供列名命名规则。"
        )
    }


# ============================================================
# ④ 测点坐标清单 + 批量录入
# ============================================================

async def get_points_needing_coords():
    """
    返回缺少空间坐标的测点清单。
    """
    # 检查 gn_monitoring_point 是否有坐标字段
    # 如果没有 x/y/z 列，先尝试查询
    has_coords_col = True
    try:
        await db.fetch_val("SELECT x FROM gn_monitoring_point LIMIT 1")
    except:
        has_coords_col = False

    if not has_coords_col:
        return {
            "generated_at": datetime.now().isoformat(),
            "status": "no_coordinate_columns",
            "message": "gn_monitoring_point 表尚无坐标字段 (x/y/z)，需先执行 ALTER TABLE 添加列。",
            "ddl_suggestion": (
                "ALTER TABLE gn_monitoring_point ADD COLUMN IF NOT EXISTS x DOUBLE PRECISION; "
                "ALTER TABLE gn_monitoring_point ADD COLUMN IF NOT EXISTS y DOUBLE PRECISION; "
                "ALTER TABLE gn_monitoring_point ADD COLUMN IF NOT EXISTS z DOUBLE PRECISION; "
                "ALTER TABLE gn_monitoring_point ADD COLUMN IF NOT EXISTS coord_source TEXT;"
            )
        }

    # 查询无坐标的测点
    points = await db.fetch(
        "SELECT point_code, point_name, monitoring_item, monitoring_object, side, part, "
        "first_seen_date, last_seen_date "
        "FROM gn_monitoring_point "
        "WHERE x IS NULL OR y IS NULL "
        "ORDER BY monitoring_item, point_code "
        "LIMIT 200"
    )
    total_missing = await db.fetch_val(
        "SELECT count(*) FROM gn_monitoring_point WHERE x IS NULL OR y IS NULL"
    ) or 0

    return {
        "generated_at": datetime.now().isoformat(),
        "total_points": await db.fetch_val("SELECT count(*) FROM gn_monitoring_point") or 0,
        "missing_coords": total_missing,
        "points": [dict(r) for r in points[:100]],
        "note": "通过 POST /api/gn/points/coordinates 批量提交坐标。payload: [{\"point_code\":\"DB01\",\"x\":123.4,\"y\":567.8,\"z\":0}]"
    }


async def batch_upsert_coords(payload: list):
    """
    批量更新测点坐标。
    payload: [{"point_code": "DB01", "x": 123.4, "y": 567.8, "z": 0}, ...]
    """
    updated = 0
    errors = []
    for item in payload:
        try:
            await db.execute(
                "UPDATE gn_monitoring_point SET x = %s, y = %s, z = %s, coord_source = %s "
                "WHERE point_code = %s",
                (item.get("x"), item.get("y"), item.get("z"),
                 item.get("coord_source", "manual"), item["point_code"])
            )
            updated += 1
        except Exception as e:
            errors.append({"point_code": item.get("point_code"), "error": str(e)})

    return {
        "updated": updated,
        "errors": errors,
        "message": f"成功更新 {updated} 个测点坐标"
    }
