import React from 'react';
import type { ConclusionBlock, GapItem } from '../../models/common';

interface ConclusionCardProps {
  title: string;
  conclusion: ConclusionBlock;
}

function GapRow({ gap }: { gap: GapItem }) {
  return (
    <tr className="gap-row">
      <td className="gap-category">{gap.category}</td>
      <td className="gap-desc">{gap.description}</td>
      <td className="gap-impact">{gap.impact}</td>
      <td className="gap-action">{gap.action}</td>
    </tr>
  );
}

export default function ConclusionCard({ title, conclusion }: ConclusionCardProps) {
  return (
    <div className="conclusion-card">
      <h3 className="conclusion-title">{title}</h3>
      <div className="conclusion-summary">{conclusion.summary}</div>

      {conclusion.evidence.length > 0 && (
        <div className="conclusion-section">
          <h4>关键证据</h4>
          <ul>
            {conclusion.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {conclusion.actions.length > 0 && (
        <div className="conclusion-section">
          <h4>建议动作</h4>
          <ul>
            {conclusion.actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {conclusion.gaps.length > 0 && (
        <div className="conclusion-section">
          <h4>数据缺口</h4>
          <table className="gap-table">
            <thead>
              <tr>
                <th>类别</th>
                <th>缺口描述</th>
                <th>影响</th>
                <th>补充方式</th>
              </tr>
            </thead>
            <tbody>
              {conclusion.gaps.map((g, i) => (
                <GapRow key={i} gap={g} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
