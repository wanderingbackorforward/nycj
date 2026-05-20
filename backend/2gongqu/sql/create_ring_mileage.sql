SET search_path TO shield_area2, public;

-- 环号里程配置表
DROP TABLE IF EXISTS shield_ring_mileage_config CASCADE;
CREATE TABLE shield_ring_mileage_config (
    config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    starting_ring_no INTEGER NOT NULL DEFAULT 1717,
    starting_mileage_m DOUBLE PRECISION,
    starting_chainage TEXT,
    ring_width_m DOUBLE PRECISION NOT NULL DEFAULT 1.2,
    direction TEXT NOT NULL DEFAULT 'increasing' CHECK (direction IN ('increasing', 'decreasing')),
    updated_by TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);
COMMENT ON TABLE shield_ring_mileage_config IS '环号-里程映射配置。输入起始环里程+管片宽度后,系统自动推算全部环号里程。';

-- 插入默认配置(环宽1.2m,里程待填)
INSERT INTO shield_ring_mileage_config (starting_ring_no, ring_width_m, notes)
VALUES (1717, 1.2, '待补充起始里程。管片宽度默认1.2m(标准地铁盾构),如实际不同请更新。');

-- 创建自动推算出全部环里程的 function
CREATE OR REPLACE FUNCTION shield_area2.fn_calc_ring_mileage()
RETURNS TABLE(ring_no INTEGER, chainage TEXT, mileage_m DOUBLE PRECISION) AS 
DECLARE
    cfg RECORD;
BEGIN
    SELECT * INTO cfg FROM shield_ring_mileage_config ORDER BY updated_at DESC LIMIT 1;
    IF cfg IS NULL OR cfg.starting_mileage_m IS NULL THEN
        RETURN QUERY SELECT r.ring_no, NULL::TEXT, NULL::DOUBLE PRECISION
                     FROM shield_tunneling_ring r ORDER BY r.ring_no;
        RETURN;
    END IF;

    RETURN QUERY
    SELECT r.ring_no,
           CASE WHEN cfg.starting_chainage IS NOT NULL
                THEN cfg.starting_chainage
                ELSE 'DK' || TRIM(TO_CHAR(cfg.starting_mileage_m / 1000, '99990.000'))
           END
           || '+' ||
           TRIM(TO_CHAR((cfg.starting_mileage_m + (r.ring_no - cfg.starting_ring_no) * cfg.ring_width_m)::numeric, '99990.000'))
           AS chainage,
           cfg.starting_mileage_m + (r.ring_no - cfg.starting_ring_no) * cfg.ring_width_m AS mileage_m
    FROM shield_tunneling_ring r
    ORDER BY r.ring_no;
END;
 LANGUAGE plpgsql;

-- 也可以用 function 结果直接 UPDATE ring 表
CREATE OR REPLACE FUNCTION shield_area2.fn_apply_ring_mileage()
RETURNS INTEGER AS 
DECLARE
    cfg RECORD;
    updated_count INTEGER;
BEGIN
    SELECT * INTO cfg FROM shield_ring_mileage_config ORDER BY updated_at DESC LIMIT 1;
    IF cfg IS NULL OR cfg.starting_mileage_m IS NULL THEN
        RETURN 0;
    END IF;

    UPDATE shield_tunneling_ring r SET
        mileage = cfg.starting_mileage_m + (r.ring_no - cfg.starting_ring_no) * cfg.ring_width_m,
        chainage = COALESCE(cfg.starting_chainage, 'DK')
                   || TRIM(TO_CHAR((cfg.starting_mileage_m / 1000)::numeric, '99990.000'))
                   || '+' ||
                   TRIM(TO_CHAR(((cfg.starting_mileage_m + (r.ring_no - cfg.starting_ring_no) * cfg.ring_width_m))::numeric, '99990.000'))
    WHERE r.mileage IS NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
 LANGUAGE plpgsql;

SELECT 'ring_mileage_config created, default ring_width=1.2m, start ring=1717' AS status;
