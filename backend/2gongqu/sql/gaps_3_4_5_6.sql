SET search_path TO shield_area2, public;

-- ============================================================
-- Gap 5: 姿态偏差配置表
-- ============================================================
DROP TABLE IF EXISTS shield_posture_deviation_config CASCADE;
CREATE TABLE shield_posture_deviation_config (
    config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deviation_type TEXT NOT NULL CHECK (deviation_type IN (
        'horizontal_cutter', 'vertical_cutter',
        'horizontal_tail', 'vertical_tail',
        'roll', 'pitch'
    )),
    deviation_name_cn TEXT NOT NULL,
    design_limit_mm DOUBLE PRECISION,
    warning_limit_mm DOUBLE PRECISION,
    alarm_limit_mm DOUBLE PRECISION,
    direction TEXT DEFAULT 'both' CHECK (direction IN ('both','positive','negative')),
    source TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE shield_posture_deviation_config IS '盾构姿态允许偏差配置。当前仅有统计P05/P95阈值,正式设计限值待补充。';

-- 预插入6种姿态偏差类型(值为空,待填)
INSERT INTO shield_posture_deviation_config (deviation_type, deviation_name_cn, source, notes) VALUES
('horizontal_cutter', '切口水平偏差', 'pending', '待从设备规范/设计文件补充'),
('vertical_cutter',   '切口垂直偏差', 'pending', '待从设备规范/设计文件补充'),
('horizontal_tail',   '盾尾水平偏差', 'pending', '待从设备规范/设计文件补充'),
('vertical_tail',     '盾尾垂直偏差', 'pending', '待从设备规范/设计文件补充'),
('roll',              '滚动角',       'pending', '待从设备规范/设计文件补充'),
('pitch',             '俯仰角',       'pending', '待从设备规范/设计文件补充');

-- ============================================================
-- Gap 4: 风险源台账表
-- ============================================================
DROP TABLE IF EXISTS shield_risk_source CASCADE;
CREATE TABLE shield_risk_source (
    risk_source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    risk_category TEXT CHECK (risk_category IN (
        'building','pipeline','existing_tunnel','bridge','river','railway','highway','other'
    )),
    risk_level TEXT CHECK (risk_level IN ('1','2','3','4')),
    start_mileage_m DOUBLE PRECISION,
    end_mileage_m DOUBLE PRECISION,
    start_ring_no INTEGER,
    end_ring_no INTEGER,
    offset_left_m DOUBLE PRECISION,
    offset_right_m DOUBLE PRECISION,
    control_surface_settlement_mm DOUBLE PRECISION,
    control_underground_settlement_mm DOUBLE PRECISION,
    control_convergence_mm DOUBLE PRECISION,
    monitoring_requirements TEXT,
    emergency_measures TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('pending','active','passed','monitoring')),
    crossing_date_start DATE,
    crossing_date_end DATE,
    source_document TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE shield_risk_source IS '区间风险源台账。需从项目安质部/风险评估报告补充。';

-- ============================================================
-- Gap 6: 泥水环流参数表
-- ============================================================
DROP TABLE IF EXISTS shield_slurry_circulation CASCADE;
CREATE TABLE shield_slurry_circulation (
    circulation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ring_no INTEGER,
    measured_at TIMESTAMPTZ,
    inlet_flow_lpm DOUBLE PRECISION,
    outlet_flow_lpm DOUBLE PRECISION,
    inlet_density_gcm3 DOUBLE PRECISION,
    outlet_density_gcm3 DOUBLE PRECISION,
    inlet_pressure_bar DOUBLE PRECISION,
    outlet_pressure_bar DOUBLE PRECISION,
    air_pressure_bar DOUBLE PRECISION,
    slurry_level_m DOUBLE PRECISION,
    bypass_ratio DOUBLE PRECISION,
    status_code TEXT DEFAULT 'unknown',
    source_document_id UUID,
    source_file_name TEXT,
    source_sheet_name TEXT,
    row_index INTEGER,
    raw_row_json JSONB,
    evidence_text TEXT,
    parse_confidence TEXT DEFAULT 'medium',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE shield_slurry_circulation IS '泥水环流参数。当前仅有土压传感器数据,环流参数需从盾构PLC导出。';

-- 索引
CREATE INDEX IF NOT EXISTS idx_slurry_ring ON shield_slurry_circulation(ring_no);
CREATE INDEX IF NOT EXISTS idx_slurry_time ON shield_slurry_circulation(measured_at);

-- ============================================================
-- Gap 3: CAD 图纸坐标扩展
-- ============================================================
ALTER TABLE shield_cad_drawing ADD COLUMN IF NOT EXISTS coord_system TEXT;
ALTER TABLE shield_cad_drawing ADD COLUMN IF NOT EXISTS bbox_min_x DOUBLE PRECISION;
ALTER TABLE shield_cad_drawing ADD COLUMN IF NOT EXISTS bbox_min_y DOUBLE PRECISION;
ALTER TABLE shield_cad_drawing ADD COLUMN IF NOT EXISTS bbox_max_x DOUBLE PRECISION;
ALTER TABLE shield_cad_drawing ADD COLUMN IF NOT EXISTS bbox_max_y DOUBLE PRECISION;
ALTER TABLE shield_cad_drawing ADD COLUMN IF NOT EXISTS geojson_path TEXT;
ALTER TABLE shield_cad_drawing ADD COLUMN IF NOT EXISTS registration_status TEXT DEFAULT 'unregistered';
ALTER TABLE shield_cad_drawing ADD COLUMN IF NOT EXISTS registration_notes TEXT;

COMMENT ON COLUMN shield_cad_drawing.registration_status IS 'CAD配准状态: unregistered/partial/registered';

-- ============================================================
-- 校验
-- ============================================================
SELECT 'Gap5 posture_deviation' AS item, COUNT(*) FROM shield_posture_deviation_config
UNION ALL SELECT 'Gap4 risk_source', COUNT(*) FROM shield_risk_source
UNION ALL SELECT 'Gap6 slurry_circulation', COUNT(*) FROM shield_slurry_circulation
UNION ALL SELECT 'Gap3 cad columns', COUNT(*) FROM information_schema.columns WHERE table_name='shield_cad_drawing' AND column_name='registration_status';