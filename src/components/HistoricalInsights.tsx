import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { formatUsd } from '../utils/format';

interface HistoryPoint {
  time: number;
  value: number;
}

interface HistoricalAnalyticsApiResponse {
  oiHistory: Array<{ time: number; value: number }>;
  dailyVolume: Array<{ time: number; value: number }>;
  cumulativeVolume: Array<{ time: number; value: number }>;
  latestOiUsd: number;
  latestDailyVolumeUsd: number;
  cumulativeVolumeUsd: number;
  source?: string;
}

type WindowOption = '14D' | '30D' | '90D' | 'ALL';

const SeriesCard: React.FC<{
  title: string;
  subtitle: string;
  points: HistoryPoint[];
  color: string;
  gradId: string;
  latestValue: number;
  isDark: boolean;
}> = ({ title, subtitle, points, color, gradId, latestValue, isDark }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 440;
  const height = 148;
  const padL = 6;
  const padR = 54;
  const padT = 12;
  const padB = 22;
  const cW = width - padL - padR;
  const cH = height - padT - padB;

  const { minVal, maxVal, linePath, areaPath, yTicks } = useMemo(() => {
    if (points.length === 0) {
      return { minVal: 0, maxVal: 1, linePath: '', areaPath: '', yTicks: [0, 0.5, 1] };
    }
    const vals = points.map((p) => p.value);
    const rawMin = Math.min(...vals);
    const rawMax = Math.max(...vals);
    const minV = rawMin === rawMax ? rawMin * 0.9 : rawMin * 0.96;
    const maxV = rawMin === rawMax ? rawMax * 1.1 || 1 : rawMax * 1.03;
    const range = Math.max(1e-9, maxV - minV);
    const denom = Math.max(1, points.length - 1);
    const getX = (i: number) => padL + (i / denom) * cW;
    const getY = (v: number) => padT + ((maxV - v) / range) * cH;

    const line = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(p.value).toFixed(1)}`)
      .join(' ');
    const area =
      points.length > 1
        ? `${line} L ${getX(points.length - 1).toFixed(1)} ${(padT + cH).toFixed(1)} L ${getX(0).toFixed(1)} ${(padT + cH).toFixed(1)} Z`
        : '';

    return {
      minVal: minV,
      maxVal: maxV,
      linePath: line,
      areaPath: area,
      yTicks: [0, 0.5, 1].map((t) => maxV - t * range),
    };
  }, [points, cW, cH]);

  const activePoint =
    hoverIdx !== null && points[hoverIdx] ? points[hoverIdx] : points[points.length - 1];
  const displayValue = activePoint ? activePoint.value : latestValue;

  const denom = Math.max(1, points.length - 1);
  const range = Math.max(1e-9, maxVal - minVal);
  const getX = (i: number) => padL + (i / denom) * cW;
  const getY = (v: number) => padT + ((maxVal - v) / range) * cH;

  return (
    <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-3.5 flex flex-col justify-between dark:border-slate-800/80 dark:bg-[#080d18]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-xs font-bold text-slate-900 dark:text-[#e8edfb] truncate">{title}</div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-500 truncate">
            {activePoint
              ? new Date(activePoint.time).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : subtitle}
          </div>
        </div>
        <div className="text-right font-mono text-sm font-bold tabular-nums shrink-0" style={{ color }}>
          {displayValue > 0 ? formatUsd(displayValue, true) : '—'}
        </div>
      </div>

      <div className="mt-2">
        {points.length >= 2 ? (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto block select-none"
            onMouseLeave={() => setHoverIdx(null)}
            role="img"
            aria-label={`${title} history chart`}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={isDark ? '0.28' : '0.22'} />
                <stop offset="100%" stopColor={color} stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {yTicks.map((tick, idx) => {
              const y = getY(tick);
              return (
                <g key={idx}>
                  <line
                    x1={padL}
                    x2={width - padR}
                    y1={y}
                    y2={y}
                    stroke={isDark ? 'rgba(148,163,205,0.12)' : 'rgba(15,23,42,0.08)'}
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />
                  <text
                    x={width - padR + 6}
                    y={y + 3.5}
                    fill={isDark ? '#7c8bb0' : '#64748b'}
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {formatUsd(tick, true)}
                  </text>
                </g>
              );
            })}

            <path d={areaPath} fill={`url(#${gradId})`} />
            <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />

            {hoverIdx !== null && points[hoverIdx] && (
              <g pointerEvents="none">
                <line
                  x1={getX(hoverIdx)}
                  x2={getX(hoverIdx)}
                  y1={padT}
                  y2={padT + cH}
                  stroke={isDark ? '#ffb02e' : '#d97706'}
                  strokeOpacity={0.55}
                  strokeDasharray="3 3"
                />
                <circle
                  cx={getX(hoverIdx)}
                  cy={getY(points[hoverIdx].value)}
                  r={3.5}
                  fill={color}
                  stroke={isDark ? '#080d18' : '#ffffff'}
                  strokeWidth={2}
                />
              </g>
            )}

            {points.map((p, i) => {
              const sliceW = cW / points.length;
              return (
                <rect
                  key={`${p.time}-${i}`}
                  x={getX(i) - sliceW / 2}
                  y={padT}
                  width={Math.max(3, sliceW)}
                  height={cH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                />
              );
            })}

            {[0, Math.floor(points.length / 2), points.length - 1].map((idx) => {
              const pt = points[idx];
              if (!pt) return null;
              return (
                <text
                  key={`x-${idx}`}
                  x={getX(idx)}
                  y={height - 5}
                  textAnchor={idx === 0 ? 'start' : idx === points.length - 1 ? 'end' : 'middle'}
                  fill="#64748b"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {new Date(pt.time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </text>
              );
            })}
          </svg>
        ) : (
          <div className="flex h-[132px] items-center justify-center font-mono text-xs text-slate-500">
            Loading series…
          </div>
        )}
      </div>
    </div>
  );
};

export const HistoricalInsights: React.FC = () => {
  const { isDark } = useTheme();
  const [data, setData] = useState<HistoricalAnalyticsApiResponse | null>(null);
  const [windowDays, setWindowDays] = useState<WindowOption>('30D');

  useEffect(() => {
    const controller = new AbortController();
    const fetchHistory = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/analytics/history', { signal: controller.signal });
        if (!res.ok) return;
        const json = (await res.json()) as HistoricalAnalyticsApiResponse;
        if (!controller.signal.aborted) setData(json);
      } catch {
        // non-blocking fallback
      }
    };
    void fetchHistory();
    const timer = setInterval(fetchHistory, 120_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  const sliceWindow = (pts: HistoryPoint[]): HistoryPoint[] => {
    if (!pts.length) return [];
    if (windowDays === '14D') return pts.slice(-14);
    if (windowDays === '30D') return pts.slice(-30);
    if (windowDays === '90D') return pts.slice(-90);
    return pts;
  };

  const oiPoints = useMemo(() => sliceWindow(data?.oiHistory || []), [data, windowDays]);
  const dailyVolPoints = useMemo(() => sliceWindow(data?.dailyVolume || []), [data, windowDays]);
  const cumVolPoints = useMemo(() => sliceWindow(data?.cumulativeVolume || []), [data, windowDays]);

  return (
    <section className="sunrise-card rounded-2xl p-4 sm:p-5 space-y-3" aria-label="Historical market analytics">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-amber-600 dark:text-[#ffb02e]" />
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-[#e8edfb]">
              Historical Market Analytics
            </h2>
            <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              RISEx 1D candle volume &amp; DefiLlama Open Interest history
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-800 dark:bg-[#080d18]">
          {(['14D', '30D', '90D', 'ALL'] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindowDays(w)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-mono font-semibold whitespace-nowrap transition-colors ${
                windowDays === w
                  ? 'bg-amber-500 text-white shadow-xs dark:bg-[#ffb02e] dark:text-[#1f0e03]'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-[#e8edfb]'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <SeriesCard
          title="Open Interest History"
          subtitle="Daily RISEx OI · USD"
          points={oiPoints}
          color={isDark ? '#ffb02e' : '#d97706'}
          gradId="oiHistGrad"
          latestValue={data?.latestOiUsd || 0}
          isDark={isDark}
        />
        <SeriesCard
          title="Daily Volume"
          subtitle="Active markets 1D notional"
          points={dailyVolPoints}
          color={isDark ? '#22e0a1' : '#059669'}
          gradId="dailyVolGrad"
          latestValue={data?.latestDailyVolumeUsd || 0}
          isDark={isDark}
        />
        <SeriesCard
          title="Cumulative Volume"
          subtitle="All-time candle notional"
          points={cumVolPoints}
          color={isDark ? '#46a6ff' : '#2563eb'}
          gradId="cumVolGrad"
          latestValue={data?.cumulativeVolumeUsd || 0}
          isDark={isDark}
        />
      </div>
    </section>
  );
};
