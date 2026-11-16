import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  Eye,
  Filter,
  Loader2,
  Percent,
  Radar,
  Search,
  Users,
} from 'lucide-react';
import type {
  CohortPositionRow,
  CohortTierId,
  CohortsAnalyticsResponse,
  IndexedTrader,
} from '../types/risex';
import { formatPct, formatPrice, formatSignedUsd, formatUsd } from '../utils/format';
import { formatTraderDisplay, matchesTraderQuery } from '../utils/traderDisplay';
import { TokenBadge, TraderAvatar } from './TraderAvatar';
import { SmartMoneyChanges } from './SmartMoneyChanges';
import { FundingRiskWatchlist } from './FundingRiskWatchlist';

type SubView = 'bias' | 'markets' | 'positions' | 'radar';
type MatrixSortKey = 'openInterestUsd' | 'volume24h' | 'fundingAprPct' | 'divergencePct' | 'whaleBiasPct';

function BiasBar({ longNotional, shortNotional, biasPct }: { longNotional: number; shortNotional: number; biasPct: number }) {
  const total = longNotional + shortNotional;
  const longPct = total > 0 ? (longNotional / total) * 100 : 50;
  return (
    <div className="space-y-1 min-w-[130px]">
      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
        <span className="text-emerald-600 dark:text-[#22e0a1]">L {longPct.toFixed(0)}%</span>
        <span
          className={`font-semibold ${
            biasPct >= 10
              ? 'text-emerald-600 dark:text-[#22e0a1]'
              : biasPct <= -10
                ? 'text-rose-600 dark:text-[#ff4d6d]'
                : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {biasPct >= 0 ? '+' : ''}
          {biasPct.toFixed(0)}%
        </span>
        <span className="text-rose-600 dark:text-[#ff4d6d]">S {(100 - longPct).toFixed(0)}%</span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-sm bg-slate-200 dark:bg-slate-800/90">
        <div className="bg-emerald-500 dark:bg-[#22e0a1]" style={{ width: `${longPct}%` }} />
        <div className="bg-rose-500 dark:bg-[#ff4d6d]" style={{ width: `${100 - longPct}%` }} />
      </div>
    </div>
  );
}

function formatBiasValue(biasPct: number, hasFlow: boolean) {
  if (!hasFlow) return <span className="text-slate-400 dark:text-slate-600">—</span>;
  const cls =
    biasPct >= 15
      ? 'text-emerald-600 dark:text-[#22e0a1]'
      : biasPct <= -15
        ? 'text-rose-600 dark:text-[#ff4d6d]'
        : 'text-slate-700 dark:text-slate-300';
  return (
    <span className={`font-mono font-medium ${cls}`}>
      {biasPct >= 0 ? '+' : ''}
      {biasPct.toFixed(0)}%
    </span>
  );
}

export const CohortsPage: React.FC<{
  onSelectWallet: (address: string) => void;
  onSelectMarket: (marketId: string) => void;
  onPeekTrader: (address: string, trader?: IndexedTrader) => void;
}> = ({ onSelectWallet, onSelectMarket, onPeekTrader }) => {
  const [data, setData] = useState<CohortsAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subView, setSubView] = useState<SubView>('bias');

  // Market Matrix sort/search
  const [marketSearch, setMarketSearch] = useState('');
  const [matrixSort, setMatrixSort] = useState<MatrixSortKey>('openInterestUsd');
  const [matrixDesc, setMatrixDesc] = useState(true);

  // Cohort Positions filters
  const [tierFilter, setTierFilter] = useState<'all' | CohortTierId>('all');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [posSearch, setPosSearch] = useState('');
  const abortRef = React.useRef<AbortController | null>(null);

  const loadCohorts = () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetch('/api/cohorts', { signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || `Cohorts error (${r.status})`);
        return d as CohortsAnalyticsResponse;
      })
      .then((d) => {
        if (d?.sizeCohorts) {
          setData(d);
          setError(null);
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError(err.message || 'Failed to load cohort analytics');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  };

  useEffect(() => {
    loadCohorts();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadCohorts();
    }, 15000);
    return () => {
      abortRef.current?.abort();
      clearInterval(timer);
    };
  }, []);

  const filteredMarkets = useMemo(() => {
    const rows = data?.marketCohorts || [];
    const q = marketSearch.trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (m) =>
            m.displayName.toLowerCase().includes(q) ||
            m.symbol.toLowerCase().includes(q)
        )
      : rows;
    return [...filtered].sort((a, b) => {
      const av = matrixSort === 'divergencePct' ? Math.abs(a.divergencePct) : a[matrixSort];
      const bv = matrixSort === 'divergencePct' ? Math.abs(b.divergencePct) : b[matrixSort];
      return matrixDesc ? bv - av : av - bv;
    });
  }, [data, marketSearch, matrixSort, matrixDesc]);

  const filteredPositions = useMemo(() => {
    const rows = data?.topPositions || [];
    const q = posSearch.trim().toLowerCase();
    return rows.filter((p) => {
      if (tierFilter !== 'all' && p.cohort !== tierFilter) return false;
      if (sideFilter !== 'ALL' && p.side !== sideFilter) return false;
      if (q) {
        const hitMarket = p.marketName.toLowerCase().includes(q);
        const hitTrader = matchesTraderQuery(p, q);
        if (!hitMarket && !hitTrader) return false;
      }
      return true;
    });
  }, [data, tierFilter, sideFilter, posSearch]);

  const fundingTopLongsPay = useMemo(
    () =>
      [...(data?.marketCohorts || [])]
        .filter((m) => m.fundingRate1hPct > 0)
        .sort((a, b) => b.fundingAprPct - a.fundingAprPct)
        .slice(0, 12),
    [data]
  );

  const fundingTopShortsPay = useMemo(
    () =>
      [...(data?.marketCohorts || [])]
        .filter((m) => m.fundingRate1hPct < 0)
        .sort((a, b) => a.fundingAprPct - b.fundingAprPct)
        .slice(0, 12),
    [data]
  );

  const toggleMatrixSort = (key: MatrixSortKey) => {
    if (matrixSort === key) setMatrixDesc((d) => !d);
    else {
      setMatrixSort(key);
      setMatrixDesc(true);
    }
  };

  const renderPositionRow = (p: CohortPositionRow, idx: number, showLiqDist = false) => {
    const info = formatTraderDisplay(p.address, p.username);
    return (
      <tr
        key={`${p.address}-${p.marketId}-${idx}`}
        onClick={() => onSelectWallet(p.address)}
        className="cursor-pointer hover:bg-slate-100/80 dark:hover:bg-[#131c31]/65 transition-colors"
      >
        <td className="py-2.5 pl-4 pr-2">
          <div className="flex items-center gap-2">
            <TraderAvatar address={p.address} avatarUrl={p.avatarUrl} username={p.username} size={24} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate font-semibold text-slate-900 dark:text-[#e8edfb] max-w-[140px]">
                  {info.displayName}
                </span>
                {info.isVault && (
                  <span className="font-mono text-[9px] font-semibold uppercase text-violet-600 dark:text-[#8b7bff] shrink-0">
                    Vault
                  </span>
                )}
              </div>
              <div className="font-mono text-[10px] text-slate-500">
                {p.cohortLabel} · {formatUsd(p.portfolioValue, true)} eq
              </div>
            </div>
          </div>
        </td>
        <td className="py-2.5 px-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectMarket(p.marketId);
            }}
            className="font-semibold text-slate-900 dark:text-[#e8edfb] hover:text-sky-600 dark:hover:text-sky-400"
          >
            {p.marketName}
          </button>
        </td>
        <td className="py-2.5 px-2">
          <span
            className={`font-mono text-[11px] font-bold ${
              p.side === 'LONG' ? 'text-emerald-600 dark:text-[#22e0a1]' : 'text-rose-600 dark:text-[#ff4d6d]'
            }`}
          >
            {p.side} {p.leverage > 0 ? `${p.leverage.toFixed(1)}x` : ''}
          </span>
        </td>
        <td className="py-2.5 px-2 text-right font-mono text-slate-800 dark:text-slate-200">{formatUsd(p.notionalUsd, true)}</td>
        <td className="py-2.5 px-2 text-right font-mono text-slate-600 dark:text-slate-300">{formatPrice(p.entryPrice)}</td>
        <td className="py-2.5 px-2 text-right font-mono text-slate-500 dark:text-slate-400">
          {p.liquidationPrice > 0 ? formatPrice(p.liquidationPrice) : '—'}
        </td>
        {showLiqDist && (
          <td className="py-2.5 px-2 text-right font-mono font-semibold text-orange-600 dark:text-orange-400">
            {p.distanceToLiqPct !== null ? `${p.distanceToLiqPct.toFixed(2)}%` : '—'}
          </td>
        )}
        <td
          className={`py-2.5 px-2 text-right font-mono font-semibold ${
            p.unrealizedPnl >= 0 ? 'text-emerald-600 dark:text-[#22e0a1]' : 'text-rose-600 dark:text-[#ff4d6d]'
          }`}
        >
          {formatSignedUsd(p.unrealizedPnl, true)}
        </td>
        <td className="py-2.5 pl-2 pr-4 text-right">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPeekTrader(p.address);
            }}
            aria-label={`Quick peek ${info.displayName}`}
            className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070b14] p-1 text-slate-500 dark:text-slate-400 hover:border-sky-500/60 dark:hover:border-sky-400/60 hover:text-sky-600 dark:hover:text-sky-400"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-5">
      {/* Page Header & View Switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200 dark:border-slate-800/80 pb-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-sky-600 dark:text-sky-400">
            COHORT TRACKER · POSITIONING &amp; FUNDING RADAR
          </div>
          <h1 className="mt-0.5 font-display text-2xl font-bold text-slate-900 dark:text-[#e8edfb]">
            Whale vs. Retail Positioning Explorer
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-[#070b14] p-1">
          {(
            [
              { id: 'bias', label: 'Cohort Bias', icon: <Users className="h-3.5 w-3.5" /> },
              { id: 'markets', label: 'Market Matrix', icon: <ArrowDownUp className="h-3.5 w-3.5" /> },
              { id: 'positions', label: 'Whale Positions', icon: <Filter className="h-3.5 w-3.5" /> },
              { id: 'radar', label: 'Funding & Liq Radar', icon: <Radar className="h-3.5 w-3.5" /> },
            ] as { id: SubView; label: string; icon: React.ReactNode }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubView(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                subView === t.id
                  ? 'sunrise-gradient-btn font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-[#e8edfb]'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && !data && (
        <div className="flex items-center justify-between rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:text-[#ff4d6d]">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              loadCohorts();
            }}
            className="rounded-lg border border-rose-500/40 px-3 py-1 font-mono hover:bg-rose-500/20"
          >
            Retry
          </button>
        </div>
      )}

      {/* Global Cohort Telemetry Strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="sunrise-card rounded-xl border-t-2 border-t-violet-500/70 dark:border-t-[#8b7bff]/60 p-3.5">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Indexed Wallets</div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-[#e8edfb]">
            {data ? data.summary.enrichedTraders.toLocaleString() : '—'}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-500">
            {data ? `${data.summary.activeTradersWithPositions.toLocaleString()} with open positions` : ''}
          </div>
        </div>

        <div className="sunrise-card rounded-xl border-t-2 border-t-emerald-500/70 dark:border-t-[#22e0a1]/60 p-3.5">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Tracked Equity</div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-[#e8edfb]">
            {data ? formatUsd(data.summary.totalIndexedEquity, true) : '—'}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-500">
            OI Tracked {data ? formatUsd(data.summary.totalIndexedNotional, true) : '—'}
          </div>
        </div>

        <div className="sunrise-card rounded-xl border-t-2 border-t-teal-500/70 dark:border-t-[#03DE82]/60 p-3.5">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Long vs Short OI</div>
          <div className="mt-1 font-mono text-sm font-bold tabular-nums">
            <span className="text-emerald-600 dark:text-[#22e0a1]">
              {data ? formatUsd(data.summary.totalLongNotional, true) : '—'}
            </span>
            <span className="mx-1.5 text-slate-400 dark:text-slate-600">/</span>
            <span className="text-rose-600 dark:text-[#ff4d6d]">
              {data ? formatUsd(data.summary.totalShortNotional, true) : '—'}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
            Net Bias {data ? `${data.summary.globalBiasPct >= 0 ? '+' : ''}${data.summary.globalBiasPct.toFixed(1)}%` : '—'}
          </div>
        </div>

        <div className="sunrise-card rounded-xl border-t-2 border-t-sky-500/70 dark:border-t-sky-400/60 p-3.5">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Exchange Open Interest</div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-sky-600 dark:text-sky-400">
            {data ? formatUsd(data.summary.totalMarketOiUsd, true) : '—'}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-500">All active RISEx markets</div>
        </div>

        <div className="sunrise-card rounded-xl border-t-2 border-t-blue-500/70 dark:border-t-[#46a6ff]/60 p-3.5">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">24h Exchange Vol</div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-blue-600 dark:text-[#46a6ff]">
            {data ? formatUsd(data.summary.totalMarketVolume24h, true) : '—'}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-500">Live 24h perp volume</div>
        </div>
      </section>

      {loading && !data ? (
        <div className="sunrise-card flex items-center justify-center rounded-xl py-16 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />
          Aggregating live wallet cohorts &amp; open positions…
        </div>
      ) : null}

      {/* VIEW 1: Size Cohorts + Performance Cohorts */}
      {data && subView === 'bias' && (
        <div className="space-y-5">
          {/* Equity Size Cohorts Table */}
          <div className="sunrise-card overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 px-4 py-3">
              <div>
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-[#e8edfb]">
                  Wallet Size Cohorts (Whales → Shrimp)
                </h2>
              </div>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                Real-time aggregated exposure across {data.summary.enrichedTraders.toLocaleString()} wallets
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-[#070b14] text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 pl-4 pr-2">Cohort Tier</th>
                    <th className="py-2.5 px-2 text-right">Traders</th>
                    <th className="py-2.5 px-2 text-right">Total Equity</th>
                    <th className="py-2.5 px-2 text-right">Open Notional</th>
                    <th className="py-2.5 px-3">Long / Short Bias</th>
                    <th className="py-2.5 px-2 text-right">Bias Signal</th>
                    <th className="py-2.5 px-2 text-right">Avg Lev</th>
                    <th className="py-2.5 px-2 text-right">Net uPnL</th>
                    <th className="py-2.5 pl-2 pr-4 text-right">% in Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/60 tabular-nums">
                  {data.sizeCohorts.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => {
                        setTierFilter(c.id);
                        setSubView('positions');
                      }}
                      className="cursor-pointer hover:bg-slate-100/80 dark:hover:bg-[#131c31]/65 transition-colors"
                    >
                      <td className="py-3 pl-4 pr-2">
                        <div className="font-display text-sm font-bold text-slate-900 dark:text-[#e8edfb]">{c.label}</div>
                        <div className="font-mono text-[10px] text-slate-500">{c.thresholdDesc}</div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-slate-800 dark:text-slate-200">
                        <div>{c.tradersCount.toLocaleString()}</div>
                        <div className="text-[10px] text-slate-500">{c.activeTradersCount} open</div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-slate-800 dark:text-slate-200">
                        {formatUsd(c.totalEquity, true)}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-sky-600 dark:text-sky-400">
                        {formatUsd(c.totalNotional, true)}
                      </td>
                      <td className="py-3 px-3">
                        <BiasBar
                          longNotional={c.longNotional}
                          shortNotional={c.shortNotional}
                          biasPct={c.biasPct}
                        />
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-[11px] font-bold">
                        <span
                          className={
                            c.biasLabel === 'NET LONG'
                              ? 'text-emerald-600 dark:text-[#22e0a1]'
                              : c.biasLabel === 'NET SHORT'
                                ? 'text-rose-600 dark:text-[#ff4d6d]'
                                : 'text-slate-500 dark:text-slate-400'
                          }
                        >
                          {c.biasLabel}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-slate-600 dark:text-slate-300">
                        {c.avgLeverage > 0 ? `${c.avgLeverage.toFixed(2)}x` : '—'}
                      </td>
                      <td
                        className={`py-3 px-2 text-right font-mono font-semibold ${
                          c.netUnrealizedPnl >= 0 ? 'text-emerald-600 dark:text-[#22e0a1]' : 'text-rose-600 dark:text-[#ff4d6d]'
                        }`}
                      >
                        {formatSignedUsd(c.netUnrealizedPnl, true)}
                      </td>
                      <td className="py-3 pl-2 pr-4 text-right font-mono text-slate-800 dark:text-slate-200">
                        {formatPct(c.pctInProfit, false)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Performance Cohorts (Smart Money vs Underwater) */}
          <div className="sunrise-card overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 px-4 py-3">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-[#e8edfb]">
                Performance Cohorts (Smart Money vs. Underwater)
              </h2>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                Indexed portfolio PnL cohorts &amp; current directional tilt
              </span>
            </div>
            <div className="grid grid-cols-1 divide-y divide-slate-200 dark:divide-slate-800/70 sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
              {data.performanceCohorts.map((p) => (
                <div key={p.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-display text-sm font-bold text-slate-900 dark:text-[#e8edfb]">{p.label}</div>
                      <div className="font-mono text-[10px] text-slate-500">{p.ruleDesc}</div>
                    </div>
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{p.tradersCount} accts</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs tabular-nums pt-1">
                    <div>
                      <div className="text-[10px] text-slate-500">EQUITY</div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{formatUsd(p.totalEquity, true)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-500">NET uPnL</div>
                      <div className={`font-semibold ${p.netUnrealizedPnl >= 0 ? 'text-emerald-600 dark:text-[#22e0a1]' : 'text-rose-600 dark:text-[#ff4d6d]'}`}>
                        {formatSignedUsd(p.netUnrealizedPnl, true)}
                      </div>
                    </div>
                  </div>
                  <BiasBar
                    longNotional={p.longNotional}
                    shortNotional={p.shortNotional}
                    biasPct={p.biasPct}
                  />
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    <span>{p.activeTradersCount} open</span>
                    <span>Avg Lev {p.avgLeverage > 0 ? `${p.avgLeverage.toFixed(1)}x` : '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <SmartMoneyChanges
            marketNames={Object.fromEntries((data.marketCohorts||[]).map(m=>[m.marketId,m.displayName]))}
            onSelectMarket={onSelectMarket}
          />
          <FundingRiskWatchlist onSelectMarket={onSelectMarket} />
        </div>
      )}

      {/* VIEW 2: Per-Market Whale vs Retail Matrix (RiseScreener + HyperTracker) */}
      {data && subView === 'markets' && (
        <div className="sunrise-card overflow-hidden rounded-xl">
          <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-slate-800/80 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-[#e8edfb]">
                Per-Market Cohort Matrix &amp; Whale/Retail Divergence
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Compare Whale/Shark ($25K+) directional bias against Fish/Shrimp (&lt;$5K) across every pair.
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={marketSearch}
                onChange={(e) => setMarketSearch(e.target.value)}
                placeholder="Filter pair (e.g. BTC, ETH)…"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700/70 bg-white dark:bg-[#070b14] py-1.5 pl-8 pr-3 text-xs text-slate-900 dark:text-[#e8edfb] placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-sky-500 dark:focus:border-sky-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-[#070b14] text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-2.5 pl-4 pr-2">Market</th>
                  <th className="py-2.5 px-2 text-right">Mark</th>
                  <th
                    className="py-2.5 px-2 text-right cursor-pointer hover:text-sky-600 dark:hover:text-sky-400"
                    onClick={() => toggleMatrixSort('openInterestUsd')}
                  >
                    Open Interest
                  </th>
                  <th
                    className="py-2.5 px-2 text-right cursor-pointer hover:text-sky-600 dark:hover:text-sky-400"
                    onClick={() => toggleMatrixSort('volume24h')}
                  >
                    24h Vol
                  </th>
                  <th
                    className="py-2.5 px-2 text-right cursor-pointer hover:text-sky-600 dark:hover:text-sky-400"
                    onClick={() => toggleMatrixSort('fundingAprPct')}
                  >
                    Funding (APR)
                  </th>
                  <th
                    className="py-2.5 px-2 text-right cursor-pointer hover:text-sky-600 dark:hover:text-sky-400"
                    onClick={() => toggleMatrixSort('whaleBiasPct')}
                  >
                    Whale/Shark Bias
                  </th>
                  <th className="py-2.5 px-2 text-right">Dolphin Bias</th>
                  <th className="py-2.5 px-2 text-right">Fish/Shrimp Bias</th>
                  <th
                    className="py-2.5 pl-2 pr-4 text-right cursor-pointer hover:text-sky-600 dark:hover:text-sky-400"
                    onClick={() => toggleMatrixSort('divergencePct')}
                  >
                    Divergence
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/60 tabular-nums">
                {filteredMarkets.map((m) => {
                  const hasWhale = m.whaleLong + m.whaleShort > 0;
                  const hasRetail = m.retailLong + m.retailShort > 0;
                  const divActive = hasWhale && hasRetail;
                  return (
                    <tr
                      key={m.marketId}
                      onClick={() => onSelectMarket(m.marketId)}
                      className="cursor-pointer hover:bg-slate-100/80 dark:hover:bg-[#131c31]/65 transition-colors"
                    >
                      <td className="py-2.5 pl-4 pr-2">
                        <div className="flex items-center gap-2">
                          <TokenBadge symbol={m.symbol} size={22} />
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-[#e8edfb]">{m.displayName}</div>
                            <div className="font-mono text-[10px] text-slate-500">
                              {m.positionsCount} indexed pos
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-slate-800 dark:text-slate-200">
                        {formatPrice(m.markPrice)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-sky-600 dark:text-sky-400">
                        {formatUsd(m.openInterestUsd, true)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-slate-600 dark:text-slate-300">
                        {formatUsd(m.volume24h, true)}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono ${
                          m.fundingRate1hPct >= 0 ? 'text-emerald-600 dark:text-[#22e0a1]' : 'text-rose-600 dark:text-[#ff4d6d]'
                        }`}
                      >
                        <div>{m.fundingRate1hPct >= 0 ? '+' : ''}{m.fundingRate1hPct.toFixed(4)}%</div>
                        <div className="text-[10px] text-slate-500">{m.fundingAprPct.toFixed(1)}% APR</div>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        {formatBiasValue(m.whaleBiasPct, hasWhale)}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        {formatBiasValue(m.dolphinBiasPct, Math.abs(m.dolphinBiasPct) > 0)}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        {formatBiasValue(m.retailBiasPct, hasRetail)}
                      </td>
                      <td className="py-2.5 pl-2 pr-4 text-right font-mono">
                        {divActive ? (
                          <span
                            className={`font-semibold ${
                              Math.abs(m.divergencePct) >= 50 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {m.divergencePct >= 0 ? '+' : ''}
                            {m.divergencePct.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: Filterable Cohort Positions Feed */}
      {data && subView === 'positions' && (
        <div className="space-y-3">
          <div className="sunrise-card flex flex-col gap-3 rounded-xl p-3.5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'All Tiers' },
                  { id: 'whale', label: 'Whales' },
                  { id: 'shark', label: 'Sharks' },
                  { id: 'dolphin', label: 'Dolphins' },
                  { id: 'fish', label: 'Fish' },
                  { id: 'shrimp', label: 'Shrimp' },
                ] as { id: 'all' | CohortTierId; label: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTierFilter(t.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    tierFilter === t.id
                      ? 'bg-sky-500/15 dark:bg-sky-400/18 text-sky-700 dark:text-sky-300 border border-sky-500/45 dark:border-sky-400/45'
                      : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#070b14] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-[#070b14] p-0.5 text-xs font-mono">
                {(['ALL', 'LONG', 'SHORT'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSideFilter(s)}
                    className={`rounded px-2.5 py-1 ${
                      sideFilter === s
                        ? s === 'LONG'
                          ? 'bg-emerald-500/20 text-emerald-700 dark:text-[#22e0a1]'
                          : s === 'SHORT'
                            ? 'bg-rose-500/20 text-rose-700 dark:text-[#ff4d6d]'
                            : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-[#e8edfb] shadow-xs dark:shadow-none'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="relative sm:w-56">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={posSearch}
                  onChange={(e) => setPosSearch(e.target.value)}
                  placeholder="Market, trader, 0x…"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700/70 bg-white dark:bg-[#070b14] py-1.5 pl-8 pr-2.5 text-xs text-slate-900 dark:text-[#e8edfb] placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-sky-500 dark:focus:border-sky-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="sunrise-card overflow-hidden rounded-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-[#070b14] text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 pl-4 pr-2">Trader &amp; Cohort</th>
                    <th className="py-2.5 px-2">Market</th>
                    <th className="py-2.5 px-2">Side</th>
                    <th className="py-2.5 px-2 text-right">Notional</th>
                    <th className="py-2.5 px-2 text-right">Entry</th>
                    <th className="py-2.5 px-2 text-right">Liq Price</th>
                    <th className="py-2.5 px-2 text-right">uPnL</th>
                    <th className="py-2.5 pl-2 pr-4 text-right">Peek</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/60 tabular-nums">
                  {filteredPositions.map((p, idx) => renderPositionRow(p, idx, false))}
                  {filteredPositions.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-500">
                        No open positions match this cohort filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: RiseScreener-Style Funding Carry & Near-Liquidation Radar */}
      {data && subView === 'radar' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Longs Pay Shorts */}
            <div className="sunrise-card overflow-hidden rounded-xl">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-emerald-600 dark:text-[#22e0a1]" />
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-[#e8edfb]">
                    Highest Positive Funding (Shorts Earn)
                  </h3>
                </div>
                <span className="font-mono text-[10px] text-slate-500">1h / Annualized</span>
              </div>
              <div className="divide-y divide-slate-200/80 dark:divide-slate-800/60 text-xs tabular-nums">
                {fundingTopLongsPay.map((m) => (
                  <button
                    key={m.marketId}
                    type="button"
                    onClick={() => onSelectMarket(m.marketId)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-100/80 dark:hover:bg-[#131c31]/65"
                  >
                    <div className="flex items-center gap-2">
                      <TokenBadge symbol={m.symbol} size={20} />
                      <span className="font-semibold text-slate-900 dark:text-[#e8edfb]">{m.displayName}</span>
                      <span className="font-mono text-[10px] text-slate-500">OI {formatUsd(m.openInterestUsd, true)}</span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="font-semibold text-emerald-600 dark:text-[#22e0a1]">+{m.fundingRate1hPct.toFixed(4)}%/h</span>
                      <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-400">+{m.fundingAprPct.toFixed(1)}% APR</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Shorts Pay Longs */}
            <div className="sunrise-card overflow-hidden rounded-xl">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-rose-600 dark:text-[#ff4d6d]" />
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-[#e8edfb]">
                    Deepest Negative Funding (Longs Earn)
                  </h3>
                </div>
                <span className="font-mono text-[10px] text-slate-500">1h / Annualized</span>
              </div>
              <div className="divide-y divide-slate-200/80 dark:divide-slate-800/60 text-xs tabular-nums">
                {fundingTopShortsPay.map((m) => (
                  <button
                    key={m.marketId}
                    type="button"
                    onClick={() => onSelectMarket(m.marketId)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-100/80 dark:hover:bg-[#131c31]/65"
                  >
                    <div className="flex items-center gap-2">
                      <TokenBadge symbol={m.symbol} size={20} />
                      <span className="font-semibold text-slate-900 dark:text-[#e8edfb]">{m.displayName}</span>
                      <span className="font-mono text-[10px] text-slate-500">OI {formatUsd(m.openInterestUsd, true)}</span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="font-semibold text-rose-600 dark:text-[#ff4d6d]">{m.fundingRate1hPct.toFixed(4)}%/h</span>
                      <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-400">{m.fundingAprPct.toFixed(1)}% APR</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Near Liquidation Risk Radar */}
          <div className="sunrise-card overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-[#e8edfb]">
                  Near-Liquidation Watchlist (&lt;5% Distance)
                </h3>
              </div>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {data.liquidationRadar.length} active warnings
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-[#070b14] text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2.5 pl-4 pr-2">Trader &amp; Cohort</th>
                    <th className="py-2.5 px-2">Market</th>
                    <th className="py-2.5 px-2">Side</th>
                    <th className="py-2.5 px-2 text-right">Notional</th>
                    <th className="py-2.5 px-2 text-right">Entry</th>
                    <th className="py-2.5 px-2 text-right">Liq Price</th>
                    <th className="py-2.5 px-2 text-right">Liq Buffer</th>
                    <th className="py-2.5 px-2 text-right">uPnL</th>
                    <th className="py-2.5 pl-2 pr-4 text-right">Peek</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/60 tabular-nums">
                  {data.liquidationRadar.map((p, idx) => renderPositionRow(p, idx, true))}
                  {data.liquidationRadar.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        No indexed open positions are currently within 5% of liquidation price.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
