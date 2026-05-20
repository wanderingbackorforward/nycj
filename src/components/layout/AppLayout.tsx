import React, { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/command-overview', label: '指挥总览', icon: '◈' },
  { path: '/area1-monitoring',  label: '1工区基坑监测', icon: '◆' },
  { path: '/area1-point-analysis', label: '1工区单点分析', icon: '◇' },
  { path: '/area2-overview',    label: '2工区盾构总览', icon: '●' },
  { path: '/area2-tunneling',   label: '2工区掘进参数', icon: '○' },
  { path: '/area2-slurry-grouting', label: '2工区泥水注浆', icon: '◎' },
  { path: '/area2-monitoring',  label: '2工区监测响应', icon: '◉' },
  { path: '/documents-evidence', label: '报告与图纸', icon: '▣' },
  { path: '/system-status',     label: '系统状态', icon: '⚙' },
];

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <span className="text-3xl">⚠</span>
          <p className="text-sm" style={{ color: '#6a7d9e' }}>页面渲染异常</p>
          <pre className="text-xs max-w-xl whitespace-pre-wrap break-all rounded p-3 mt-2" style={{ color: '#d47070', background: '#0a0e1a' }}>
            {this.state.error?.message}
          </pre>
          <button
            className="px-5 py-2 rounded text-sm cursor-pointer transition-colors mt-2"
            style={{ background: '#1a4a6a', border: '1px solid #1a4a6a', color: '#98aec9' }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
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
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: '#0a0e1a' }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col overflow-hidden transition-all duration-200 border-r"
        style={{
          width: collapsed ? 56 : 220,
          minWidth: collapsed ? 56 : 220,
          background: '#0a0e1a',
          borderColor: '#1a2640',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-3.5 py-4 border-b min-h-[56px]" style={{ borderColor: '#1a2640' }}>
          <span className="w-8 h-8 rounded flex items-center justify-center text-white font-bold text-xs flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0d47a1, #00d4ff)' }}>
            NY
          </span>
          {!collapsed && <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: '#c8d6e5' }}>宁扬城际</span>}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                'flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] transition-all duration-150 whitespace-nowrap border-l-[3px] ' +
                (isActive ? 'border-l-[#00d4ff]' : 'border-l-transparent')
              }
              style={({ isActive }) => ({
                color: isActive ? '#00d4ff' : '#98aec9',
                background: isActive ? '#111e30' : 'transparent',
              })}
              title={item.label}
            >
              <span className="text-sm w-5 text-center flex-shrink-0">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Toggle */}
        <button
          className="p-3 bg-transparent border-0 cursor-pointer text-xs transition-colors border-t"
          style={{ color: '#5a6d8a', borderColor: '#1a2640' }}
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? '展开菜单' : '收起菜单'}
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="px-6 py-2.5 border-b flex items-center justify-between min-h-[48px]" style={{ background: '#0a0e1a', borderColor: '#1a2640' }}>
          <h1 className="text-base font-semibold tracking-wide" style={{ color: '#c8d6e5' }}>宁扬城际施工监测与盾构研判平台</h1>
          <div className="flex items-center gap-2 text-xs" style={{ color: '#2e7d32' }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#2e7d32', boxShadow: '0 0 6px rgba(46,125,50,0.5)' }} />
            系统运行中
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-5">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
