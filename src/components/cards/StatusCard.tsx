import React from 'react';

interface StatusCardProps {
  label: string;
  value: string | number;
  unit?: string;
  highlight?: boolean;
  subLabel?: string;
}

export default function StatusCard({ label, value, unit, highlight, subLabel }: StatusCardProps) {
  return (
    <div className={'status-card' + (highlight ? ' highlight' : '')}>
      <div className="status-card-label">{label}</div>
      <div className="status-card-value">
        {value}
        {unit && <span className="status-card-unit">{unit}</span>}
      </div>
      {subLabel && <div className="status-card-sub">{subLabel}</div>}
    </div>
  );
}