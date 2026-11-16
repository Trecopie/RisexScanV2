import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownUp,
  Crown,
  ExternalLink,
  Eye,
  Filter,
  Loader2,
  Search,
  Trophy,
} from 'lucide-react';
import type { IndexedTrader, LeaderboardResponse, TimeframeKey } from '../types/risex';
import { formatPct, formatSignedUsd, formatUsd, shortAddress } from '../utils/format';
import { formatTraderDisplay, matchesTraderQuery } from '../utils/traderDisplay';
import { LeaderboardSyncDiagnostic } from './LeaderboardSyncDiagnostic';
import { TraderAvatar } from './TraderAvatar';

type SortKey =
  | 'pnl'
  | 'realized'
  | 'unrealized'
  | 'roi'
  | 'accountValue'
  | 'volume'
  | 'winRate'
  | 'sharpe';

type CohortFilter = 'all' | 'enriched' | 'positions' | 'whales' | 'profitable';

export const LeaderboardPage: React.FC<{
  onSelectWallet: (address: string) => void;
  onPeekTrader: (address: string, trader?: IndexedTrader) => void;
}> = ({ onSelectWallet, onPeekTrader }) => {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<TimeframeKey>('all');
  const [cohort, setCohort] = useState<CohortFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('pnl');
  const [sortDesc, setSortDesc] = useState(true);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagTarget, setDiagTarget] = useState('sqalf');
  const lbAbortRef = useRef<AbortController | null>(null);

  const loadLeaderboard = () => {
    lbAbortRef.current?.abort();
    const controller = new AbortController();
    lbAbortRef.current = controller;
    fetch('/api/leaderboard', { signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || `Leaderboard error (${r.status})`);
        return d as LeaderboardResponse;
      })
      .then((d) => {
        if (d?.traders) {
          setData(d);
          setError(null);
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError(err.message || 'Failed to load leaderboard');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  };

  useEffect(() => {
    loadLeaderboard();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadLeaderboard();
      }
    }, 15000);
    return () => {
      lbAbortRef.current?.abort();
      clearInterval(t);
    };
  }, []);

  const openDiagnosticFor = (target: string) => {
    setDiagTarget(target);
    setDiagOpen(true);
  };

  const getPeriodPnl = (t: IndexedTrader): number | null => {
    if (timeframe === '24h') return t.pnl24h;
    if (timeframe === '7d') return t.pnl7d;
    if (timeframe === '30d') return t.pnl30d;
    return t.totalPnlAll;
  };

  const getPeriodRoi = (t: IndexedTrader): number | null => {
    if (timeframe === '24h') return t.roi24hPct;
    if (timeframe === '7d') return t.roi7dPct;
    if (timeframe === '30d') return t.roi30dPct;
    return t.roiAllPct;
  };

  const getPeriodVol = (t: IndexedTrader): number => {
    if (timeframe === '24h') return t.volume24h;
    if (timeframe === '7d') return t.volume7d;
    if (timeframe === '30d') return t.volume30d;
    return t.volumeAll;
  };

  const filteredAndSorted = useMemo(() => {
    const raw = data?.traders || [];
    const q = search.trim().toLowerCase();

    const filtered = raw.filter((t) => {
      if (q && !matchesTraderQuery(t, q)) return false;
      if (cohort === 'enriched' && !t.portfolioEnriched) return false;
      if (cohort === 'positions' && t.openPositionsCount === 0) return false;
      if (cohort === 'whales' && t.accountValue < 10000) return false;
      if (cohort === 'profitable') {
        const p = getPeriodPnl(t);
        if (p === null || p <= 0) return false;
      }
      return true;
    });

    const getVal = (t: IndexedTrader): number | null => {
      switch (sortBy) {
        case 'pnl':
          return getPeriodPnl(t);
        case 'realized':
          return t.realizedPnlAll;
        case 'unrealized':
          return t.portfolioEnriched ? t.unrealizedPnl : null;
        case 'roi':
          return getPeriodRoi(t);
        case 'accountValue':
          return t.accountValue;
        case 'volume':
          return getPeriodVol(t);
        case 'winRate':
          return t.winRate;
        case 'sharpe':
          return t.sharpeRatio;
      }
    };

    return [...filtered].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sortDesc ? bv - av : av - bv;
    });
  }, [data, search, cohort, sortBy, sortDesc, timeframe]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDesc((d) => !d);
    } else {
      setSortBy(key);
      setSortDesc(true);
    }
  };

  const podiumTraders = filteredAndSorted.slice(0, 3);
  const podiumOrder =
    podiumTraders.length === 3
      ? [
          { trader: podiumTraders[1], rank: 2 },
          { trader: podiumTraders[0], rank: 1 },
          { trader: podiumTraders[2], rank: 3 },
        ]
      : podiumTraders.map((trader, idx) => ({ trader, rank: idx + 1 }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-sky-600 dark:text-sky-400">
            <Trophy className="h-3.5 w-3.5" />
            RISEx Trader Leaderboard
          </div>
          <h1 className="mt-0.5 font-display text-2xl font-bold text-slate-900 dark:text-[#e8edfb]">
            Traders by PnL, ROI &amp; Realized Performance
          </h1>
          <p className="mt-1 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-200">{data?.totalDiscovered?.toLocaleString() || 0}</span> indexed accounts ·{' '}
            <span className="font-semibold text-emerald-600 dark:text-[#22e0a1]">{data?.totalEnriched?.toLocaleString() || 0}</span> live portfolios
            {data?.indexingInProgress && (
              <span className="ml-2 inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">
                <Loader2 className="h-3 w-3 animate-spin" /> syncing…
              </span>
            )}
          </p>
        </div>

        {/* Timeframe Switcher + Sync Diagnostic Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDiagOpen((o) => !o)}
            aria-expanded={diagOpen}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-mono font-semibold transition-colors ${
              diagOpen
                ? 'border-blue-500/50 bg-blue-500/12 text-blue-700 dark:border-[#46a6ff]/60 dark:bg-[#46a6ff]/15 dark:text-[#46a6ff]'
                : 'border-slate-200 bg-white text-slate-700 hover:border-blue-500/50 hover:text-blue-700 dark:border-slate-700/50 dark:bg-[#090e1a] dark:text-slate-300 dark:hover:border-[#46a6ff]/50 dark:hover:text-[#46a6ff]'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            Sync Diagnostic
          </button>

          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/90 p-1 dark:border-slate-700/50 dark:bg-[#090e1a]">
            {(['24h', '7d', '30d', 'all'] as TimeframeKey[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`rounded-lg px-3 py-1.5 text-xs font-mono font-semibold uppercase transition-all ${
                  timeframe === tf
                    ? 'sunrise-gradient-btn'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-[#e8edfb]'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && !data && (
        <div className="flex items-center justify-between rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:border-[#ff4d6d]/40 dark:bg-[#ff4d6d]/10 dark:text-[#ff4d6d]">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              loadLeaderboard();
            }}
            className="rounded-lg border border-rose-500/40 px-3 py-1 font-mono hover:bg-rose-500/15 dark:border-[#ff4d6d]/40 dark:hover:bg-[#ff4d6d]/20"
          >
            Retry
          </button>
        </div>
      )}

      {diagOpen && (
        <LeaderboardSyncDiagnostic
          targetTrader={diagTarget}
          onTargetChange={setDiagTarget}
          onClose={() => setDiagOpen(false)}
          onSelectWallet={onSelectWallet}
          onResynced={loadLeaderboard}
        />
      )}

      {/* Top 3 Podium */}
      {!loading && podiumOrder.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-end">
          {podiumOrder.map(({ trader, rank }) => {
            const periodPnl = getPeriodPnl(trader);
            const periodRoi = getPeriodRoi(trader);
            const isFirst = rank === 1;
            const info = formatTraderDisplay(trader.address, trader.username);
            return (
              <div
                key={trader.address}
                onClick={() => onSelectWallet(trader.address)}
                className={`sunrise-card cursor-pointer rounded-xl p-4 transition-colors hover:border-slate-300 dark:hover:border-slate-600 ${
                  rank === 1 ? 'order-1 md:order-2' : rank === 2 ? 'order-2 md:order-1' : 'order-3'
                } ${
                  isFirst
                    ? 'border-sky-500/50 dark:border-sky-400/55 md:pb-5'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <TraderAvatar
                      address={trader.address}
                      avatarUrl={trader.avatarUrl}
                      username={info.displayName}
                      size={isFirst ? 40 : 36}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-mono font-bold shrink-0 ${
                            rank === 1
                              ? 'text-sky-600 dark:text-sky-400'
                              : rank === 2
                                ? 'text-slate-700 dark:text-slate-200'
                                : 'text-teal-600 dark:text-teal-300'
                          }`}
                        >
                          {rank === 1 && <Crown className="h-3 w-3" />}
                          #{rank}
                        </span>
                        <span className="truncate font-display text-base font-bold text-slate-900 dark:text-[#e8edfb]">
                          {info.displayName}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        <span>{shortAddress(trader.address, 6, 4)}</span>
                        {info.badgeLabel && (
                          <span className="text-[10px] font-semibold text-violet-600 dark:text-[#8b7bff]">
                            · {info.badgeLabel}
                          </span>
                        )}
                        {trader.xHandle && (
                          <span className="text-blue-600 dark:text-[#46a6ff]">@{trader.xHandle}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDiagnosticFor(trader.username || trader.address);
                      }}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-[#46a6ff]"
                      title="Compare snapshot vs live event logs"
                      aria-label={`Sync diagnostic for ${info.displayName}`}
                    >
                      <Activity className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPeekTrader(trader.address, trader);
                      }}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-sky-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-300"
                      title="Quick Peek"
                      aria-label={`Quick peek ${info.displayName}`}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-200/80 pt-3 font-mono tabular-nums dark:border-slate-800/70">
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">{timeframe.toUpperCase()} PnL</div>
                    <div
                      className={`text-sm font-bold ${
                        periodPnl === null
                          ? 'text-slate-500'
                          : periodPnl >= 0
                            ? 'text-emerald-600 dark:text-[#22e0a1]'
                            : 'text-rose-600 dark:text-[#ff4d6d]'
                      }`}
                    >
                      {periodPnl !== null ? formatSignedUsd(periodPnl, true) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-500">ROI</div>
                    <div
                      className={`text-sm font-semibold ${
                        (periodRoi ?? 0) >= 0
                          ? 'text-emerald-600 dark:text-[#22e0a1]'
                          : 'text-rose-600 dark:text-[#ff4d6d]'
                      }`}
                    >
                      {periodRoi !== null ? formatPct(periodRoi) : '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-slate-500">Acct Value</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-[#e8edfb]">
                      {trader.accountValue > 0 ? formatUsd(trader.accountValue, true) : '—'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Controls Bar */}
      <div className="sunrise-card flex flex-col gap-3 rounded-2xl p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
            <Filter className="h-3.5 w-3.5" /> Cohort:
          </span>
          {(
            [
              { id: 'all', label: 'All Discovered' },
              { id: 'enriched', label: 'Full Portfolios' },
              { id: 'positions', label: 'Active Positions' },
              { id: 'whales', label: 'Whales ($10K+)' },
              { id: 'profitable', label: 'Profitable' },
            ] as { id: CohortFilter; label: string }[]
          ).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCohort(c.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                cohort === c.id
                  ? 'border border-sky-500/40 bg-sky-500/12 text-sky-700 dark:border-sky-400/40 dark:bg-sky-400/15 dark:text-sky-300'
                  : 'border border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900 dark:border-slate-800 dark:bg-[#090e1a] dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter RISEx Vault, trader, or 0x…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-slate-700/60 dark:bg-[#090e1a] dark:text-[#e8edfb] dark:placeholder:text-slate-500 dark:focus:border-sky-400"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortKey);
              setSortDesc(true);
            }}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700/60 dark:bg-[#090e1a] dark:text-[#e8edfb] dark:focus:border-sky-400"
          >
            <option value="pnl">Sort: {timeframe.toUpperCase()} PnL</option>
            <option value="realized">Sort: Realized PnL</option>
            <option value="unrealized">Sort: Unrealized PnL</option>
            <option value="roi">Sort: ROI %</option>
            <option value="accountValue">Sort: Account Value</option>
            <option value="volume">Sort: Volume</option>
            <option value="winRate">Sort: Win Rate</option>
            <option value="sharpe">Sort: Sharpe Ratio</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="sunrise-card overflow-hidden rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 dark:border-slate-800/90 dark:bg-[#090e1a]/80 dark:text-slate-400">
              <tr>
                <th className="py-3 pl-4 pr-2">Rank</th>
                <th className="py-3 px-2">RISEx Trader</th>
                <th className="py-3 px-2 text-right cursor-pointer hover:text-sky-600 dark:hover:text-sky-400" onClick={() => toggleSort('accountValue')}>
                  <span className="inline-flex items-center gap-1">Acct Value <ArrowDownUp className="h-3 w-3" /></span>
                </th>
                <th className="py-3 px-2 text-right cursor-pointer hover:text-sky-600 dark:hover:text-sky-400" onClick={() => toggleSort('realized')}>
                  <span className="inline-flex items-center gap-1">Realized PnL <ArrowDownUp className="h-3 w-3" /></span>
                </th>
                <th className="py-3 px-2 text-right cursor-pointer hover:text-sky-600 dark:hover:text-sky-400" onClick={() => toggleSort('unrealized')}>
                  <span className="inline-flex items-center gap-1">Unrealized <ArrowDownUp className="h-3 w-3" /></span>
                </th>
                <th className="py-3 px-2 text-right cursor-pointer hover:text-sky-600 dark:hover:text-sky-400" onClick={() => toggleSort('pnl')}>
                  <span className="inline-flex items-center gap-1">{timeframe.toUpperCase()} PnL <ArrowDownUp className="h-3 w-3" /></span>
                </th>
                <th className="py-3 px-2 text-right cursor-pointer hover:text-sky-600 dark:hover:text-sky-400" onClick={() => toggleSort('roi')}>
                  <span className="inline-flex items-center gap-1">ROI % <ArrowDownUp className="h-3 w-3" /></span>
                </th>
                <th className="py-3 px-2 text-right cursor-pointer hover:text-sky-600 dark:hover:text-sky-400" onClick={() => toggleSort('volume')}>
                  <span className="inline-flex items-center gap-1">Volume <ArrowDownUp className="h-3 w-3" /></span>
                </th>
                <th className="py-3 px-2 text-right cursor-pointer hover:text-sky-600 dark:hover:text-sky-400" onClick={() => toggleSort('winRate')}>
                  Win %
                </th>
                <th className="py-3 px-2 text-center">Pos</th>
                <th className="py-3 pl-2 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/60 tabular-nums">
              {loading && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-sky-600 dark:text-sky-400" />
                    Indexing RISEx traders & usernames…
                  </td>
                </tr>
              )}
              {!loading &&
                filteredAndSorted.slice(0, pageSize).map((t, idx) => {
                  const periodPnl = getPeriodPnl(t);
                  const periodRoi = getPeriodRoi(t);
                  const periodVol = getPeriodVol(t);
                  const info = formatTraderDisplay(t.address, t.username);
                  return (
                    <tr
                      key={t.address}
                      onClick={() => onSelectWallet(t.address)}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-[#131c31]/70 transition-colors"
                    >
                      <td className="py-3 pl-4 pr-2 font-mono text-slate-500 dark:text-slate-400">#{idx + 1}</td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2.5">
                          <TraderAvatar
                            address={t.address}
                            avatarUrl={t.avatarUrl}
                            username={info.displayName}
                            size={28}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-semibold text-slate-900 dark:text-[#e8edfb] max-w-[160px]">
                                {info.displayName}
                              </span>
                              {info.badgeLabel && (
                                <span className="text-[10px] font-mono font-semibold text-violet-600 dark:text-[#8b7bff]">
                                  · {info.badgeLabel}
                                </span>
                              )}
                              {t.xHandle && (
                                <a
                                  href={`https://x.com/${t.xHandle}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-0.5 text-[10px] font-mono text-blue-600 hover:underline dark:text-[#46a6ff]"
                                >
                                  @{t.xHandle}
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                            </div>
                            <div className="font-mono text-[10px] text-slate-500">
                              {shortAddress(t.address, 8, 5)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-slate-800 dark:text-slate-200">
                        {t.accountValue > 0 ? formatUsd(t.accountValue, true) : '—'}
                      </td>
                      <td
                        className={`py-3 px-2 text-right font-mono font-medium ${
                          t.realizedPnlAll >= 0
                            ? 'text-emerald-600 dark:text-[#22e0a1]'
                            : 'text-rose-600 dark:text-[#ff4d6d]'
                        }`}
                      >
                        {formatSignedUsd(t.realizedPnlAll, true)}
                      </td>
                      <td
                        className={`py-3 px-2 text-right font-mono ${
                          t.unrealizedPnl > 0
                            ? 'text-emerald-600 dark:text-[#22e0a1]'
                            : t.unrealizedPnl < 0
                              ? 'text-rose-600 dark:text-[#ff4d6d]'
                              : 'text-slate-500'
                        }`}
                      >
                        {t.portfolioEnriched ? formatSignedUsd(t.unrealizedPnl, true) : '—'}
                      </td>
                      <td
                        className={`py-3 px-2 text-right font-mono font-semibold ${
                          periodPnl === null
                            ? 'text-slate-500'
                            : periodPnl >= 0
                              ? 'text-emerald-600 dark:text-[#22e0a1]'
                              : 'text-rose-600 dark:text-[#ff4d6d]'
                        }`}
                      >
                        {periodPnl !== null ? formatSignedUsd(periodPnl, true) : '—'}
                      </td>
                      <td
                        className={`py-3 px-2 text-right font-mono ${
                          (periodRoi ?? 0) >= 0
                            ? 'text-emerald-600 dark:text-[#22e0a1]'
                            : 'text-rose-600 dark:text-[#ff4d6d]'
                        }`}
                      >
                        {periodRoi !== null ? formatPct(periodRoi) : '—'}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-slate-700 dark:text-slate-300">
                        {periodVol > 0 ? formatUsd(periodVol, true) : '—'}
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-slate-700 dark:text-slate-300">
                        {t.winRate !== null ? formatPct(t.winRate, false) : '—'}
                      </td>
                      <td className="py-3 px-2 text-center font-mono">
                        {t.openPositionsCount > 0 ? (
                          <span className="rounded bg-sky-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">
                            {t.openPositionsCount}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">0</span>
                        )}
                      </td>
                      <td className="py-3 pl-2 pr-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDiagnosticFor(t.username || t.address);
                            }}
                            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-blue-500/60 hover:text-blue-600 dark:border-slate-700/60 dark:bg-[#090e1a] dark:text-slate-300 dark:hover:border-[#46a6ff]/60 dark:hover:text-[#46a6ff]"
                            title="Compare Snapshot vs Live Events"
                            aria-label={`Compare snapshot vs live events for ${info.displayName}`}
                          >
                            <Activity className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPeekTrader(t.address, t);
                            }}
                            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-sky-500/60 hover:text-sky-600 dark:border-slate-700/60 dark:bg-[#090e1a] dark:text-slate-300 dark:hover:border-sky-400/60 dark:hover:text-sky-300"
                            title="Quick peek"
                            aria-label={`Quick peek ${info.displayName}`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {!loading && filteredAndSorted.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    No traders match the active search or cohort filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredAndSorted.length > pageSize && (
          <div className="flex items-center justify-between border-t border-slate-200/80 px-4 py-3 text-xs text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
            <span>
              Showing {Math.min(pageSize, filteredAndSorted.length)} of {filteredAndSorted.length} matching traders
            </span>
            <button
              type="button"
              onClick={() => setPageSize((p) => p + 50)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-800 hover:border-sky-500 dark:border-slate-700 dark:bg-[#090e1a] dark:text-[#e8edfb] dark:hover:border-sky-400"
            >
              Load 50 More
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
