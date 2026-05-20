# 2工区 后端阿里云部署归档报告

## 部署信息
- 部署时间: 2026-05-16
- 部署路径: /opt/nycj/2gongqu-backend/
- Database: shield_monitor
- Schema: shield_area2
- systemd 服务: shield-area2-backend.service
- 服务端口: 8002
- nginx 路径: /api/area2/ -> 127.0.0.1:8002
- 前端 API_BASE_URL: http://120.55.70.218:80/api/area2

## 数据库表行数
| 表 | 行数 |
|----|------|
| shield_source_document | 37 |
| shield_tunneling_ring | 33 |
| shield_tunneling_parameter | 243,304 |
| shield_monitoring_point | 6,536 |
| shield_monitoring_reading | 208,364 |
| shield_extraction_evidence | 215,559 |

## 15 API 测试结果
全部 15 个 API 返回 HTTP 200，JSON 格式正确。

## systemd 状态
- active: true
- enabled: true

## nginx 状态
- /api/area2/ 反代: OK
- /api/gn/ 不受影响: OK
- /docs: 404 (未暴露)
- /openapi.json: 404 (未暴露)

## 已知问题
1. status_code 全 unknown — 日报缺阈值
2. CAD 仅登记，未空间配准
3. 缺少环号-里程映射
4. 缺少风险源台账
5. 姿态诊断阈值待补
6. monitoring/summary 首次查询较慢 (全表扫描 200K 行)

## 安全
- 密码仅存在于 .env (600 权限)
- 代码/文档中无真实密码
- 无 DATABASE_URL/postgresql:// 泄露

## 下一步
- 前端以 http://120.55.70.218:80/api/area2 为 BASE_URL 接入
- 阈值补录后监控状态可自动化
- CAD 空间配准
