SET search_path TO shield_area2, public;

-- ============================================================
-- Step 1: 创建阈值配置表
-- ============================================================
DROP TABLE IF EXISTS shield_threshold_config CASCADE;
CREATE TABLE shield_threshold_config (
    config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL CHECK (target_type IN ('monitoring', 'tunneling_parameter')),
    monitoring_item TEXT,
    parameter_group TEXT,
    parameter_name TEXT,
    parameter_name_cn TEXT,
    design_limit_lower DOUBLE PRECISION,
    design_limit_upper DOUBLE PRECISION,
    warning_threshold DOUBLE PRECISION,
    alarm_threshold DOUBLE PRECISION,
    rate_warning DOUBLE PRECISION,
    rate_alarm DOUBLE PRECISION,
    derivation_method TEXT NOT NULL DEFAULT 'percentile_p95_p99',
    sample_count INTEGER,
    confidence TEXT NOT NULL DEFAULT 'medium',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE shield_threshold_config IS '统计推导阈值配置表。derivation_method=percentile_p95_p99 表示基于历史数据分位数推导，confidence=medium 表示非设计值。';

-- ============================================================
-- Step 2: 监测阈值推导 (监测读数)
--   基于 analysis_primary 的 ABS(cumulative_change) 和 ABS(daily_change)
--   规则: design_limit = P95, warning = P95, alarm = P99
--         rate_warning = P95, rate_alarm = P99
-- ============================================================
INSERT INTO shield_threshold_config (target_type, monitoring_item, design_limit_upper, warning_threshold, alarm_threshold, rate_warning, rate_alarm, derivation_method, sample_count, confidence, notes)
SELECT
    'monitoring',
    t.monitoring_item,
    t.p95_abs_cc AS design_limit_upper,
    t.p95_abs_cc AS warning_threshold,
    t.p99_abs_cc AS alarm_threshold,
    d.p95_abs_daily AS rate_warning,
    d.p99_abs_daily AS rate_alarm,
    'percentile_p95_p99',
    t.n,
    'medium',
    '统计推导(非设计值): design_limit=warning=P95(ABS(累计变化)), alarm=P99(ABS(累计变化)), rate=P95/P99(ABS(日变化))'
FROM (
    SELECT monitoring_item, COUNT(*) AS n,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ABS(cumulative_change))::numeric, 3) AS p95_abs_cc,
        ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ABS(cumulative_change))::numeric, 3) AS p99_abs_cc
    FROM shield_monitoring_reading
    WHERE cumulative_change IS NOT NULL AND reading_role = 'analysis_primary'
    GROUP BY monitoring_item
) t
LEFT JOIN (
    SELECT monitoring_item,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ABS(daily_change))::numeric, 3) AS p95_abs_daily,
        ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ABS(daily_change))::numeric, 3) AS p99_abs_daily
    FROM shield_monitoring_reading
    WHERE daily_change IS NOT NULL AND reading_role = 'analysis_primary'
    GROUP BY monitoring_item
) d ON t.monitoring_item = d.monitoring_item;

-- ============================================================
-- Step 3: 掘进参数阈值推导
--   规则: lower_design = P05, upper_design = P95
-- ============================================================
INSERT INTO shield_threshold_config (target_type, parameter_group, parameter_name, parameter_name_cn, design_limit_lower, design_limit_upper, derivation_method, sample_count, confidence, notes)
SELECT
    'tunneling_parameter',
    parameter_group,
    parameter_name_cn AS parameter_name,
    parameter_name_cn,
    ROUND(PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY value)::numeric, 2) AS p05,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value)::numeric, 2) AS p95,
    'percentile_p05_p95',
    COUNT(*),
    'medium',
    '统计推导(非设计值): lower=P05, upper=P95'
FROM shield_tunneling_parameter
WHERE value IS NOT NULL
GROUP BY parameter_group, parameter_name_cn;

