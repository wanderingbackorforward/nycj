"""通用测点诊断服务 v2

6-阶段诊断管道：
  Phase 0: 数据可靠性分级 (Tier A/B/C/D)
  Phase 1: 趋势分析 (线性回归斜率/方向/加速度)
  Phase 2: 阈值临近度 (exceed_ratio + 距阈值余量)
  Phase 3: 速率分析 (真实日变化率)
  Phase 4: 模式分类 (突跳/渐变/稳定/波动/恢复)
  Phase 5: 兄弟对比 (同期百分位 + 趋势偏离)
  Phase 6: 综合研判 (diagnosis_category + 建议)

接口不变: GET /api/gn/diagnose/{point_code}
"""
from .. import db, config
from datetime import datetime, date
import json
import math


# ── 纯 Python 线性回归 ──────────────────────────────────
def _linreg(xs, ys):
    """返回 (slope, intercept, r_squared)。xs/ys 等长且 len >= 2。"""
    n = len(xs)
    if n < 2:
        return 0.0, (ys[0] if ys else 0.0), 0.0
    sum_x = sum(xs)
    sum_y = sum(ys)
    sum_xy = sum(x * y for x, y in zip(xs, ys))
    sum_x2 = sum(x * x for x in xs)
    sum_y2 = sum(y * y for y in ys)
    denom = n * sum_x2 - sum_x * sum_x
    if denom == 0:
        return 0.0, sum_y / n, 0.0
    slope = (n * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - slope * sum_x) / n
    # r_squared
    y_mean = sum_y / n
    ss_tot = sum((y - y_mean) ** 2 for y in ys)
    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys))
    r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
    return slope, intercept, r2


