import React, { useState } from 'react';
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

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean; error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="state-container error" style={{ padding: 40 }}>
          <div className="state-icon">⚠</div>
          <p className="state-message">页面渲染异常</p>
          <pre style={{ color: '#d47070', fontSize: 12, maxWidth: 600, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#0a0e1a', padding: 12, borderRadius: 4, marginTop: 8 }}>
            {this.state.error?.message}
          </pre>
          <button className="state-retry-btn" onClick={() => this.setState({ hasError: false, error: null })} style={{ marginTop: 12 }}>
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="cockpit-layout">
      <aside className={'cockpit-sidebar' + (collapsed ? ' collapsed' : '')}>
        <div className="sidebar-header">
          <span className="sidebar-logo">NY</span>
          {!collapsed && <span className="sidebar-title">宁扬城际</span>}
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
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
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}