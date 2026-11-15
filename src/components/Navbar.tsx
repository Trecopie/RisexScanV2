import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Blocks,
  Compass,
  Moon,
  Search,
  Sun,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import type { IndexedTrader, RisexMarket } from '../types/risex';
import { calcMarketChangePct, formatPct, formatPrice, formatSignedUsd, shortAddress } from '../utils/format';
import { formatTraderDisplay } from '../utils/traderDisplay';
import { RisexSymbol } from './RisexSymbol';
import { TokenBadge, TraderAvatar } from './TraderAvatar';

export type NavTab = 'overview' | 'markets' | 'cohorts' | 'leaderboard' | 'explorer' | 'wallet';

interface NavbarProps {
  activeTab: NavTab;
  onNavigate: (tab: NavTab) => void;
  onGlobalSearch: (query: string) => void;
  onSelectWallet: (address: string) => void;
  onSelectMarket: (marketId: string) => void;
  markets: RisexMarket[];
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onNavigate,
  onGlobalSearch,
  onSelectWallet,
  onSelectMarket,
  markets,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState<{ markets: RisexMarket[]; traders: IndexedTrader[] }>({
    markets: [],
    traders: [],
  });
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setMobileSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults({ markets: [], traders: [] });
      setSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && !controller.signal.aborted) {
            setResults({
              markets: d.markets || [],
              traders: d.traders || [],
            });
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchOpen(false);
      onGlobalSearch(query.trim());
    }
  };

  const navItems: {
    id: NavTab;
    label: string;
    icon: React.ReactNode;
    activeClass: string;
  }[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: <Compass className="h-3.5 w-3.5" />,
      activeClass:
        'bg-amber-500/12 text-amber-700 border-amber-500/35 dark:bg-[#ffb02e]/14 dark:text-[#ffb02e] dark:border-[#ffb02e]/35',
    },
    {
      id: 'markets',
      label: 'Markets',
      icon: <BarChart3 className="h-3.5 w-3.5" />,
      activeClass:
        'bg-blue-500/12 text-blue-700 border-blue-500/35 dark:bg-[#46a6ff]/14 dark:text-[#46a6ff] dark:border-[#46a6ff]/35',
    },
    {
      id: 'cohorts',
      label: 'Cohorts',
      icon: <Users className="h-3.5 w-3.5" />,
      activeClass:
        'bg-violet-500/12 text-violet-700 border-violet-500/35 dark:bg-[#8b7bff]/14 dark:text-[#8b7bff] dark:border-[#8b7bff]/35',
    },
    {
      id: 'leaderboard',
      label: 'Leaderboard',
      icon: <Trophy className="h-3.5 w-3.5" />,
      activeClass:
        'bg-emerald-500/12 text-emerald-700 border-emerald-500/35 dark:bg-[#22e0a1]/14 dark:text-[#22e0a1] dark:border-[#22e0a1]/35',
    },
    {
      id: 'explorer',
      label: 'Explorer',
      icon: <Blocks className="h-3.5 w-3.5" />,
      activeClass:
        'bg-teal-500/12 text-teal-700 border-teal-500/35 dark:bg-[#03de82]/14 dark:text-[#03de82] dark:border-[#03de82]/35',
    },
    {
      id: 'wallet',
      label: 'Wallet',
      icon: <Wallet className="h-3.5 w-3.5" />,
      activeClass:
        'bg-orange-500/12 text-orange-700 border-orange-500/35 dark:bg-[#ff6a3d]/14 dark:text-[#ff6a3d] dark:border-[#ff6a3d]/35',
    },
  ];

  const tickerItems = useMemo(
    () =>
      [...markets]
        .filter((m) => m.active !== false && Number(m.mark_price || m.last_price) > 0)
        .sort((a, b) => Number(b.quote_volume_24h || 0) - Number(a.quote_volume_24h || 0))
        .slice(0, 20),
    [markets]
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 backdrop-blur-md dark:border-slate-800/80 dark:bg-[#060911]/95 transition-colors">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-2.5 sm:gap-4 px-3 py-2 sm:px-6">
        {/* Brand */}
        <button
          type="button"
          onClick={() => onNavigate('overview')}
          className="flex shrink-0 items-center gap-2 text-left group whitespace-nowrap"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/35 bg-emerald-500/10 dark:border-[#03DE82]/35 dark:bg-[#0a0f1c]">
            <RisexSymbol className="h-4 w-4 text-emerald-600 dark:text-[#03DE82]" />
          </span>
          <div className="flex items-center gap-2 leading-tight">
            <span className="font-display text-base font-bold tracking-tight text-slate-900 group-hover:text-amber-600 dark:text-[#e8edfb] dark:group-hover:text-[#ffb02e] transition-colors whitespace-nowrap">
              RISEx<span className="text-amber-600 dark:text-[#ffb02e]">Scan</span>
            </span>
            <span className="hidden lg:inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 dark:text-slate-400">
              <Activity className="h-2.5 w-2.5 text-emerald-600 dark:text-[#03DE82]" />
              4153
            </span>
          </div>
        </button>

        {/* Primary Nav */}
        <nav
          aria-label="Primary navigation"
          className="flex items-center gap-0.5 lg:gap-1 overflow-x-auto no-scrollbar min-w-0"
        >
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                  active
                    ? item.activeClass
                    : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#0e1526] dark:hover:text-[#e8edfb]'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Controls: Search + White/Dark Theme Switch */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Mobile Search Toggle */}
          <button
            type="button"
            onClick={() => {
              setMobileSearchOpen((v) => !v);
              setSearchOpen(true);
            }}
            aria-label="Toggle search"
            className="md:hidden shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700 hover:border-amber-500/60 hover:text-amber-600 dark:border-slate-700/60 dark:bg-[#090e1a] dark:text-slate-300 dark:hover:border-[#ffb02e]/60 dark:hover:text-[#ffb02e]"
          >
            {mobileSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </button>

          {/* Global Search with Live Dropdown */}
          <div
            ref={searchBoxRef}
            className={
              mobileSearchOpen
                ? 'fixed left-3 right-3 top-[54px] z-50 md:static md:block md:w-56 lg:w-64 xl:w-72 md:shrink-0'
                : 'relative hidden md:block w-56 lg:w-64 xl:w-72 shrink-0'
            }
          >
            <form onSubmit={handleSubmit} className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                placeholder="Search wallet, RISEx Vault, ticker, tx…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 md:py-1.5 pl-9 pr-12 text-xs text-slate-900 placeholder:text-slate-400 shadow-lg md:shadow-none focus:border-amber-500 focus:bg-white focus:outline-none dark:border-slate-700/55 dark:bg-[#090e1a] dark:text-[#e8edfb] dark:placeholder:text-slate-500 dark:focus:border-[#ffb02e]/60 dark:focus:bg-[#090e1a]"
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-slate-200/80 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-700 hover:bg-amber-500 hover:text-white dark:bg-[#131c31] dark:text-slate-300 dark:hover:bg-[#ffb02e] dark:hover:text-[#1f0e03] transition-colors"
              >
                GO
              </button>
            </form>

            {searchOpen && query.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700/60 dark:bg-[#090e1a]">
                {searchLoading && results.traders.length === 0 && results.markets.length === 0 && (
                  <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">Searching RISEx index…</div>
                )}

                {results.markets.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Markets ({results.markets.length})
                    </div>
                    {results.markets.map((m) => {
                      const chg = calcMarketChangePct(m.mark_price || m.last_price, m.change_24h);
                      return (
                        <button
                          key={m.market_id}
                          type="button"
                          onClick={() => {
                            setSearchOpen(false);
                            setMobileSearchOpen(false);
                            setQuery('');
                            onSelectMarket(String(m.market_id));
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-slate-100 dark:hover:bg-[#131c31]"
                        >
                          <div className="flex items-center gap-2">
                            <TokenBadge symbol={m.base_asset_symbol} category={m.category} size={22} />
                            <div>
                              <div className="text-xs font-semibold text-slate-900 dark:text-[#e8edfb]">{m.display_name}</div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                {m.category || 'PERP'} · Max {m.config?.max_leverage || '—'}x
                              </div>
                            </div>
                          </div>
                          <div className="text-right font-mono text-xs tabular-nums">
                            <div className="text-slate-900 dark:text-[#e8edfb]">{formatPrice(m.mark_price || m.last_price)}</div>
                            <div className={chg >= 0 ? 'text-emerald-600 dark:text-[#22e0a1]' : 'text-rose-600 dark:text-[#ff4d6d]'}>
                              {formatPct(chg)}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {results.traders.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Traders ({results.traders.length})
                    </div>
                    {results.traders.map((t) => {
                      const info = formatTraderDisplay(t.address, t.username);
                      return (
                        <button
                          key={t.address}
                          type="button"
                          onClick={() => {
                            setSearchOpen(false);
                            setMobileSearchOpen(false);
                            setQuery('');
                            onSelectWallet(t.address);
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-slate-100 dark:hover:bg-[#131c31]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <TraderAvatar
                              address={t.address}
                              avatarUrl={t.avatarUrl}
                              username={info.displayName}
                              size={24}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 truncate text-xs font-semibold text-slate-900 dark:text-[#e8edfb]">
                                <span className="truncate">{info.displayName}</span>
                                {info.badgeLabel && (
                                  <span className="text-[10px] font-mono text-amber-600 dark:text-[#ffb02e]">
                                    · {info.badgeLabel}
                                  </span>
                                )}
                                {t.xHandle && (
                                  <span className="text-[10px] font-mono text-blue-600 dark:text-[#46a6ff]">
                                    @{t.xHandle}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                {shortAddress(t.address, 8, 6)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right font-mono text-xs tabular-nums">
                            <div className={t.totalPnlAll >= 0 ? 'text-emerald-600 dark:text-[#22e0a1]' : 'text-rose-600 dark:text-[#ff4d6d]'}>
                              {formatSignedUsd(t.totalPnlAll, true)}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">PnL</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {!searchLoading && results.markets.length === 0 && results.traders.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileSearchOpen(false);
                      handleSubmit({ preventDefault: () => {} } as React.FormEvent);
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#131c31]"
                  >
                    Press Enter to resolve <span className="font-mono text-amber-600 dark:text-[#ffb02e]">{query.trim()}</span> directly via RISEx API
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Theme Switcher (White Mode / Dark Mode) */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to White mode' : 'Switch to Dark mode'}
            title={theme === 'dark' ? 'Switch to White mode' : 'Switch to Dark mode'}
            data-testid="theme-toggle"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 whitespace-nowrap hover:border-amber-500/60 hover:bg-amber-50 hover:text-amber-700 dark:border-slate-700/60 dark:bg-[#090e1a] dark:text-slate-200 dark:hover:border-[#ffb02e]/60 dark:hover:bg-[#131c31] dark:hover:text-[#ffb02e] transition-colors"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-3.5 w-3.5 text-[#ffb02e]" />
                <span className="hidden sm:inline">White</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-blue-600" />
                <span className="hidden sm:inline">Dark</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Scrolling Market Ticker Strip */}
      {tickerItems.length > 0 && (
        <div className="ticker-wrap overflow-hidden border-t border-slate-200/80 bg-slate-50/95 py-1 dark:border-slate-800/75 dark:bg-[#070b15]/95 transition-colors">
          <div className="ticker-track">
            {[...tickerItems, ...tickerItems].map((m, i) => {
              const mark = Number(m.mark_price || m.last_price || 0);
              const chg = calcMarketChangePct(mark, m.change_24h);
              const up = chg >= 0;
              const sym = m.base_asset_symbol.replace(/\/.*$/, '').replace(/\s*\[deprecated.*$/i, '').trim();
              const half = i < tickerItems.length ? 'a' : 'b';
              return (
                <button
                  key={`${m.market_id}-${half}`}
                  type="button"
                  onClick={() => onSelectMarket(String(m.market_id))}
                  className="group flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200/90 bg-white px-2 py-0.5 text-[11px] font-mono tabular-nums whitespace-nowrap shadow-xs hover:border-amber-500/60 hover:bg-amber-50/40 dark:border-slate-800/80 dark:bg-[#0b1120]/90 dark:shadow-none dark:hover:border-[#ffb02e]/50 dark:hover:bg-[#121b31] transition-colors"
                >
                  <TokenBadge symbol={m.base_asset_symbol} category={m.category} size={16} />
                  <span className="font-display text-[11px] font-bold tracking-tight text-slate-900 group-hover:text-amber-600 dark:text-[#e8edfb] dark:group-hover:text-[#ffb02e] transition-colors">
                    {sym}
                  </span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-300">{formatPrice(mark)}</span>
                  <span
                    className={`inline-flex items-center gap-0.5 rounded px-1.5 py-[1px] text-[10px] font-bold leading-tight ${
                      up
                        ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-[#22e0a1]/30 dark:bg-[#22e0a1]/15 dark:text-[#22e0a1]'
                        : 'border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:border-[#ff4d6d]/30 dark:bg-[#ff4d6d]/15 dark:text-[#ff4d6d]'
                    }`}
                  >
                    <span aria-hidden="true" className="text-[8px]">
                      {up ? '▲' : '▼'}
                    </span>
                    {formatPct(chg)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
