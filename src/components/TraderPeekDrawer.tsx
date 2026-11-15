import React, { useEffect, useState } from 'react';
import { ArrowUpRight, ExternalLink, Loader2, ShieldAlert, X } from 'lucide-react';
import type { IndexedTrader, WalletProfileData } from '../types/risex';
import { formatPct, formatPrice, formatSignedUsd, formatUsd, shortAddress } from '../utils/format';
import { formatTraderDisplay } from '../utils/traderDisplay';
import { CopyBtn, LiqDistanceBadge, TraderAvatar } from './TraderAvatar';

interface LiteWalletProfile {
  address: string;
  profile: WalletProfileData['profile'];
  summary: WalletProfileData['summary'];
  positions: WalletProfileData['positions'];
  liteWinRatePct?: number | null;
}

export const TraderPeekDrawer: React.FC<{
  traderAddress: string | null;
  seedTrader?: IndexedTrader | null;
  onClose: () => void;
  onOpenFullProfile: (address: string) => void;
  onSelectMarket: (marketId: string) => void;
}> = ({ traderAddress, seedTrader, onClose, onOpenFullProfile, onSelectMarket }) => {
  const [profile, setProfile] = useState<LiteWalletProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!traderAddress) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [traderAddress, onClose]);

  useEffect(() => {
    if (!traderAddress) {
      setProfile(null);
      setFetchError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFetchError(null);
    fetch(`/api/wallet/${encodeURIComponent(traderAddress)}?lite=1`, { signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || d?.error) throw new Error(d?.error || `Failed (${r.status})`);
        return d;
      })
      .then((d) => {
        setProfile(d);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setFetchError(err.message || 'Could not sync live wallet');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [traderAddress]);

  if (!traderAddress) return null;

  const rawUsername =
    profile?.profile?.username || seedTrader?.username || null;
  const traderInfo = formatTraderDisplay(traderAddress, rawUsername);
  const avatarUrl =
    profile?.profile?.avatar_url ||
    profile?.profile?.x_account?.profile_image_url ||
    seedTrader?.avatarUrl ||
    null;
  const xHandle =
    profile?.profile?.x_account?.username || seedTrader?.xHandle || null;

  const accountValue = profile?.summary
    ? Number(profile.summary.total_account_value)
    : seedTrader?.accountValue ?? 0;
  const unrealizedPnl = profile?.summary
    ? Number(profile.summary.total_unrealized_pnl)
    : seedTrader?.unrealizedPnl ?? 0;
  const realizedPnl = profile?.summary
    ? Number(profile.summary.realized_pnl)
    : seedTrader?.realizedPnlAll ?? 0;
  const winRate =
    profile?.liteWinRatePct !== undefined && profile?.liteWinRatePct !== null
      ? profile.liteWinRatePct
      : seedTrader?.winRate ?? null;
  const positions = profile?.positions || seedTrader?.positions || [];
  const riskLevel = profile?.summary?.risk_level || seedTrader?.riskLevel || 'NORMAL';
  const inLiq = profile?.summary?.in_liquidation ?? seedTrader?.inLiquidation ?? false;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-slate-900/45 dark:bg-black/65 backdrop-blur-xs"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-slate-200 dark:border-slate-700/40 bg-white dark:bg-[#090e1a] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800/80 p-5">
          <div className="flex items-center gap-3 min-w-0">
            <TraderAvatar
              address={traderAddress}
              avatarUrl={avatarUrl}
              username={rawUsername}
              size={44}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-display text-lg font-bold text-slate-900 dark:text-[#e8edfb]">
                  {traderInfo.displayName}
                </h3>
                {traderInfo.isVault && (
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-[#8b7bff]">
                    {traderInfo.badgeLabel}
                  </span>
                )}
                {xHandle && (
                  <a
                    href={`https://x.com/${xHandle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 rounded bg-blue-500/12 dark:bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-mono text-blue-600 dark:text-[#46a6ff] hover:bg-blue-500/20 dark:hover:bg-slate-700"
                  >
                    @{xHandle}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-xs font-mono text-slate-500 dark:text-slate-400">
                <span>{shortAddress(traderAddress, 10, 6)}</span>
                <CopyBtn text={traderAddress} />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trader peek drawer"
            className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {fetchError && !loading && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-[#ffb02e]">
              {fetchError}
            </div>
          )}
          {inLiq && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/12 px-3 py-2 text-xs text-rose-700 dark:text-[#ff4d6d]">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              Account currently flagged in liquidation state
            </div>
          )}

          {/* Core Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="sunrise-card rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Account Value</div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-[#e8edfb]">
                {formatUsd(accountValue)}
              </div>
            </div>
            <div className="sunrise-card rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Unrealized PnL</div>
              <div
                className={`mt-1 font-mono text-lg font-bold tabular-nums ${
                  unrealizedPnl >= 0 ? 'text-emerald-600 dark:text-[#22e0a1]' : 'text-rose-600 dark:text-[#ff4d6d]'
                }`}
              >
                {formatSignedUsd(unrealizedPnl)}
              </div>
            </div>
            <div className="sunrise-card rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Realized PnL</div>
              <div
                className={`mt-1 font-mono text-base font-bold tabular-nums ${
                  realizedPnl >= 0 ? 'text-emerald-600 dark:text-[#22e0a1]' : 'text-rose-600 dark:text-[#ff4d6d]'
                }`}
              >
                {formatSignedUsd(realizedPnl)}
              </div>
            </div>
            <div className="sunrise-card rounded-xl p-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Win Rate / Risk</div>
              <div className="mt-1 flex items-center justify-between font-mono text-sm font-semibold tabular-nums">
                <span className="text-slate-900 dark:text-[#e8edfb]">{winRate !== null ? formatPct(winRate, false) : '—'}</span>
                <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-700 dark:text-slate-300">
                  {riskLevel}
                </span>
              </div>
            </div>
          </div>

          {/* Open Positions */}
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Open Positions ({loading && positions.length === 0 ? (seedTrader?.openPositionsCount ?? 0) : positions.length})
              </h4>
              {loading && (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-[#ffb02e]">
                  <Loader2 className="h-3 w-3 animate-spin" /> Syncing live
                </span>
              )}
            </div>

            {positions.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-[#0e1526]/60 p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                {loading ? 'Loading open positions…' : 'No open perpetual positions right now.'}
              </div>
            ) : (
              <div className="space-y-2.5">
                {positions.slice(0, 6).map((pos, idx) => (
                  <div
                    key={`${pos.marketId}-${idx}`}
                    onClick={() => {
                      onSelectMarket(pos.marketId);
                      onClose();
                    }}
                    className="sunrise-card cursor-pointer rounded-xl p-3 hover:border-amber-500/50 dark:hover:border-[#ffb02e]/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm font-semibold text-slate-900 dark:text-[#e8edfb]">
                          {pos.marketName}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
                            pos.side === 'LONG'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-[#22e0a1]'
                              : 'bg-rose-500/15 text-rose-700 dark:text-[#ff4d6d]'
                          }`}
                        >
                          {pos.side} {pos.leverage.toFixed(1)}x
                        </span>
                      </div>
                      <span
                        className={`font-mono text-xs font-semibold tabular-nums ${
                          pos.unrealizedPnl >= 0 ? 'text-emerald-600 dark:text-[#22e0a1]' : 'text-rose-600 dark:text-[#ff4d6d]'
                        }`}
                      >
                        {formatSignedUsd(pos.unrealizedPnl)} ({formatPct(pos.roiPct)})
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>Size: {formatUsd(pos.notionalUsd, true)}</span>
                      <span>Entry: {formatPrice(pos.entryPrice)}</span>
                      <LiqDistanceBadge
                        markPrice={pos.markPrice}
                        liquidationPrice={pos.liquidationPrice}
                        side={pos.side}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="border-t border-slate-200 dark:border-slate-800/80 p-4">
          <button
            type="button"
            onClick={() => {
              onOpenFullProfile(traderAddress);
              onClose();
            }}
            className="sunrise-gradient-btn flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
          >
            Open Full Wallet Analytics
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </div>
  );
};
