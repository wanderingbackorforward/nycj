# 2工区 后端 API v1

## 技术栈
- Python + FastAPI + psycopg2
- PostgreSQL schema: shield_area2
- 端口: 8002

## 本地开发
`ash
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8002
`

## 数据库
- database: shield_monitor
- schema: shield_area2
- 连接信息通过环境变量读取

## API 前缀
/api/area2

## 安全
- 密码不写入代码/文档
- SQL 参数化
- limit 最大 1000
