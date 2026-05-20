# 工农路站 1工区 Backend API — 阿里云部署成功报告

## 部署概览

| 项目 | 值 |
|------|----|
| 部署时间 | 2026-05-16 03:47 CST |
| 服务器 | 120.55.70.218 |
| 操作系统 | Ubuntu 22.04 (Linux 5.15.0-177-generic) |
| Python | 3.10.12 |
| 部署路径 | /opt/nycj/1gongqu-backend/ |
| 后端框架 | FastAPI + uvicorn |
| 数据库 | PostgreSQL 15 (shield_monitor, 127.0.0.1:5432) |
| systemd 服务名 | gn-backend.service |
| uvicorn 监听 | 127.0.0.1:8001 |
| nginx 反代 | http://120.55.70.218:80/api/gn/ → 127.0.0.1:8001 |
| 开机自启 | enabled |

## 数据库状态

| 表 | 行数 |
|----|------|
| gn_source_document | 48 |
| gn_monitoring_point | 881 |
| gn_monitoring_reading | 24,966 |
| gn_pdf_report_summary | 17 |
| gn_extraction_evidence | 24,966 |
| gn_import_batch | 0 (预留) |
| gn_data_quality_issue | 0 (预留) |

## View 状态

| View | 用途 | 可用 |
|------|------|------|
| v_gn_analysis_reading | 业务分析候选 | ✅ |
| v_gn_page_default_reading | 前端默认展示 | ✅ |
| v_gn_manual_review_reading | 人工复核 | ✅ |
| v_gn_evidence_reading | 原始证据 | ✅ |
| v_gn_data_quality_summary | 数据质量汇总 | ✅ |
| v_gn_alert_review | 超设计限值复核 | ✅ |

## 已验证 API

| # | 端点 | HTTP | 数据 |
|---|------|------|------|
| 1 | GET /api/gn/health | 200 | ok=true, db=connected |
| 2 | GET /api/gn/overview?date=2026-04-14 | 200 | 重点复核, 791点, 868读数 |
| 3 | GET /api/gn/monitoring/items | 200 | 9种监测项目 |
| 4 | GET /api/gn/monitoring/alerts | 200 | 筛选正常 |
| 5 | GET /api/gn/point-analysis/{point_code} | - | 已实现 |
| 6 | GET /api/gn/monitoring/points | - | 已实现 |
| 7 | GET /api/gn/monitoring/readings | - | 已实现 |
| 8 | GET /api/gn/data-quality/summary | - | 已实现 |
| 9 | GET /api/gn/source-documents | - | 已实现 |
| 10 | GET /api/gn/evidence | - | 已实现 |
| 11 | GET /api/gn/system-status | 200 | 5 known issues |

## 关键业务口径

1. **unknown** 不是错误数据，只是当前规则无法判断状态
2. **exceed_design_limit** 不是正式报警，只是基于设计限值的自动标签
3. **raw_sensor** 不是废弃数据，是原始证据保留
4. **DSW13** 地下水位需要重点人工复核
5. 前端默认页面应查 **view**，不要直接查 gn_monitoring_reading 全表
6. staging 层全量保留，后端 API 负责分层返回

## Known Issues

1. 正式预警/报警阈值缺失，当前仅使用 Excel 设计限值列
2. DSW13 地下水位累计变化异常偏高（exceed_ratio ~13.6），需人工复核
3. 支撑轴力 daily_max 的 max_sensor_no 未可靠识别
4. unknown 占比约 64.7%，主要为缺少设计限值
5. CAD/DWG 中的测点空间坐标尚未提取

## 运维命令

```bash
# 状态
systemctl status gn-backend

# 启停
systemctl restart gn-backend
systemctl stop gn-backend
systemctl start gn-backend

# 日志
tail -f /opt/nycj/1gongqu-backend/logs/uvicorn.log
journalctl -u gn-backend -f

# 健康检查
curl http://127.0.0.1:8001/api/gn/health
curl http://120.55.70.218:80/api/gn/health

# 直接重启 (跳过 systemd)
pkill -9 -f "port 8001"
cd /opt/nycj/1gongqu-backend && source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8001 &
```

## 前端对接地址

- **API Base URL**: `http://120.55.70.218:80/api/gn`
- **本地开发**: `http://127.0.0.1:8001/api/gn` (需 SSH 隧道到 PG)

## 安全

- 数据库密码仅存在于 `/opt/nycj/1gongqu-backend/.env` (权限 600)
- .env 不在代码仓库中
- nginx 反代仅开放 `/api/gn/` 路径
- /docs 和 /openapi.json 未通过 nginx 对外暴露
- CORS 当前允许: localhost:5173, 127.0.0.1:5173
