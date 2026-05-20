# 2工区 本地开发启动脚本
="120.55.70.218"
="5432"
="shield_monitor"
="shield_user"
="<YOUR_PASSWORD>"
="shield_area2"

python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8002
