import React from 'react';
import { formatBRL, formatDateBR } from '../lib/format';

export default function PriceTrendChart({ history = [] }) {
  if (!history || history.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50 text-xs text-stone-500">
        Sem histórico suficiente para exibir gráfico.
      </div>
    );
  }

  const width = 560;
  const height = 180;
  const padX = 44;
  const padY = 22;

  const prices = history.map((h) => Number(h.price) || 0);
  const minVal = Math.min(...prices);
  const maxVal = Math.max(...prices);
  const span = Math.max(0.5, maxVal - minVal);

  const points = history.map((h, idx) => {
    const x =
      history.length === 1
        ? width / 2
        : padX + (idx / (history.length - 1)) * (width - padX * 2);
    const y =
      height - padY - ((Number(h.price) - minVal) / span) * (height - padY * 2);
    return { x, y, item: h };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPath =
    points.length > 1
      ? `M ${points[0].x},${height - padY} L ${points.map((p) => `${p.x},${p.y}`).join(' L ')} L ${points[points.length - 1].x},${height - padY} Z`
      : '';

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full min-w-[320px]">
        <defs>
          <linearGradient id="priceFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#be123c" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#be123c" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        <line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke="#f3e8e2" strokeDasharray="4 4" />
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#e7ded8" />

        <text x={4} y={padY + 4} fontSize="10" fill="#78716c">
          {formatBRL(maxVal)}
        </text>
        <text x={4} y={height - padY + 4} fontSize="10" fill="#78716c">
          {formatBRL(minVal)}
        </text>

        {areaPath && <path d={areaPath} fill="url(#priceFill)" />}
        {points.length > 1 && (
          <polyline
            fill="none"
            stroke="#be123c"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polyline}
          />
        )}

        {points.map((p, idx) => (
          <g key={p.item.id || idx}>
            <circle cx={p.x} cy={p.y} r="5" fill="#fff" stroke="#9f1239" strokeWidth="2.5" />
            <text x={p.x} y={Math.max(12, p.y - 10)} textAnchor="middle" fontSize="10" fontWeight="600" fill="#44403c">
              {formatBRL(p.item.price)}
            </text>
            <text x={p.x} y={height - 4} textAnchor="middle" fontSize="9" fill="#78716c">
              {formatDateBR(p.item.recorded_at)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
