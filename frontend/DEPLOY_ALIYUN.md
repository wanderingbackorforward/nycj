# 宁扬城际数字驾驶舱 — 阿里云部署文档

## 部署架构

```
用户浏览器 (http://120.55.70.218)
    │
    ▼
nginx :80
    ├── /              → frontend_cockpit/dist/ (静态文件)
    ├── /api/gn/       → proxy_pass http://127.0.0.1:8001 (1工区后端)
    ├── /api/area2/    → proxy_pass http://127.0.0.1:8002 (2工区后端)
    └── /docs, /openapi.json → 禁止访问
```

## 部署目录

| 路径 | 用途 |
|---|---|
| `/opt/nycj/frontend-cockpit/` | 前端代码 + dist |
| `/etc/nginx/conf.d/nycj-cockpit.conf` | Nginx 配置 |

## 部署步骤

### 1. 上传代码

```bash
# 在开发机上构建
cd frontend_cockpit
npm install
npm run build

# 上传 dist 目录到服务器
scp -r dist/ root@120.55.70.218:/opt/nycj/frontend-cockpit/
```

### 2. Nginx 配置

```nginx
server {
    listen 80;
    server_name 120.55.70.218;

    # 前端静态页面（如果根路径未被占用）
    location / {
        root /opt/nycj/frontend-cockpit/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 或者使用 /cockpit/ 子路径（如果根路径已有站点）
    # location /cockpit {
    #     alias /opt/nycj/frontend-cockpit/dist;
    #     index index.html;
    #     try_files $uri $uri/ /cockpit/index.html;
    # }

    # 1工区后端代理
    location /api/gn/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 2工区后端代理
    location /api/area2/ {
        proxy_pass http://127.0.0.1:8002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 禁止暴露 API 文档
    location ~ ^/(docs|openapi\.json|redoc) {
        deny all;
        return 403;
    }
}
```

### 3. 重载 Nginx

```bash
nginx -t && systemctl reload nginx
```

### 4. 验证

```bash
# 检查前端页面
curl -s -o /dev/null -w "%{http_code}" http://120.55.70.218/

# 检查 API 代理
curl -s http://120.55.70.218/api/gn/health
curl -s http://120.55.70.218/api/area2/health
```

## Vite 构建配置

在 `vite.config.ts` 中已设置 `base`，构建产物默认使用相对路径，支持子目录部署。

如果使用 `/cockpit/` 子路径部署，需修改 `vite.config.ts`：

```ts
export default defineConfig({
  base: '/cockpit/',
  // ...
});
```

并在 `router.tsx` 中设置：

```ts
basename: '/cockpit',
```

## 注意事项

1. **不要覆盖现有站点**：部署前先确认 nginx 根路径是否已有站点，如有则使用 `/cockpit/` 子路径
2. **不新增长期进程**：前端为纯静态文件，不启动 Node/Vite 常驻进程
3. **不暴露内部端口**：8001/8002 仅本地回环访问，不对外开放
4. **不占用新端口**：仅使用 80 端口 nginx 服务
5. **文档接口已禁用**：/docs 和 /openapi.json 已配置 deny
6. **前端路由 fallback**：`try_files` 确保 React Router history 模式正常工作
