# 宁扬城际施工监测与盾构研判数字驾驶舱

基于 React + TypeScript + Vite + ECharts 构建的工程研判平台，对接 1工区（工农路站基坑）和 2工区（工~天盾构区间）后端 API。

## 快速开始

```bash
# 安装依赖
npm install

# 开发运行（端口 5174）
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

## 项目结构

```
frontend_cockpit/
├── src/
│   ├── main.tsx              # 入口
│   ├── App.tsx               # 根组件
│   ├── router.tsx            # 路由配置
│   ├── config/api.ts         # API 地址配置
│   ├── api/
│   │   ├── http.ts           # 统一 HTTP 封装（超时、缓存、错误处理）
│   │   ├── area1.ts          # 1工区 API 适配
│   │   └── area2.ts          # 2工区 API 适配
│   ├── models/
│   │   ├── common.ts         # 通用类型
│   │   ├── area1.ts          # 1工区业务模型
│   │   └── area2.ts          # 2工区业务模型
│   ├── utils/
│   │   ├── cn.ts             # 中文标签映射
│   │   ├── format.ts         # 数值格式化
│   │   └── status.ts         # 状态判断工具
│   ├── components/
│   │   ├── layout/AppLayout.tsx  # 全局布局（侧边栏+顶栏）
│   │   ├── cards/StatusCard.tsx  # 状态卡片
│   │   ├── cards/ConclusionCard.tsx # 研判结论卡片
│   │   ├── status/LoadingState.tsx  # 加载状态
│   │   └── status/ErrorState.tsx    # 错误兜底
│   ├── pages/
│   │   ├── CommandOverview.tsx   # ✅ Phase 1: 指挥总览
│   │   ├── SystemStatus.tsx      # ✅ Phase 1: 系统状态
│   │   └── *.tsx                 # ⏳ Phase 2: 业务页面（占位）
│   └── styles/
│       ├── global.css         # 全局重置
│       └── cockpit.css        # 驾驶舱深色主题
├── frontend_project_basis.md  # 前置资料摘要
├── DEPLOY_ALIYUN.md           # 阿里云部署文档
└── .env.example               # 环境变量模板
```

## 页面路由

| 路由 | 页面 | 状态 |
|---|---|---|
| /command-overview | 平台指挥总览 | ✅ 已实现 |
| /system-status | 数据接入与系统状态 | ✅ 已实现 |
| /area1-monitoring | 1工区基坑监测 | ⏳ Phase 2 |
| /area1-point-analysis | 1工区单点分析 | ⏳ Phase 2 |
| /area2-overview | 2工区盾构总览 | ⏳ Phase 2 |
| /area2-tunneling | 2工区掘进参数 | ⏳ Phase 2 |
| /area2-slurry-grouting | 2工区泥水注浆 | ⏳ Phase 2 |
| /area2-monitoring | 2工区监测响应 | ⏳ Phase 2 |
| /documents-evidence | 报告与图纸证据 | ⏳ Phase 2 |

## API 配置

本地开发需创建 `.env` 文件（已默认使用同源路径，如需直连阿里云请参考 `.env.example`）。