# ── 诊断主函数 ──────────────────────────────────────────
async def diagnose_point(point_code: str):
    now = datetime.now().isoformat()

    # ── 测点基本信息 ──
    point = await db.fetch_one(
        "SELECT * FROM gn_monitoring_point WHERE point_code = %s", (point_code,)
    )
    if not point:
        return None

    # ── 全部读数（排除 raw_evidence，诊断只用 analysis_primary + aggregate_summary）──
    readings = await db.fetch(
        "SELECT measured_at, current_value, cumulative_change, daily_change, "
        "design_limit, initial_value, last_value, unit, data_quality, status_code, "
        "review_level, reading_type, reading_role, "
        "source_file_name, source_sheet_name, row_index, raw_row_json "
        "FROM gn_monitoring_reading "
        "WHERE point_code = %s AND reading_role IN ('analysis_primary', 'aggregate_summary') "
        "ORDER BY measured_at",
        (point_code,)
    )

    if not readings:
        return {
            "generated_at": now,
            "point_code": point_code,
            "error": "该测点无可用分析读数",
            "diagnosis_category": "no_data",
            "diagnosis_label_cn": "无数据"
        }

    # ── 证据 ──
    evidence = await db.fetch(
        "SELECT e.* FROM gn_extraction_evidence e "
        "JOIN gn_monitoring_reading r ON e.related_key = r.reading_id::text "
        "WHERE r.point_code = %s "
        "ORDER BY r.measured_at DESC LIMIT 20",
        (point_code,)
    )

    # ══════════════════════════════════════════════════════
    # Phase 0: 数据可靠性分级
    # ══════════════════════════════════════════════════════
    has_cc = [r for r in readings if r.get("cumulative_change") is not None]
    has_cv = [r for r in readings if r.get("current_value") is not None]
    has_dc = [r for r in readings if r.get("daily_change") is not None]
    dl_raw = point.get("design_limit")
    has_dl = dl_raw is not None and dl_raw != 0

    n_cc = len(has_cc)
    n_total = len(readings)

    if n_cc >= 5 and has_dl:
        data_tier = "A"
        tier_label = "全量诊断可用"
    elif n_cc >= 3:
        data_tier = "B"
        tier_label = "可趋势分析，阈值判断受限"
    elif n_cc >= 1 or len(has_cv) >= 1:
        data_tier = "C"
        tier_label = "仅有零星数值，诊断高度受限"
    else:
        data_tier = "D"
        tier_label = "无数值可用，无法诊断"

    findings = []
    metrics = {}

    # ══════════════════════════════════════════════════════
    # Phase 1: 趋势分析
    # ══════════════════════════════════════════════════════
    trend_slope = 0.0
    trend_r2 = 0.0
    trend_direction = "unknown"
    trend_label = "无法判断"

    if n_cc >= 3:
        # 用日期序数做 x
        base_date = None
        xs = []
        ys = []
        for r in has_cc:
            d = r["measured_at"]
            if isinstance(d, str):
                d = datetime.strptime(d[:10], "%Y-%m-%d").date()
            if base_date is None:
                base_date = d
            day_idx = (d - base_date).days
            xs.append(day_idx)
            ys.append(float(r["cumulative_change"]))

        if len(xs) >= 3:
            slope, intercept, r2 = _linreg(xs, ys)
            trend_slope = slope
            trend_r2 = r2

            # 方向判断
            abs_slope = abs(slope)
            total_range = max(ys) - min(ys) if len(ys) > 1 else 1.0
            # 用斜率占全距的比例判断方向强度
            if abs_slope < 0.001 or (total_range > 0 and abs_slope * 30 / max(total_range, 0.01) < 0.05):
                trend_direction = "stable"
                trend_label = "趋势稳定"
            elif slope > 0:
                trend_direction = "worsening"
                trend_label = "持续恶化" if abs_slope * 30 > total_range * 0.15 else "缓慢恶化"
            else:
                trend_direction = "improving"
                trend_label = "持续好转" if abs_slope * 30 > total_range * 0.15 else "缓慢好转"

            metrics["trend_slope_per_day"] = round(slope, 4)
            metrics["trend_r_squared"] = round(r2, 4)
            metrics["trend_direction"] = trend_direction

            # 加速度：把数据分成前后两半比较斜率
            if len(xs) >= 6:
                mid = len(xs) // 2
                s1, _, _ = _linreg(xs[:mid], ys[:mid])
                s2, _, _ = _linreg(xs[mid:], ys[mid:])
                metrics["trend_acceleration"] = round(s2 - s1, 4)
                if trend_direction == "worsening" and s2 > s1 * 1.5:
                    findings.append({
                        "level": "critical",
                        "detail": f"恶化趋势正在加速：后半段速率 ({s2:.3f}/d) 明显高于前半段 ({s1:.3f}/d)，需高度关注。"
                    })
                elif trend_direction == "worsening" and s2 > s1:
                    findings.append({
                        "level": "warning",
                        "detail": f"恶化趋势持续：后半段速率 ({s2:.3f}/d) 略高于前半段 ({s1:.3f}/d)。"
                    })

    # ══════════════════════════════════════════════════════
    # Phase 2: 阈值临近度
    # ══════════════════════════════════════════════════════
    if has_dl and n_cc >= 1:
        latest_cc = float(has_cc[-1]["cumulative_change"])
        all_cc = [float(r["cumulative_change"]) for r in has_cc]
        max_cc = max(all_cc, key=abs)
        dl = float(dl_raw)

        latest_ratio = abs(latest_cc) / abs(dl) if dl != 0 else 0
        max_ratio = abs(max_cc) / abs(dl) if dl != 0 else 0
        margin = abs(dl) - abs(latest_cc)  # 正数=还有余量

        metrics["exceed_ratio_latest"] = round(latest_ratio, 3)
        metrics["exceed_ratio_max"] = round(max_ratio, 3)
        metrics["threshold_margin"] = round(margin, 3)

        if latest_ratio >= 2.0:
            findings.append({
                "level": "critical",
                "detail": f"最新累计变化 {latest_cc:.1f} 为设计限值 {dl} 的 {latest_ratio:.1f} 倍，严重超限。"
            })
        elif latest_ratio >= 1.5:
            findings.append({
                "level": "critical",
                "detail": f"累计变化 {latest_cc:.1f} 已达设计限值 {dl} 的 {latest_ratio:.1f} 倍，超限明显。"
                + (" 且趋势仍恶化。" if trend_direction == "worsening" else "")
            })
        elif latest_ratio >= 1.0:
            label = "恶化中" if trend_direction == "worsening" else ("好转中" if trend_direction == "improving" else "趋势稳定")
            findings.append({
                "level": "warning",
                "detail": f"累计变化已超设计限值（{latest_ratio:.1f} 倍），当前{label}。不等于正式报警但需要关注。"
            })
        elif latest_ratio >= 0.7 and trend_direction == "worsening":
            findings.append({
                "level": "warning",
                "detail": f"累计变化接近设计限值（{latest_ratio:.1f} 倍），且趋势恶化。距限值余量 {margin:.1f}。"
            })

        # 如果历史上曾严重超限但现在恢复了
        if max_ratio >= 1.5 and latest_ratio < 1.0 and trend_direction == "improving":
            findings.append({
                "level": "info",
                "detail": f"历史最大超限 {max_ratio:.1f} 倍，但当前已回落至 {latest_ratio:.1f} 倍，趋势好转。建议持续观察确认。"
            })

    # ══════════════════════════════════════════════════════
    # Phase 3: 速率分析（使用真实 daily_change）
    # ══════════════════════════════════════════════════════
    if len(has_dc) >= 2:
        dc_vals = [abs(float(r["daily_change"])) for r in has_dc if r.get("daily_change") is not None]
        if dc_vals:
            dc_max = max(dc_vals)
            dc_mean = sum(dc_vals) / len(dc_vals)
            metrics["daily_change_max"] = round(dc_max, 3)
            metrics["daily_change_mean"] = round(dc_mean, 3)

            if has_dl:
                dl = float(dl_raw)
                if dc_max > abs(dl) * 0.3:
                    findings.append({
                        "level": "critical",
                        "detail": f"单日变化速率异常：最大日变化 {dc_max:.1f} 超过设计限值 {dl} 的 30%。可能存在数据录入错误或真实险情。"
                    })
                elif dc_max > abs(dl) * 0.15:
                    findings.append({
                        "level": "warning",
                        "detail": f"日变化速率偏高：最大日变化 {dc_max:.1f} 超过设计限值 {dl} 的 15%。"
                    })

    # ══════════════════════════════════════════════════════
    # Phase 4: 模式分类
    # ══════════════════════════════════════════════════════
    pattern = "unknown"
    pattern_label = "无法分类"

    if n_cc >= 3:
        all_cc = [float(r["cumulative_change"]) for r in has_cc]
        total_span = max(all_cc) - min(all_cc)
        max_step = 0
        step_dates = []
        for i in range(1, len(all_cc)):
            step = abs(all_cc[i] - all_cc[i-1])
            if step > max_step:
                max_step = step
        # 判断模式
        if total_span < 0.01:
            pattern = "flat"
            pattern_label = "无变化"
        elif max_step > total_span * 0.6 and len(all_cc) >= 3:
            pattern = "sudden_jump"
            pattern_label = "突发跳变"
            findings.append({
                "level": "critical",
                "detail": f"检测到突发跳变模式：单次变化 {max_step:.1f} 占总变化幅度 {total_span:.1f} 的 {max_step/total_span*100:.0f}%。强烈建议核对原始记录。"
            })
        elif trend_r2 > 0.7:
            if abs(trend_slope) * 30 > total_span * 0.1:
                pattern = "steady_drift"
                pattern_label = "持续渐变"
            else:
                pattern = "stable_drift"
                pattern_label = "轻微漂移"
        elif trend_r2 < 0.3 and total_span > 0.1:
            pattern = "erratic"
            pattern_label = "不规则波动"
            std = (sum((v - sum(all_cc)/len(all_cc))**2 for v in all_cc) / len(all_cc)) ** 0.5
            if total_span > 0:
                cv = std / (abs(sum(all_cc))/len(all_cc)) if sum(all_cc) != 0 else 0
                metrics["coefficient_of_variation"] = round(cv, 3)
        else:
            pattern = "mixed"
            pattern_label = "混合模式"

        metrics["pattern"] = pattern
        metrics["pattern_label_cn"] = pattern_label
        metrics["total_change_span"] = round(total_span, 3)
        metrics["max_single_step"] = round(max_step, 3)

    # ══════════════════════════════════════════════════════
    # Phase 5: 兄弟对比（改进版）
    # ══════════════════════════════════════════════════════
    item = point.get("monitoring_item", "")
    obj = point.get("monitoring_object", "")

    if item and obj and n_cc >= 1:
        # 拿同期同类型所有点的最新累计变化
        siblings = await db.fetch(
            "SELECT point_code, MAX(ABS(COALESCE(cumulative_change, 0))) as max_abs_cc "
            "FROM gn_monitoring_reading "
            "WHERE monitoring_item = %s AND monitoring_object = %s "
            "AND point_code != %s "
            "AND cumulative_change IS NOT NULL "
            "GROUP BY point_code "
            "ORDER BY max_abs_cc DESC",
            (item, obj, point_code)
        )

        if siblings:
            sib_vals = [float(s["max_abs_cc"]) for s in siblings]
            this_val = max(abs(float(r["cumulative_change"])) for r in has_cc)

            # 百分位排名
            rank = sum(1 for v in sib_vals if v >= this_val)
            total_sib = len(sib_vals)
            percentile = round(rank / total_sib * 100, 1) if total_sib > 0 else 0
            sib_mean = sum(sib_vals) / total_sib
            sib_std = (sum((v - sib_mean)**2 for v in sib_vals) / total_sib) ** 0.5 if total_sib > 1 else 0

            metrics["sibling_count"] = total_sib
            metrics["sibling_percentile"] = percentile  # 越小越异常
            metrics["sibling_mean"] = round(sib_mean, 3)
            metrics["sibling_std"] = round(sib_std, 3)
            metrics["z_score_vs_siblings"] = round((this_val - sib_mean) / sib_std, 2) if sib_std > 0 else 0

            z = metrics["z_score_vs_siblings"]
            if z > 5:
                findings.append({
                    "level": "critical",
                    "detail": f"该测点偏离群体极显著（Z={z:.1f}，百分位 {percentile}%），为同类 {total_sib} 个点中最高。请优先排查。"
                })
            elif z > 3:
                findings.append({
                    "level": "warning",
                    "detail": f"该测点显著偏离同类群体（Z={z:.1f}，百分位 {percentile}%）。建议对比原始记录确认。"
                })

    # ══════════════════════════════════════════════════════
    # 数据完整性检查
    # ══════════════════════════════════════════════════════
    # 日期覆盖
    unique_dates = set()
    for r in readings:
        d = r["measured_at"]
        if isinstance(d, str):
            d = d[:10]
        unique_dates.add(str(d))
    metrics["unique_dates"] = len(unique_dates)
    metrics["reading_count_analysis"] = n_total
    metrics["readings_with_cc"] = n_cc
    metrics["readings_with_cv"] = len(has_cv)
    metrics["readings_with_dc"] = len(has_dc)

    if data_tier == "D":
        findings.append({
            "level": "warning",
            "detail": "该测点缺少累计变化和当前值数据，无法进行定量诊断。请检查原始Excel数据提取是否完整。"
        })
    elif data_tier == "C":
        findings.append({
            "level": "info",
            "detail": f"该测点数据稀疏（{n_cc}条累计变化/{n_total}条读数），仅有当前值，定量诊断受限。建议人工确认累计变化计算方法。"
        })

    # review_level 标记
    severe_count = sum(1 for r in readings if r.get("review_level") == "重点复核")
    if severe_count > 0:
        findings.append({
            "level": "info",
            "detail": f"系统已标记 {severe_count} 条重点复核记录。"
        })
    metrics["severe_review_count"] = severe_count

    # ══════════════════════════════════════════════════════
    # Phase 6: 综合研判
    # ══════════════════════════════════════════════════════
    has_critical = any(f["level"] == "critical" for f in findings)
    has_warning = any(f["level"] == "warning" for f in findings)
    has_info = any(f["level"] == "info" for f in findings)

    # 诊断分类
    if data_tier == "D":
        diagnosis_category = "data_insufficient"
        diagnosis_label = "数据不足，无法诊断"
    elif data_tier == "C":
        diagnosis_category = "limited_diagnosis"
        diagnosis_label = "数据稀疏，诊断有限"
    elif has_critical:
        if trend_direction == "worsening":
            diagnosis_category = "severe_worsening"
            diagnosis_label = "严重异常且恶化"
        else:
            diagnosis_category = "severe_anomaly"
            diagnosis_label = "严重异常"
    elif has_warning:
        if trend_direction == "worsening":
            diagnosis_category = "concerning_worsening"
            diagnosis_label = "超限且恶化"
        else:
            diagnosis_category = "concerning"
            diagnosis_label = "需关注"
    elif trend_direction == "worsening":
        diagnosis_category = "watch_worsening"
        diagnosis_label = "未超限但恶化"
    elif data_tier == "B" and not has_dl:
        diagnosis_category = "no_threshold"
        diagnosis_label = "缺少设计限值，无法判断超限"
    else:
        diagnosis_category = "normal"
        diagnosis_label = "正常"

    # ── 生成建议 ──
    if diagnosis_category in ("severe_worsening", "severe_anomaly"):
        recommendation = (
            f"【{point_code}】判定为'{diagnosis_label}'。"
            "建议：(1) 优先核对原始Excel中该点数值的小数点位、正负号和单位；"
            "(2) 排除数据录入错误后，通知现场监测工程师确认是否真实异常；"
            "(3) 若确认真实异常，通过 POST /api/gn/manual-review 提交人工复核结论。"
        )
    elif diagnosis_category in ("concerning_worsening", "concerning"):
        recommendation = (
            f"【{point_code}】判定为'{diagnosis_label}'。"
            "建议：(1) 持续关注趋势变化；(2) 核对最近一周原始报表；"
            "(3) 不等于正式报警，但需列入日常巡查清单。"
        )
    elif diagnosis_category == "watch_worsening":
        recommendation = (
            f"【{point_code}】判定为'{diagnosis_label}'。"
            "当前未超设计限值但趋势持续恶化，建议提高监测频率，密切观察。"
        )
    elif diagnosis_category in ("data_insufficient", "limited_diagnosis"):
        recommendation = (
            f"【{point_code}】判定为'{diagnosis_label}'。"
            "无法自动诊断。建议：(1) 补充累计变化计算；(2) 人工查看原始Excel对应行列确认数值是否已录入。"
        )
    elif diagnosis_category == "no_threshold":
        recommendation = (
            f"【{point_code}】判定为'{diagnosis_label}'。"
            "趋势可分析但因缺少设计限值无法判断超限。建议从监测方案中补充正式阈值。"
        )
    else:
        recommendation = f"【{point_code}】判定为'{diagnosis_label}'。数据趋势正常，建议持续按计划监测。"

    # ── 返回 ──
    return {
        "generated_at": now,
        "point_code": point_code,
        "diagnosis_category": diagnosis_category,
        "diagnosis_label_cn": diagnosis_label,
        "data_tier": data_tier,
        "data_tier_label_cn": tier_label,
        "point_info": {
            "monitoring_item": point.get("monitoring_item"),
            "monitoring_object": point.get("monitoring_object"),
            "side": point.get("side", ""),
            "part": point.get("part", ""),
            "unit": point.get("unit", ""),
            "design_limit": point.get("design_limit"),
        },
        "reading_count": n_total,
        "evidence_count": len(evidence),
        "date_range": {
            "from": str(readings[0]["measured_at"])[:10] if readings else "N/A",
            "to": str(readings[-1]["measured_at"])[:10] if readings else "N/A"
        },
        "metrics": metrics,
        "findings": findings if findings else [{
            "level": "info",
            "detail": "未发现明显异常，数据表现符合预期。"
        }],
        "recommendation": recommendation,
        "readings": [{
            "date": str(r["measured_at"])[:10],
            "current_value": r.get("current_value"),
            "cumulative_change": r.get("cumulative_change"),
            "daily_change": r.get("daily_change"),
            "design_limit": r.get("design_limit"),
            "status": r.get("status_code"),
            "source": f"{r.get('source_file_name','')}/{r.get('source_sheet_name','')} row {r.get('row_index','')}"
        } for r in readings[-30:]],
        "siblings_comparison": siblings[:10] if (item and obj and n_cc >= 1) else [],
    }
