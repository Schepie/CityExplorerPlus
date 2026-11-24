import { TrendingUp } from 'lucide-react';
import type { ElevationPoint } from '../types';

interface ElevationChartProps {
  profile: ElevationPoint[];
  gainMeters?: number;
}

export function ElevationChart({ profile, gainMeters }: ElevationChartProps) {
  if (profile.length < 2) return null;

  const elevations = profile.map((p) => p.elevationM);
  const minEl = Math.min(...elevations);
  const maxEl = Math.max(...elevations);
  const span = Math.max(8, maxEl - minEl);

  const width = 320;
  const height = 46;
  const padY = 5;

  const points = profile.map((p, i) => {
    const x = (i / (profile.length - 1)) * width;
    const norm = (p.elevationM - minEl) / span;
    const y = height - padY - norm * (height - padY * 2);
    return { x, y };
  });

  const linePath = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl px-3 py-2 space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1 font-bold text-slate-600">
          <TrendingUp className="w-3.5 h-3.5 text-teal-600" />
          Hoogteprofiel
        </span>
        <span className="font-semibold text-slate-500">
          {gainMeters !== undefined ? `+${gainMeters} m stijging · ` : ''}
          {minEl}–{maxEl} m
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-11 overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d9488" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#0d9488" stopOpacity="0.03" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#elevGrad)" />
        <path
          d={linePath}
          fill="none"
          stroke="#0d9488"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
