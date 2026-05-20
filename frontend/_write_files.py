import os

BASE = r"D:\mine\myprojects\宁扬项目施组\frontend_cockpit\src"

files = {}

# StatusCard.tsx
files["components/cards/StatusCard.tsx"] = r"""import React from 'react';

interface StatusCardProps {
  label: string;
  value: string | number;
  unit?: string;
  highlight?: boolean;
  subLabel?: string;
}

export default function StatusCard({ label, value, unit, highlight, subLabel }: StatusCardProps) {
  return (
    <div className={`status-card${highlight ? ' highlight' : ''}`}>
      <div className="status-card-label">{label}</div>
      <div className="status-card-value">
        {value}
        {unit && <span className="status-card-unit">{unit}</span>}
      </div>
      {subLabel && <div className="status-card-sub">{subLabel}</div>}
    </div>
  );
}
"""

# AppLayout.tsx
files["components/layout/AppLayout.tsx"] = r"""import React, { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import '../../styles/cockpit.css';

const NAV_ITEMS = [
  { path: '/command-overview', label: '指挥总览', icon: '◈' },
  { path: '/area1-monitoring', label: '1工区基坑监测', icon: '◆' },
  { path: '/area1-point-analysis', label: '1工区单点分析', icon: '◇' },
  { path: '/area2-overview', label: '2工区盾构总览', icon: '●' },
  { path: '/area2-tunneling', label: '2工区掘进参数', icon: '○' },
  { path: '/area2-slurry-grouting', label: '2工区泥水注浆', icon: '◎' },
  { path: '/area2-monitoring', label: '2工区监测响应', icon: '◉' },
  { path: '/documents-evidence', label: '报告与图纸证据', icon: '▣' },
  { path: '/system-status', label: '系统状态', icon: '⚙' },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="cockpit-layout">
      <aside className={`cockpit-sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-logo">NY</span>
          {!collapsed && <span className="sidebar-title">宁扬城际</span>}
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `nav-item${isActive ? ' active' : ''}`
              }
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? '展开菜单' : '收起菜单'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </aside>
      <main className="cockpit-main">
        <header className="cockpit-header">
          <h1 className="header-title">宁扬城际施工监测与盾构研判平台</h1>
          <div className="header-status">
            <span className="status-dot live" />
            <span className="status-text">系统运行中</span>
          </div>
        </header>
        <div className="cockpit-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
"""

# config/api.ts
files["config/api.ts"] = r"""// API 配置
const GN_API_BASE = import.meta.env.VITE_GN_API_BASE_URL || '/api/gn';
const AREA2_API_BASE = import.meta.env.VITE_AREA2_API_BASE_URL || '/api/area2';

export { GN_API_BASE, AREA2_API_BASE };
export const API_TIMEOUT_MS = 10000;
export const DEFAULT_DATE = '2026-04-14';
"""

for path, content in files.items():
    full = os.path.join(BASE, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(content.lstrip('\n'))
    print(f"Written: {path}")

print("All files written successfully")
