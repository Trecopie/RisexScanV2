import React, { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import type { RisexMarket } from '../types/risex';
import { formatPct, formatPrice, formatUsd } from '../utils/format';
import {
  buildMarketHeatmap,
  type DashboardSectorFilter,
  type MarketHeatmapSort,
  type MarketHeatmapTile,
} from '../utils/overviewAnalytics';
import { TokenBadge } from './TraderAvatar';

interface MarketHeatmapProps {
  markets: RisexMarket[];
  onSelectMarket: (marketId: string) => void;
  onOpenScreener: () => void;
  actionLabel?: string;
  showSectorFilter?: boolean;
}

function getHeatmapTileStyle(tile: MarketHeatmapTile, isDark: boolean): React.CSSProperties {
  const volNorm = tile.volatilityIntensity;
  const volBarBoost = tile.volumeIntensity * 0.06;
  if (tile.volatilityAbsPct < 0.15) {
    return isDark
      ? {
          backgroundColor: `rgba(30, 41, 59, ${(0.38 + volBarBoost).toFixed(3)})`,
          borderColor: 'rgba(71, 85, 105, 0.55)',
        }
      : {
          backgroundColor: `rgba(226, 232, 240, ${(0.55 + volBarBoost).toFixed(3)})`,
          borderColor: 'rgba(148, 163, 184, 0.55)',
        };
  }
  const alpha = isDark
    ? Math.min(0.42, 0.1 + volNorm * 0.28 + volBarBoost)
    : Math.min(0.32, 0.08 + volNorm * 0.2 + volBarBoost);
  const borderAlpha = isDark
    ? Math.min(0.68, 0.24 + volNorm * 0.42)
    : Math.min(0.55, 0.22 + volNorm * 0.3);
  if (tile.changePct >= 0) {
    return {
      backgroundColor: `rgba(16, 185, 129, ${alpha.toFixed(3)})`,
      borderColor: isDark
        ? `rgba(34, 224, 161, ${borderAlpha.toFixed(3)})`
        : `rgba(5, 150, 105, ${borderAlpha.toFixed(3)})`,
    };
  }
  return {
    backgroundColor: `rgba(244, 63, 94, ${alpha.toFixed(3)})`,
    borderColor: isDark
      ? `rgba(255, 77, 109, ${borderAlpha.toFixed(3)})`
      : `rgba(225, 29, 72, ${borderAlpha.toFixed(3)})`,
  };
}

function getTierGridClasses(tier: MarketHeatmapTile['tier']): string {
  switch (tier) {
    case 'xl':
      return 'col-span-2 row-span-2 sm:col-span-2 sm:row-span-2 lg:col-span-3 lg:row-span-2';
    case 'lg':
      return 'col-span-1 row-span-1 sm:col-span-2 sm:row-span-1 lg:col-span-3 lg:row-span-1';
    default:
      return 'col-span-1 row-span-1 sm:col-span-1 sm:row-span-1 lg:col-span-2 lg:row-span-1';
  }
}

export const MarketHeatmap: React.FC<MarketHeatmapProps> = ({
  markets,
  onSelectMarket,
  onOpenScreener,
  actionLabel = 'Full Screener →',
  showSectorFilter = true,
}) => {
  const { isDark } = useTheme();
  const [sectorFilter, setSectorFilter] = useState<DashboardSectorFilter>('all');
  const [sortBy, setSortBy] = useState<MarketHeatmapSort>('volume');
  const [hoveredTile, setHoveredTile] = useState<MarketHeatmapTile | null>(null);

  const effectiveSectorFilter: DashboardSectorFilter = showSectorFilter ? sectorFilter : 'all';

  const heatmap = useMemo(
    () => buildMarketHeatmap(markets, effectiveSectorFilter, sortBy, 60),
    [markets, effectiveSectorFilter, sortBy]
  );

  const activeFocus = hoveredTile
    ? heatmap.tiles.find((t) => t.marketId === hoveredTile.marketId) || hoveredTile
    : heatmap.tiles[0] || null;

  return (
    <section
      aria-labelledby="market-heatmap-heading"
      className="sunrise-card rounded-2xl p-4 sm:p-5 space-y-3.5"
    >
      {/* Header & Controls */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <h2
              id="market-heatmap-heading"
              className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-[#e8edfb]"
            >
              Market Heatmap
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            <span>{heatmap.tiles.length} Shown</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span>
              Avg |24h Δ|{' '}
              <strong className="text-slate-900 dark:text-[#e8edfb]">{heatmap.avgVolatilityPct.toFixed(2)}%</strong>
            </span>
            {heatmap.peakVolatilitySymbol && (
              <>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span>
                  Peak{' '}
                  <strong className="text-sky-600 dark:text-sky-400">
                    {heatmap.peakVolatilitySymbol} ±{heatmap.peakVolatilityPct.toFixed(2)}%
                  </strong>
                </span>
              </>
            )}
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="text-emerald-600 dark:text-[#22e0a1] font-semibold">{heatmap.advancers} ▲</span>
            <span className="text-rose-600 dark:text-[#ff4d6d] font-semibold">{heatmap.decliners} ▼</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showSectorFilter && (
            <div
              role="group"
              aria-label="Filter Market Heatmap by sector"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-800 dark:bg-[#070b14]"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'crypto', label: 'Crypto' },
                  { id: 'rwa', label: 'RWA' },
                ] as const
              ).map((opt) => {
                const active = sectorFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSectorFilter(opt.id)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-mono font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-sky-600 text-white shadow-xs dark:bg-sky-400 dark:text-[#04131f]'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-[#e8edfb]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          <div
            role="group"
            aria-label="Sort Market Heatmap rectangles"
            className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-800 dark:bg-[#070b14]"
          >
            {(
              [
                { id: 'volume', label: 'Vol Intensity' },
                { id: 'volatility', label: 'Volatility' },
                { id: 'oi', label: 'Open Interest' },
              ] as const
            ).map((opt) => {
              const active = sortBy === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSortBy(opt.id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-mono font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-teal-600 text-white shadow-xs dark:bg-teal-400 dark:text-[#041512]'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-[#e8edfb]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOpenScreener}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-mono font-semibold text-sky-600 whitespace-nowrap shrink-0 hover:border-sky-500/50 dark:border-slate-800 dark:bg-[#080d18] dark:text-sky-400 dark:hover:border-sky-400/50 transition-colors"
          >
            {actionLabel}
          </button>
        </div>
      </div>

      {/* Legend & Live Tile Readout Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-1.5 text-[10px] font-mono dark:border-slate-800/70 dark:bg-[#070b14]">
        <div className="flex flex-wrap items-center gap-3 text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="text-rose-600 dark:text-[#ff4d6d] font-semibold">−10%</span>
            <div className="flex h-2 w-24 overflow-hidden rounded-sm border border-slate-300 dark:border-slate-800">
              <span className="flex-1 bg-rose-500/80" />
              <span className="flex-1 bg-rose-500/45" />
              <span className="flex-1 bg-rose-500/20" />
              <span className="flex-1 bg-slate-300 dark:bg-slate-700/70" />
              <span className="flex-1 bg-emerald-500/20" />
              <span className="flex-1 bg-emerald-500/45" />
              <span className="flex-1 bg-emerald-500/80" />
            </div>
            <span className="text-emerald-600 dark:text-[#22e0a1] font-semibold">+10%</span>
          </div>
          <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">·</span>
          <span className="hidden sm:inline text-slate-500 dark:text-slate-400">
            Box area &amp; bottom bar ={' '}
            <strong className="text-sky-600 dark:text-sky-400">
              {sortBy === 'oi' ? 'OI Intensity' : 'Volume Intensity'}
            </strong>
          </span>
        </div>

        {activeFocus && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums text-slate-600 dark:text-slate-300">
            <span className="font-bold text-slate-900 dark:text-[#e8edfb]">{activeFocus.symbol}</span>
            <span className="text-slate-500 dark:text-slate-400">{formatPrice(activeFocus.markPrice)}</span>
            <span className={activeFocus.changePct >= 0 ? 'text-emerald-600 dark:text-[#22e0a1] font-semibold' : 'text-rose-600 dark:text-[#ff4d6d] font-semibold'}>
              {activeFocus.changePct >= 0 ? '▲' : '▼'} {formatPct(activeFocus.changePct)}
            </span>
            <span className="text-slate-300 dark:text-slate-500">·</span>
            <span className="text-sky-600 dark:text-sky-400 font-semibold">Vol {formatUsd(activeFocus.volume24h, true)}</span>
            <span className="text-slate-300 dark:text-slate-500 hidden md:inline">·</span>
            <span className="text-slate-500 dark:text-slate-400 hidden md:inline">
              OI {formatUsd(activeFocus.openInterestUsd, true)}
            </span>
          </div>
        )}
      </div>

      {/* Dense Color-Coded Rectangle Matrix */}
      {heatmap.tiles.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs text-slate-500 dark:border-slate-800/80 dark:bg-[#070b14]">
          Syncing live RISEx market telemetry…
        </div>
      ) : (
        <div
          data-testid="market-heatmap-grid"
          className="grid grid-flow-dense grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 auto-rows-[76px] gap-1.5"
        >
          {heatmap.tiles.map((tile, idx) => {
            const isFlat = Math.abs(tile.changePct) < 0.005;
            const up = tile.changePct >= 0;
            const isXl = tile.tier === 'xl';
            const isLg = tile.tier === 'lg';
            const intensityPct = Math.round(tile.volumeIntensity * 100);
            const barColor =
              sortBy === 'oi'
                ? isDark ? '#38bdf8' : '#0284c7'
                : isDark ? '#2dd4bf' : '#0d9488';

            return (
              <button
                key={tile.marketId}
                type="button"
                onClick={() => onSelectMarket(tile.marketId)}
                onMouseEnter={() => setHoveredTile(tile)}
                onFocus={() => setHoveredTile(tile)}
                style={getHeatmapTileStyle(tile, isDark)}
                aria-label={`${tile.symbol} ${formatPrice(tile.markPrice)}, 24h change ${formatPct(tile.changePct)}, 24h volume ${formatUsd(tile.volume24h, true)}`}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-lg border text-left transition-all hover:brightness-95 dark:hover:brightness-125 hover:border-sky-500/80 focus:outline-none focus:ring-1 focus:ring-sky-500 ${getTierGridClasses(
                  tile.tier
                )} ${isXl ? 'p-3' : 'p-2'}`}
              >
                {/* Top row: Icon + Symbol + Change% */}
                <div className="flex items-start justify-between gap-1.5 min-w-0 w-full">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <TokenBadge
                      symbol={tile.symbol}
                      category={tile.sector}
                      size={isXl ? 24 : 18}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span
                          className={`font-display font-bold text-slate-900 dark:text-[#e8edfb] truncate group-hover:text-sky-600 dark:group-hover:text-sky-300 transition-colors ${
                            isXl ? 'text-sm' : 'text-xs'
                          }`}
                        >
                          {tile.symbol}
                        </span>
                        {isXl && (
                          <span className="font-mono text-[9px] text-slate-500 dark:text-slate-400">#{idx + 1}</span>
                        )}
                      </div>
                      {isXl && (
                        <div className="font-mono text-[10px] text-slate-600 dark:text-slate-400 truncate">
                          {tile.group} · Share {tile.volumeSharePct.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 font-mono font-bold tabular-nums leading-none ${
                      isXl ? 'text-xs' : 'text-[11px]'
                    } ${
                      tile.volatilityAbsPct < 0.15
                        ? 'text-slate-700 dark:text-slate-300'
                        : up
                          ? 'text-emerald-700 dark:text-[#22e0a1]'
                          : 'text-rose-700 dark:text-[#ff4d6d]'
                    }`}
                  >
                    {isFlat
                      ? '0.00%'
                      : `${up ? '▲' : '▼'}${tile.changePct >= 0 ? '+' : ''}${tile.changePct.toFixed(2)}%`}
                  </span>
                </div>

                {/* Middle detail for XL tiles */}
                {isXl && (
                  <div className="flex items-end justify-between gap-2 w-full">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Mark Price
                      </div>
                      <div className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-[#e8edfb]">
                        {formatPrice(tile.markPrice)}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-[10px] text-slate-600 dark:text-slate-400">
                        OI {formatUsd(tile.openInterestUsd, true)}
                      </div>
                      <div className="text-[10px] text-slate-700 dark:text-slate-300">
                        {tile.fundingAprPct >= 0 ? '+' : ''}
                        {tile.fundingAprPct.toFixed(1)}% APR
                      </div>
                    </div>
                  </div>
                )}

                {/* Bottom row: Primary intensity metric + Price/Share */}
                <div className="flex items-baseline justify-between gap-1.5 min-w-0 w-full pb-0.5 font-mono tabular-nums">
                  <span
                    className={`shrink-0 font-bold text-sky-700 dark:text-sky-300 ${
                      isXl ? 'text-xs' : 'text-[11px]'
                    }`}
                  >
                    {sortBy === 'oi'
                      ? formatUsd(tile.openInterestUsd, true)
                      : formatUsd(tile.volume24h, true)}
                  </span>
                  <span className="min-w-0 text-right text-[10px] text-slate-600 dark:text-slate-300/90 truncate">
                    {isXl ? (
                      `Intensity ${intensityPct}%`
                    ) : isLg ? (
                      <>
                        {formatPrice(tile.markPrice)}
                        <span className="hidden sm:inline"> · {tile.volumeSharePct.toFixed(1)}%</span>
                      </>
                    ) : (
                      formatPrice(tile.markPrice)
                    )}
                  </span>
                </div>

                {/* Bottom Volume / OI Intensity Meter */}
                <div
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 right-0 h-[3px] bg-slate-300/60 dark:bg-slate-900/80"
                >
                  <div
                    className="h-full transition-[width] duration-300"
                    style={{
                      width: `${Math.max(4, intensityPct)}%`,
                      backgroundColor: barColor,
                      opacity: 0.85,
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
