# 2工区 API v1 测试

## 本地启动
`ash
cd "D:\mine\myprojects\宁扬项目施组\2工区\backend_api"
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8002
`

## Curl 测试

### 1. Health
`ash
curl http://127.0.0.1:8002/api/area2/health | python -m json.tool
`

### 2. Overview
`ash
curl http://127.0.0.1:8002/api/area2/overview | python -m json.tool
`

### 3. Rings
`ash
curl http://127.0.0.1:8002/api/area2/rings | python -m json.tool
`

### 4. Ring Detail
`ash
curl http://127.0.0.1:8002/api/area2/rings/1749 | python -m json.tool
`

### 5. Tunneling Groups
`ash
curl http://127.0.0.1:8002/api/area2/tunneling/groups | python -m json.tool
`

### 6. Tunneling Parameters
`ash
curl "http://127.0.0.1:8002/api/area2/tunneling/parameters?ring_no=1749&limit=10" | python -m json.tool
`

### 7. Monitoring Summary
`ash
curl http://127.0.0.1:8002/api/area2/monitoring/summary | python -m json.tool
`

### 8. Monitoring Items
`ash
curl http://127.0.0.1:8002/api/area2/monitoring/items | python -m json.tool
`

### 9. Monitoring Readings
`ash
curl "http://127.0.0.1:8002/api/area2/monitoring/readings?limit=10" | python -m json.tool
`

### 10. Diagnosis Operation
`ash
curl "http://127.0.0.1:8002/api/area2/diagnosis/operation?ring_no=1749" | python -m json.tool
`

### 11. Data Quality
`ash
curl http://127.0.0.1:8002/api/area2/data-quality/summary | python -m json.tool
`

### 12. System Status
`ash
curl http://127.0.0.1:8002/api/area2/system-status | python -m json.tool
`

### 13. Documents
`ash
curl http://127.0.0.1:8002/api/area2/documents | python -m json.tool
`

### 14. Evidence
`ash
curl "http://127.0.0.1:8002/api/area2/evidence?limit=10" | python -m json.tool
`

### 15. Slurry/Grouting Diagnosis
`ash
curl "http://127.0.0.1:8002/api/area2/diagnosis/slurry-grouting?ring_no=1749" | python -m json.tool
`
