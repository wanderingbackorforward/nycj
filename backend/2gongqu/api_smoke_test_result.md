# 2工区 API Smoke Test 结果

## 测试信息
- 时间: 2026-05-16 05:25 UTC
- 内网: http://127.0.0.1:8002/api/area2
- 外网: http://120.55.70.218:80/api/area2

## 内网 Health
{"ok":true,"database":"connected","schema":"shield_area2"}

## 外网 Health (nginx)
HTTP 200

## 15 API 测试结果

| # | 端点 | HTTP | JSON |
|---|------|:---:|:---:|
| 1 | /api/area2/health | 200 | OK |
| 2 | /api/area2/overview | 200 | OK |
| 3 | /api/area2/rings | 200 | OK |
| 4 | /api/area2/rings/1717 | 200 | OK |
| 5 | /api/area2/tunneling/parameters | 200 | OK |
| 6 | /api/area2/tunneling/groups | 200 | OK |
| 7 | /api/area2/diagnosis/operation | 200 | OK |
| 8 | /api/area2/diagnosis/slurry-grouting | 200 | OK |
| 9 | /api/area2/monitoring/items | 200 | OK |
| 10 | /api/area2/monitoring/readings | 200 | OK |
| 11 | /api/area2/monitoring/summary | 200 | OK |
| 12 | /api/area2/documents | 200 | OK |
| 13 | /api/area2/evidence | 200 | OK |
| 14 | /api/area2/data-quality/summary | 200 | OK |
| 15 | /api/area2/system-status | 200 | OK |

## 失败接口: 无

## /docs 和 /openapi.json
- /docs: 404 (未暴露)
- /openapi.json: 404 (未暴露)

## 结论
全部 15 个 API 通过，可以接入前端。
