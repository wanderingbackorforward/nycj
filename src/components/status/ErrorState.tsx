import React from 'react';

interface Props {
  message?: string;
  onRetry?: () => void;
  stable?: boolean;
}

export default function ErrorState({ message, onRetry, stable }: Props) {
  return (
    <div className="state-container error">
      <div className="state-icon">⚠</div>
      <p className="state-message">
        {stable
          ? '实时接口连接异常，页面保留最近一次数据' + (message ? '：' + message : '')
          : message || '数据加载失败'}
      </p>
      {onRetry && (
        <button className="state-retry-btn" onClick={onRetry}>
          重新加载
        </button>
      )}
    </div>
  );
}