import React from 'react';

interface Props { title: string; }

export default function PlaceholderPage({ title }: Props) {
  return (
    <div className="page-placeholder">
      <div className="placeholder-card">
        <h2>{title}</h2>
        <p className="placeholder-desc">该页面将在下一阶段实现，当前已预留路由和数据接口。</p>
        <div className="placeholder-status">
          <span className="status-dot" />
          <span>数据接口已就绪，等待页面开发</span>
        </div>
      </div>
    </div>
  );
}
