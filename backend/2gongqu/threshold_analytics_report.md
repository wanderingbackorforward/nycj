# 2工区 智能阈值推导与高级分析 - 完成报告

## 执行时间
2026-05-17 12:00~12:10 CST

## 概述

基于 2工区 shield_area2 中 243,304 条掘进参数和 208,364 条监测读数的历史分布，
通过统计分位数方法（P05/P95/P99）自动推导阈值，并重算全量数据状态码。

## 核心成果

### 监测读数状态码重算结果

| 状态 | 全部读数 | analysis_primary |
|------|---------|-----------------|
| normal | 107,452 | 107,452 |
| derived_summary | 91,928 | 0 |
| warning | 6,889 | 6,889 |
| alarm | 1,430 | 1,430 |
| unknown | 665 | 665 |
| **合计** | **208,364** | **116,436** |

> 所有 unknown→normal/warning/alarm 转换率: 99.4%

### 掘进参数状态码重算结果

| 状态 | 数量 |
|------|------|
| normal | 231,835 |
| exceed_design_limit | 11,469 |
| **合计** | **243,304** |

### 阈值配置

- **监测阈值**: 12 个监测项
  - 5 个含累计变化阈值（P95/P99）
  - 7 个仅含日变化率阈值（P95/P99）
- **掘进参数阈值**: 34 个参数（P05/P95）
- 全部标注 derivation_method='percentile_p95_p99', confidence='medium'

### 重点监测项超限分布

| 监测项 | normal | warning | alarm | unknown |
|--------|--------|---------|-------|---------|
| 地表沉降 | 44,443 | 1,834 | 470 | 572 |
| 建筑物沉降 | 18,408 | 774 | 195 | 0 |
| 净空收敛 | 11,855 | 253 | 344 | 0 |
| 给水管线沉降 | 6,617 | 279 | 74 | 31 |
| 污水管线沉降 | 0 | 2,516 | 26 | 0 |
| 沉降 | 5,810 | 251 | 67 | 0 |

### 掘进参数超限（按参数组）

所有 33 个环号均有个别参数超 P05/P95 统计限值，集中在注浆口计数器和姿态参数。

## 新增 API 端点

| 端点 | 说明 | 状态 |
|------|------|------|
| GET /api/area2/thresholds | 查询阈值配置（支持 target_type 筛选） | ✅ |
| GET /api/area2/analytics/overview | 智能分析总览（含监测/掘进超限统计） | ✅ |

## 已有 API 更新

| 端点 | 更新内容 |
|------|---------|
| GET /api/area2/monitoring/items | 增加 normal/warning/alarm 分项计数 |
| GET /api/area2/monitoring/readings | 返回 threshold 对象（含设计限值/预警/报警阈值） |
| GET /api/area2/monitoring/summary | 增加 alert_summary（normal/warning/alarm 汇总） |
| GET /api/area2/tunneling/parameters | 返回 threshold 对象（含 P05/P95 上下限） |
| GET /api/area2/tunneling/groups | 增加 normal_count / exceed_count |

## 部署验证

- systemd: active + enabled ✅
- nginx: /api/area2/ 反代正常 ✅
- /api/area2/health: 200 ✅
- /api/area2/thresholds: 200 ✅
- /api/area2/analytics/overview: 200 ✅
- /api/gn/ 不受影响 ✅

## 已知非阻塞问题

1. **阈值来源为统计推导，非工程设计值** — 建议后续从施工图/规范补充正式设计限值
2. **剩余 665 条 unknown** — 多为 cumulative_change 和 daily_change 双 NULL 的读数
3. **污水管线沉降全 warning** — P95 阈值可能偏严，需人工复核
4. **CAD 图纸仅登记未空间配准** — 不影响 core 研判

## 文件清单

### 服务器
- /opt/nycj/2gongqu-backend/app/main.py (v1.1.0)
- /opt/nycj/2gongqu-backend/app/schemas.py
- /opt/nycj/2gongqu-backend/app/services/cn_map.py
- /opt/nycj/2gongqu-backend/app/services/threshold_service.py (NEW)
- /opt/nycj/2gongqu-backend/app/services/monitoring_service.py
- /opt/nycj/2gongqu-backend/app/services/tunneling_service.py
- /opt/nycj/2gongqu-backend/app/routers/analytics.py (NEW)
- /opt/nycj/2gongqu-backend/sql/derive_thresholds.sql
- /opt/nycj/2gongqu-backend/sql/fix_threshold_unknown.sql
- /opt/nycj/2gongqu-backend/sql/check_results.sql
- /opt/nycj/2gongqu-backend/sql/check_unknown.sql

### 本地
- 2工区/backend_api/app/* (同上)
- 2工区/backend_deploy/sql/* (同上)
- 2工区/backend_deploy/api_smoke_test_result.md
- 2工区/backend_deploy/aliyun_deploy_result.md