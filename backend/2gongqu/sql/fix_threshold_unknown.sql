SET search_path TO shield_area2, public;

-- ============================================================
-- Fix 1: 为仅含 daily_change 的监测项补充阈值
-- 这些项的 cumulative_change 为空，但 daily_change 有数据
-- 规则: rate_warning = P95(ABS(daily_change))
--       rate_alarm = P99(ABS(daily_change))
-- ============================================================
INSERT INTO shield_threshold_config (target_type, monitoring_item, design_limit_upper, warning_threshold, alarm_threshold, rate_warning, rate_alarm, derivation_method, sample_count, confidence, notes)
SELECT
    'monitoring',
    d.monitoring_item,
    NULL,  -- no cumulative limit available
    NULL,
    NULL,
    d.p95_abs_daily AS rate_warning,
    d.p99_abs_daily AS rate_alarm,
    'percentile_p95_p99_daily_only',
    d.n,
    'medium',
    '仅日变化率推导(无累计变化数据): rate_warning=P95, rate_alarm=P99'
FROM (
    SELECT monitoring_item, COUNT(*) AS n,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ABS(daily_change))::numeric, 3) AS p95_abs_daily,
        ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ABS(daily_change))::numeric, 3) AS p99_abs_daily
    FROM shield_monitoring_reading
    WHERE daily_change IS NOT NULL
      AND reading_role = 'analysis_primary'
      AND cumulative_change IS NULL  -- only items without cumulative data
    GROUP BY monitoring_item
) d
WHERE NOT EXISTS (
    SELECT 1 FROM shield_threshold_config t
    WHERE t.target_type = 'monitoring' AND t.monitoring_item = d.monitoring_item
);

-- ============================================================
-- Fix 2: 为无累计变化但有日变化率的读数重算 status_code
-- 规则: ABS(daily_change) >= rate_alarm → alarm
--       ABS(daily_change) >= rate_warning → warning
--       ELSE normal
-- ============================================================
UPDATE shield_monitoring_reading r SET
    status_code = sub.new_status,
    unknown_reason = sub.new_reason,
    status_reason = sub.new_reason
FROM (
    SELECT
        r.reading_id,
        CASE
            WHEN ABS(r.daily_change) >= t.rate_alarm THEN 'alarm'
            WHEN ABS(r.daily_change) >= t.rate_warning THEN 'warning'
            ELSE 'normal'
        END AS new_status,
        CASE
            WHEN t.config_id IS NULL THEN 'missing_threshold'
            WHEN ABS(r.daily_change) >= t.rate_alarm THEN 'exceed_rate_alarm_p99'
            WHEN ABS(r.daily_change) >= t.rate_warning THEN 'exceed_rate_warning_p95'
            ELSE NULL
        END AS new_reason
    FROM shield_monitoring_reading r
    LEFT JOIN shield_threshold_config t
        ON t.target_type = 'monitoring' AND t.monitoring_item = r.monitoring_item
    WHERE r.reading_role = 'analysis_primary'
      AND r.cumulative_change IS NULL
      AND r.daily_change IS NOT NULL
      AND r.status_code = 'unknown'
) sub
WHERE r.reading_id = sub.reading_id;

-- ============================================================
-- Fix 3: 重算 aggregate_summary 的 status_code (标记为 'derived_summary' 而非 unknown)
-- ============================================================
UPDATE shield_monitoring_reading SET
    status_code = 'derived_summary',
    unknown_reason = 'aggregate_summary_no_threshold',
    status_reason = '汇总数据不参与阈值判定'
WHERE reading_role = 'aggregate_summary' AND status_code = 'unknown';

-- ============================================================
-- Final check
-- ============================================================
SELECT '=== Final monitoring status ALL ===' AS step;
SELECT status_code, COUNT(*) FROM shield_monitoring_reading GROUP BY status_code ORDER BY 2 DESC;

SELECT '=== Final monitoring status analysis_primary ===' AS step;
SELECT status_code, COUNT(*) FROM shield_monitoring_reading WHERE reading_role='analysis_primary' GROUP BY status_code ORDER BY 2 DESC;

SELECT '=== Final tunneling status ===' AS step;
SELECT status_code, COUNT(*) FROM shield_tunneling_parameter WHERE value IS NOT NULL GROUP BY status_code ORDER BY 2 DESC;

SELECT '=== Threshold config ===' AS step;
SELECT target_type, COUNT(*) FROM shield_threshold_config GROUP BY target_type;

SELECT '=== Still unknown (should be small) ===' AS step;
SELECT monitoring_item, COUNT(*) as n FROM shield_monitoring_reading
WHERE reading_role='analysis_primary' AND status_code='unknown'
GROUP BY monitoring_item ORDER BY n DESC;
