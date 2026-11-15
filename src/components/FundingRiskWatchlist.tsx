import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMarketStream } from '../context/MarketWebSocketContext';
import { deriveLiveLiquidationRisk, type ExplorerRiskCandidate } from '../utils/explorerLive';
import { formatPct, formatPrice } from '../utils/format';
import { TokenBadge } from './TraderAvatar';

const STORAGE = 'risexscan_watchlist_risk_v1';

const readLocalWatchlist = (): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE) || '[]');
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string').slice(0, 18) : [];
  } catch {
    return [];
  }
};

export const FundingRiskWatchlist: React.FC<{ onSelectMarket: (id: string) => void }> = ({
  onSelectMarket,
}) => {
  const { user, getIdToken } = useAuth();
  const { markets } = useMarketStream();
  const [selected, setSelected] = useState<string[]>(readLocalWatchlist);
  const [marketToAdd, setMarketToAdd] = useState('');
  const [fundingThreshold, setFundingThreshold] = useState(20);
  const [candidates, setCandidates] = useState<ExplorerRiskCandidate[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(selected));
    } catch {
      // ignore storage failure
    }
  }, [selected]);

  // Sync saved watchlist from Cloud SQL when signed in
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch('/api/watchlist', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.marketIds) && data.marketIds.length > 0) {
          setSelected(data.marketIds);
        }
      } catch {
        // non-blocking
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, getIdToken]);

  const persistRemote = async (next: string[]) => {
    if (!user) return;
    try {
      const token = await getIdToken();
      if (!token) return;
      await fetch('/api/watchlist', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ marketIds: next }),
      });
    } catch {
      // non-blocking
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const resp = await fetch('/api/liquidations', {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!resp.ok) return;
        const data = await resp.json();
        if (!controller.signal.aborted) {
          setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
        }
      } catch {
        // ignore transient refresh error
      }
    };
    void refresh();
    const timer = setInterval(refresh, 20000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, []);

  const byId = useMemo(
    () => new Map(markets.map((m) => [String(m.market_id), m])),
    [markets]
  );
  const selectedMarkets = useMemo(
    () => selected.map((id) => byId.get(id)).filter((m): m is (typeof markets)[number] => !!m),
    [selected, byId]
  );
  const affectedPositions = useMemo(
    () =>
      deriveLiveLiquidationRisk(candidates, markets, 500).filter((p) =>
        selected.includes(p.marketId)
      ),
    [candidates, markets, selected]
  );

  const updateSelected = (next: string[]) => {
    setSelected(next);
    void persistRemote(next);
  };

  return (
    <section
      className="sunrise-card rounded-xl p-4 sm:p-5 space-y-3"
      aria-label="Funding and liquidation watchlist"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-[#e8edfb]">
            Funding &amp; Liquidation Watchlist
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Track live funding APR and positions within 5% of liquidation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={marketToAdd}
            onChange={(e) => setMarketToAdd(e.target.value)}
            className="max-w-[220px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-[#080d18] dark:text-slate-300"
            aria-label="Select market to watch"
          >
            <option value="">Select a market…</option>
            {markets
              .filter((m) => m.active !== false && !selected.includes(String(m.market_id)))
              .map((m) => (
                <option key={m.market_id} value={String(m.market_id)}>
                  {m.display_name}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={!marketToAdd || selected.length >= 18}
            onClick={() => {
              if (marketToAdd && !selected.includes(marketToAdd)) {
                updateSelected([...selected, marketToAdd].slice(0, 18));
              }
              setMarketToAdd('');
            }}
            className="rounded-lg border border-amber-500/45 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap disabled:opacity-40 dark:border-[#ffb02e]/40 dark:text-[#ffb02e]"
          >
            + Watch
          </button>
          <label className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            APR ≥
            <select
              value={fundingThreshold}
              onChange={(e) => setFundingThreshold(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-slate-800 dark:border-slate-700 dark:bg-[#080d18] dark:text-slate-300"
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}%
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!selectedMarkets.length ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#080d18]">
          Add a market above to monitor its funding APR and &lt;5% liquidation proximity.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {selectedMarkets.map((m) => {
            const apr = Number(m.current_funding_rate || 0) * 24 * 365 * 100;
            const high = Math.abs(apr) >= fundingThreshold;
            const risk = affectedPositions.filter((p) => p.marketId === String(m.market_id));
            return (
              <div
                key={m.market_id}
                className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-[#080d18]"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectMarket(String(m.market_id))}
                    className="flex items-center gap-2 text-xs font-semibold text-slate-900 hover:text-amber-600 dark:text-[#e8edfb] dark:hover:text-[#ffb02e]"
                  >
                    <TokenBadge symbol={m.base_asset_symbol} category={m.category} size={22} />
                    {m.display_name}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateSelected(selected.filter((id) => id !== String(m.market_id)))
                    }
                    className="px-1 text-slate-400 hover:text-rose-600 dark:text-slate-500 dark:hover:text-[#ff4d6d]"
                    aria-label={`Remove ${m.display_name} from watchlist`}
                  >
                    ×
                  </button>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2 font-mono text-xs tabular-nums">
                  <span className="text-slate-500 dark:text-slate-400">Mark {formatPrice(m.mark_price)}</span>
                  <span
                    className={
                      high
                        ? 'text-amber-600 dark:text-[#ffb02e] font-bold'
                        : apr >= 0
                          ? 'text-emerald-600 dark:text-[#22e0a1]'
                          : 'text-rose-600 dark:text-[#ff4d6d]'
                    }
                  >
                    {formatPct(apr)} APR
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-500">&lt;5% Liq Risk</span>
                  <span className={risk.length ? 'text-rose-600 dark:text-[#ff4d6d] font-bold' : 'text-slate-500 dark:text-slate-400'}>
                    {risk.length}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
