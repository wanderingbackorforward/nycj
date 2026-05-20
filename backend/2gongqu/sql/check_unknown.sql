SET search_path TO shield_area2, public;
-- 哪些监测项缺阈值导致仍为 unknown
SELECT monitoring_item, COUNT(*) as n
FROM shield_monitoring_reading
WHERE reading_role='analysis_primary' AND status_code='unknown'
GROUP BY monitoring_item ORDER BY n DESC;
