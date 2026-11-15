import React, { useEffect, useMemo, useState } from 'react';
import { formatSignedUsd, formatUsd } from '../utils/format';
import { TokenBadge } from './TraderAvatar';

interface ChangeRow {
  marketId: string;
  cohort: string;
  fromTime: number | null;
  toTime: number;
  previousNetUsd: number | null;
  currentNetUsd: number;
  deltaNetUsd: number | null;
  currentLongUsd: number;
  currentShortUsd: number;
  positionCount: number;
}

interface PositionChangesResponse {
  fromTime: number | null;
  toTime: number | null;
  mode: 'unavailable' | 'current' | 'changes';
  changes: ChangeRow[];
  indexedTraders: number;
}

const TIERS = ['all', 'whale', 'shark', 'dolphin', 'fish', 'shrimp'] as const;

export const SmartMoneyChanges: React.FC<{
  marketNames?: Record<string, string>;
  onSelectMarket: (id: string) => void;
}> = ({ marketNames = {}, onSelectMarket }) => {
  const [data, setData] = useState<PositionChangesResponse | null>(null);
  const [tier, setTier] = useState<string>('all');
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/analytics/position-changes', { signal: controller.signal });
        if (!res.ok) throw new Error('Position feed unavailable');
        const json = (await res.json()) as PositionChangesResponse;
        if (!controller.signal.aborted) {
          setData(json);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    };
    void refresh();
    const timer = setInterval(refresh, 60_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  const comparing = data?.mode === 'changes' && data.fromTime !== null;
  const rows = useMemo(
    () =>
      (data?.changes || [])
        .filter((row) => tier === 'all' || row.cohort === tier)
        .slice(0, 12),
    [data, tier]
  );

  return (
    <section className="sunrise-card rounded-xl p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-[#e8edfb]">
            Smart Money · {comparing ? 'Positioning Changes' : 'Current Positioning'}
          </h2>
          <p className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400">
            {data?.toTime
              ? `${comparing && data.fromTime ? `${new Date(data.fromTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → ` : ''}${new Date(data.toTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${data.indexedTraders.toLocaleString()} accounts`
              : 'Live cohort net long/short exposure'}
          </p>
        </div>

        <div role="group" aria-label="Trader cohort filter" className="flex flex-wrap gap-1">
          {TIERS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTier(id)}
              className={`rounded-lg border px-2.5 py-1 text-[10px] font-mono capitalize whitespace-nowrap transition-colors ${
                tier === id
                  ? 'border-amber-500 bg-amber-500/12 font-semibold text-amber-700 dark:border-[#ffb02e] dark:bg-[#ffb02e]/15 dark:text-[#ffb02e]'
                  : 'border-slate-200 text-slate-600 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      {error && !data ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#080d18] dark:text-slate-400">
          Positioning feed temporarily unavailable.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#080d18] dark:text-slate-400">
          {data === null ? 'Loading cohort positioning…' : 'No open positions recorded for this cohort.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] font-mono tabular-nums">
            <thead className="text-slate-500 uppercase">
              <tr>
                <th className="py-2">Market</th>
                <th>Cohort</th>
                <th className="text-right">{comparing ? 'Net Δ' : 'Net Exposure'}</th>
                <th className="text-right">Long</th>
                <th className="text-right">Short</th>
                <th className="text-right">Positions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/50">
              {rows.map((row) => {
                const displayedNet =
                  comparing && row.deltaNetUsd !== null ? row.deltaNetUsd : row.currentNetUsd;
                return (
                  <tr key={`${row.marketId}-${row.cohort}`} className="hover:bg-slate-100/70 dark:hover:bg-[#131c31]/40">
                    <td className="py-2">
                      <button
                        type="button"
                        className="flex items-center gap-2 font-semibold text-slate-900 hover:text-amber-600 dark:text-[#e8edfb] dark:hover:text-[#ffb02e] whitespace-nowrap"
                        onClick={() => onSelectMarket(row.marketId)}
                      >
                        <TokenBadge
                          symbol={marketNames[row.marketId] || row.marketId}
                          size={19}
                        />
                        {marketNames[row.marketId] || `Market #${row.marketId}`}
                      </button>
                    </td>
                    <td className="py-2 capitalize text-slate-700 dark:text-slate-300">{row.cohort}</td>
                    <td
                      className={`py-2 text-right font-semibold ${
                        displayedNet >= 0 ? 'text-emerald-600 dark:text-[#22e0a1]' : 'text-rose-600 dark:text-[#ff4d6d]'
                      }`}
                    >
                      {formatSignedUsd(displayedNet, true)}
                    </td>
                    <td className="py-2 text-right text-emerald-600 dark:text-[#22e0a1]">
                      {formatUsd(row.currentLongUsd, true)}
                    </td>
                    <td className="py-2 text-right text-rose-600 dark:text-[#ff4d6d]">
                      {formatUsd(row.currentShortUsd, true)}
                    </td>
                    <td className="py-2 text-right text-slate-500 dark:text-slate-400">{row.positionCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
