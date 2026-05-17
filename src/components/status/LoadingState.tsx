import React from 'react';

interface Props {
  message?: string;
}

export default function LoadingState({ message = '加载中...' }: Props) {
  return (
    <div className="state-container">
      <div className="state-spinner" />
      <p className="state-message">{message}</p>
    </div>
  );
}