-- ============================================================
-- Step 4: 重算监测读数 status_code
--   规则: ABS(cumulative_change) >= alarm_threshold → alarm
--         ABS(cumulative_change) >= warning_threshold → warning
--         ABS(cumulative_change) >= design_limit → exceed_design_limit
--         ELSE normal
--   daily_change 同理可用于日变化率预警
-- ============================================================
UPDATE shield_monitoring_reading r SET
    status_code = sub.new_status,
    unknown_reason = sub.new_reason,
    status_reason = sub.new_reason
FROM (
    SELECT
        r.reading_id,
        CASE
            WHEN ABS(r.cumulative_change) >= t.alarm_threshold THEN 'alarm'
            WHEN ABS(r.cumulative_change) >= t.warning_threshold THEN 'warning'
            WHEN ABS(r.cumulative_change) >= t.design_limit_upper THEN 'exceed_design_limit'
            ELSE 'normal'
        END AS new_status,
        CASE
            WHEN t.config_id IS NULL THEN 'missing_threshold'
            WHEN ABS(r.cumulative_change) >= t.alarm_threshold THEN 'exceed_alarm_p99'
            WHEN ABS(r.cumulative_change) >= t.warning_threshold THEN 'exceed_warning_p95'
            WHEN ABS(r.cumulative_change) >= t.design_limit_upper THEN 'exceed_design_p95'
            ELSE NULL
        END AS new_reason
    FROM shield_monitoring_reading r
    LEFT JOIN shield_threshold_config t
        ON t.target_type = 'monitoring' AND t.monitoring_item = r.monitoring_item
    WHERE r.reading_role = 'analysis_primary'
      AND r.cumulative_change IS NOT NULL
) sub
WHERE r.reading_id = sub.reading_id;

-- ============================================================
-- Step 5: 重算掘进参数 status_code
--   规则: value < lower_design 或 value > upper_design → exceed_design_limit
--         ELSE normal
-- ============================================================
UPDATE shield_tunneling_parameter p SET
    status_code = sub.new_status,
    status_reason = sub.new_reason
FROM (
    SELECT
        p.parameter_id,
        CASE
            WHEN (t.design_limit_lower IS NOT NULL AND p.value < t.design_limit_lower)
              OR (t.design_limit_upper IS NOT NULL AND p.value > t.design_limit_upper) THEN 'exceed_design_limit'
            ELSE 'normal'
        END AS new_status,
        CASE
            WHEN t.config_id IS NULL THEN 'missing_threshold'
            WHEN p.value < t.design_limit_lower THEN 'below_p05'
            WHEN p.value > t.design_limit_upper THEN 'exceed_p95'
            ELSE NULL
        END AS new_reason
    FROM shield_tunneling_parameter p
    LEFT JOIN shield_threshold_config t
        ON t.target_type = 'tunneling_parameter'
       AND t.parameter_group = p.parameter_group
       AND t.parameter_name_cn = p.parameter_name_cn
    WHERE p.value IS NOT NULL
) sub
WHERE p.parameter_id = sub.parameter_id;

-- ============================================================
-- Step 6: 校验输出
-- ============================================================
SELECT '=== threshold_config rows ===' AS step;
SELECT target_type, COUNT(*) FROM shield_threshold_config GROUP BY target_type;

SELECT '=== monitoring status_code distribution AFTER recalculation ===' AS step;
SELECT status_code, COUNT(*) FROM shield_monitoring_reading WHERE reading_role='analysis_primary' GROUP BY status_code ORDER BY 2 DESC;

SELECT '=== tunneling_parameter status_code distribution AFTER recalculation ===' AS step;
SELECT status_code, COUNT(*) FROM shield_tunneling_parameter WHERE value IS NOT NULL GROUP BY status_code ORDER BY 2 DESC;

SELECT '=== top 5 monitoring thresholds ===' AS step;
SELECT monitoring_item, design_limit_upper, warning_threshold, alarm_threshold, rate_warning, rate_alarm, sample_count
FROM shield_threshold_config WHERE target_type='monitoring' ORDER BY sample_count DESC LIMIT 10;

SELECT '=== top 10 tunneling thresholds ===' AS step;
SELECT parameter_group, parameter_name_cn, design_limit_lower, design_limit_upper, sample_count
FROM shield_threshold_config WHERE target_type='tunneling_parameter' ORDER BY sample_count DESC LIMIT 15;
