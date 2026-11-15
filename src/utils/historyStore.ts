import { and, asc, desc, eq, gt, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  risexscanCohortSnapshots,
  risexscanMarketSnapshots,
  risexscanObservedTrades,
  risexscanState,
  risexscanTraders,
} from '../db/schema.ts';

export interface PersistedMarketSnapshot {
  marketId: string;
  observedAt: number;
  openInterestUsd: number;
  volume24hUsd: number;
  fundingRate: number;
  markPrice: number;
}

export interface ObservedTradeRecord {
  marketId: string;
  tradeId: string;
  timestampMs: number;
  notionalUsd: number;
  feeUsd: number | null;
  maker?: string | null;
  taker?: string | null;
  makerSide?: 0 | 1 | null;
  price?: string | null;
  size?: string | null;
}

export interface CohortSnapshot {
  marketId: string;
  cohort: 'whale' | 'shark' | 'dolphin' | 'fish' | 'shrimp';
  observedAt: number;
  longUsd: number;
  shortUsd: number;
  positions: number;
}

export interface PositionChange {
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

export interface HistoricalAnalyticsPayload {
  dailyTrades: Array<{
    day: number;
    volumeUsd: number;
    reportedFeesUsd: number | null;
    feeEventCount: number;
    tradeCount: number;
  }>;
  oiSnapshots: Array<{
    time: number;
    openInterestUsd: number;
    volume24hUsd: number;
    marketCount: number;
  }>;
  firstTradeAt: number | null;
  lastTradeAt: number | null;
  firstSnapshotAt: number | null;
  lastSnapshotAt: number | null;
  observedTrades: number;
}

export interface RawCohortBucketRow {
  marketId: string;
  cohort: string;
  longUsd: number;
  shortUsd: number;
  positionCount: number;
}

export function computeCohortPositionChanges(
  previousRows: RawCohortBucketRow[],
  currentRows: RawCohortBucketRow[],
  fromTime: number | null,
  toTime: number | null
): {
  fromTime: number | null;
  toTime: number | null;
  mode: 'unavailable' | 'current' | 'changes';
  changes: PositionChange[];
} {
  if (!toTime || currentRows.length === 0) {
    return { fromTime: null, toTime: null, mode: 'unavailable', changes: [] };
  }
  if (fromTime === null) {
    const changes: PositionChange[] = currentRows
      .map((v) => ({
        marketId: v.marketId,
        cohort: v.cohort,
        fromTime: null,
        toTime,
        previousNetUsd: null,
        currentNetUsd: Number(v.longUsd) - Number(v.shortUsd),
        deltaNetUsd: null,
        currentLongUsd: Number(v.longUsd),
        currentShortUsd: Number(v.shortUsd),
        positionCount: Number(v.positionCount),
      }))
      .sort((a, b) => Math.abs(b.currentNetUsd) - Math.abs(a.currentNetUsd));
    return { fromTime: null, toTime, mode: 'current', changes: changes.slice(0, 60) };
  }

  const prevMap = new Map<string, RawCohortBucketRow>();
  for (const row of previousRows) {
    prevMap.set(`${row.marketId}:${row.cohort}`, row);
  }
  const currMap = new Map<string, RawCohortBucketRow>();
  for (const row of currentRows) {
    currMap.set(`${row.marketId}:${row.cohort}`, row);
  }

  const keys = new Set([...prevMap.keys(), ...currMap.keys()]);
  const changes: PositionChange[] = [];
  for (const key of keys) {
    const cur = currMap.get(key);
    const prev = prevMap.get(key);
    const [marketId, cohort] = key.split(':');
    const curLong = Number(cur?.longUsd ?? 0);
    const curShort = Number(cur?.shortUsd ?? 0);
    const oldLong = Number(prev?.longUsd ?? 0);
    const oldShort = Number(prev?.shortUsd ?? 0);
    const curNet = curLong - curShort;
    const oldNet = oldLong - oldShort;
    changes.push({
      marketId,
      cohort,
      fromTime,
      toTime,
      previousNetUsd: oldNet,
      currentNetUsd: curNet,
      deltaNetUsd: curNet - oldNet,
      currentLongUsd: curLong,
      currentShortUsd: curShort,
      positionCount: Number(cur?.positionCount ?? 0),
    });
  }
  changes.sort((a, b) => Math.abs(b.deltaNetUsd ?? 0) - Math.abs(a.deltaNetUsd ?? 0));
  return { fromTime, toTime, mode: 'changes', changes: changes.slice(0, 60) };
}

export class HistoryStore {
  get ready(): boolean {
    return Boolean(db);
  }

  async loadState(): Promise<Record<string, any> | null> {
    if (!db) return null;
    try {
      const rows = await db
        .select({ value: risexscanState.value })
        .from(risexscanState)
        .where(eq(risexscanState.key, 'indexer_meta'))
        .limit(1);
      return (rows[0]?.value as Record<string, any>) || null;
    } catch (error) {
      console.error('HistoryStore loadState failed:', error);
      throw new Error('Failed to load indexer state.', { cause: error });
    }
  }

  async saveState(value: Record<string, unknown>): Promise<void> {
    if (!db) return;
    try {
      await db
        .insert(risexscanState)
        .values({
          key: 'indexer_meta',
          value,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: risexscanState.key,
          set: {
            value,
            updatedAt: new Date(),
          },
        });
    } catch (error) {
      console.error('HistoryStore saveState failed:', error);
      throw new Error('Failed to persist indexer state.', { cause: error });
    }
  }

  async loadTraders(onBatch: (rows: any[]) => void): Promise<number> {
    if (!db) return 0;
    try {
      let total = 0;
      let cursorAddress = '';
      const batchSize = 500;
      while (true) {
        const rows = await db
          .select({
            address: risexscanTraders.address,
            record: risexscanTraders.record,
          })
          .from(risexscanTraders)
          .where(cursorAddress ? gt(risexscanTraders.address, cursorAddress) : undefined)
          .orderBy(asc(risexscanTraders.address))
          .limit(batchSize);
        if (rows.length === 0) break;
        onBatch(rows.map((r) => r.record));
        total += rows.length;
        cursorAddress = rows[rows.length - 1].address;
        if (rows.length < batchSize) break;
      }
      return total;
    } catch (error) {
      console.error('HistoryStore loadTraders failed:', error);
      throw new Error('Failed to load traders from database.', { cause: error });
    }
  }

  async loadWalletBackfillUpdates(
    sinceIso: string,
    sinceAddress: string,
    limit = 1000
  ): Promise<{ records: any[]; cursorTime: string; cursorAddress: string }> {
    if (!db) return { records: [], cursorTime: sinceIso, cursorAddress: sinceAddress };
    const safeLimit = Math.min(2000, Math.max(1, limit));
    const sinceDate = new Date(sinceIso);
    try {
      const rows = await db
        .select({
          address: risexscanTraders.address,
          record: risexscanTraders.record,
          updatedAt: risexscanTraders.updatedAt,
        })
        .from(risexscanTraders)
        .where(
          or(
            gt(risexscanTraders.updatedAt, sinceDate),
            and(
              eq(risexscanTraders.updatedAt, sinceDate),
              gt(risexscanTraders.address, sinceAddress)
            )
          )
        )
        .orderBy(asc(risexscanTraders.updatedAt), asc(risexscanTraders.address))
        .limit(safeLimit);

      const last = rows[rows.length - 1];
      return {
        records: rows.map((r) => r.record),
        cursorTime: last ? last.updatedAt.toISOString() : sinceIso,
        cursorAddress: last ? last.address : sinceAddress,
      };
    } catch (error) {
      console.error('HistoryStore loadWalletBackfillUpdates failed:', error);
      throw new Error('Failed to query wallet updates.', { cause: error });
    }
  }

  async upsertTraders(traders: Array<Record<string, any>>): Promise<void> {
    if (!db || traders.length === 0) return;
    try {
      for (let i = 0; i < traders.length; i += 200) {
        const slice = traders
          .slice(i, i + 200)
          .filter((t) => typeof t?.address === 'string' && t.address.trim().length > 0);
        if (slice.length === 0) continue;
        await db
          .insert(risexscanTraders)
          .values(
            slice.map((t) => ({
              address: String(t.address).toLowerCase(),
              record: t,
              updatedAt: new Date(),
            }))
          )
          .onConflictDoUpdate({
            target: risexscanTraders.address,
            set: {
              record: sql`excluded.record`,
              updatedAt: new Date(),
            },
          });
      }
    } catch (error) {
      console.error('HistoryStore upsertTraders failed:', error);
      throw new Error('Failed to save trader records.', { cause: error });
    }
  }

  async recordMarketSamples(samples: PersistedMarketSnapshot[]): Promise<void> {
    if (!db || samples.length === 0) return;
    try {
      for (let i = 0; i < samples.length; i += 200) {
        const chunk = samples.slice(i, i + 200).map((s) => ({
          marketId: s.marketId,
          bucketMs: Math.floor(s.observedAt / 3600000) * 3600000,
          observedAtMs: Math.round(s.observedAt),
          oiUsd: s.openInterestUsd,
          volume24hUsd: s.volume24hUsd,
          fundingRate: s.fundingRate,
          markPrice: s.markPrice,
        }));
        await db
          .insert(risexscanMarketSnapshots)
          .values(chunk)
          .onConflictDoUpdate({
            target: [risexscanMarketSnapshots.marketId, risexscanMarketSnapshots.bucketMs],
            set: {
              observedAtMs: sql`excluded.observed_at_ms`,
              oiUsd: sql`excluded.oi_usd`,
              volume24hUsd: sql`excluded.volume_24h_usd`,
              fundingRate: sql`excluded.funding_rate`,
              markPrice: sql`excluded.mark_price`,
            },
          });
      }
    } catch (error) {
      console.error('HistoryStore recordMarketSamples failed:', error);
      throw new Error('Failed to store market snapshots.', { cause: error });
    }
  }

  async recordTrades(trades: ObservedTradeRecord[]): Promise<void> {
    if (!db || trades.length === 0) return;
    try {
      for (let i = 0; i < trades.length; i += 250) {
        const chunk = trades.slice(i, i + 250).map((trade) => ({
          marketId: trade.marketId,
          tradeId: trade.tradeId,
          timeMs: Math.round(trade.timestampMs),
          notionalUsd: trade.notionalUsd,
          reportedFeeUsd: trade.feeUsd,
          makerAddress: trade.maker || null,
          takerAddress: trade.taker || null,
          makerSide: trade.makerSide ?? null,
          priceText: trade.price || null,
          sizeText: trade.size || null,
        }));
        await db
          .insert(risexscanObservedTrades)
          .values(chunk)
          .onConflictDoNothing({
            target: [risexscanObservedTrades.marketId, risexscanObservedTrades.tradeId],
          });
      }
    } catch (error) {
      console.error('HistoryStore recordTrades failed:', error);
      throw new Error('Failed to store trade observations.', { cause: error });
    }
  }

  async recordCohortSnapshots(rows: CohortSnapshot[]): Promise<void> {
    if (!db || rows.length === 0) return;
    try {
      for (let i = 0; i < rows.length; i += 250) {
        const chunk = rows.slice(i, i + 250).map((x) => ({
          marketId: x.marketId,
          cohort: x.cohort,
          bucketMs: Math.floor(x.observedAt / 3600000) * 3600000,
          longUsd: x.longUsd,
          shortUsd: x.shortUsd,
          positionCount: x.positions,
        }));
        await db
          .insert(risexscanCohortSnapshots)
          .values(chunk)
          .onConflictDoUpdate({
            target: [
              risexscanCohortSnapshots.marketId,
              risexscanCohortSnapshots.cohort,
              risexscanCohortSnapshots.bucketMs,
            ],
            set: {
              longUsd: sql`excluded.long_usd`,
              shortUsd: sql`excluded.short_usd`,
              positionCount: sql`excluded.position_count`,
            },
          });
      }
    } catch (error) {
      console.error('HistoryStore recordCohortSnapshots failed:', error);
      throw new Error('Failed to store cohort snapshots.', { cause: error });
    }
  }

  async getPositionChanges(): Promise<{
    fromTime: number | null;
    toTime: number | null;
    mode: 'unavailable' | 'current' | 'changes';
    changes: PositionChange[];
  }> {
    if (!db) {
      return { fromTime: null, toTime: null, mode: 'unavailable', changes: [] };
    }
    try {
      const hours = await db
        .selectDistinct({ bucketMs: risexscanCohortSnapshots.bucketMs })
        .from(risexscanCohortSnapshots)
        .orderBy(desc(risexscanCohortSnapshots.bucketMs))
        .limit(2);

      if (hours.length === 0) {
        return { fromTime: null, toTime: null, mode: 'unavailable', changes: [] };
      }

      const toTime = Number(hours[0].bucketMs);
      const fromTime = hours.length > 1 ? Number(hours[1].bucketMs) : null;

      const currentRows = await db
        .select({
          marketId: risexscanCohortSnapshots.marketId,
          cohort: risexscanCohortSnapshots.cohort,
          longUsd: risexscanCohortSnapshots.longUsd,
          shortUsd: risexscanCohortSnapshots.shortUsd,
          positionCount: risexscanCohortSnapshots.positionCount,
        })
        .from(risexscanCohortSnapshots)
        .where(eq(risexscanCohortSnapshots.bucketMs, toTime));

      const previousRows =
        fromTime !== null
          ? await db
              .select({
                marketId: risexscanCohortSnapshots.marketId,
                cohort: risexscanCohortSnapshots.cohort,
                longUsd: risexscanCohortSnapshots.longUsd,
                shortUsd: risexscanCohortSnapshots.shortUsd,
                positionCount: risexscanCohortSnapshots.positionCount,
              })
              .from(risexscanCohortSnapshots)
              .where(eq(risexscanCohortSnapshots.bucketMs, fromTime))
          : [];

      return computeCohortPositionChanges(previousRows, currentRows, fromTime, toTime);
    } catch (error) {
      console.error('HistoryStore getPositionChanges failed:', error);
      throw new Error('Failed to query cohort positioning changes.', { cause: error });
    }
  }

  async getHistoricalAnalytics(): Promise<HistoricalAnalyticsPayload> {
    const empty: HistoricalAnalyticsPayload = {
      dailyTrades: [],
      oiSnapshots: [],
      firstTradeAt: null,
      lastTradeAt: null,
      firstSnapshotAt: null,
      lastSnapshotAt: null,
      observedTrades: 0,
    };
    if (!db) return empty;
    try {
      const dayExpr = sql<number>`(${risexscanObservedTrades.timeMs} / 86400000) * 86400000`;
      const [trades, snapshots, tradeRange, snapshotRange] = await Promise.all([
        db
          .select({
            day: dayExpr,
            volumeUsd: sql<number>`coalesce(sum(${risexscanObservedTrades.notionalUsd}), 0)`,
            reportedFeesUsd: sql<number | null>`sum(${risexscanObservedTrades.reportedFeeUsd})`,
            feeEventCount: sql<number>`count(${risexscanObservedTrades.reportedFeeUsd})`,
            tradeCount: sql<number>`count(*)`,
          })
          .from(risexscanObservedTrades)
          .groupBy(dayExpr)
          .orderBy(desc(dayExpr))
          .limit(90),
        db
          .select({
            time: risexscanMarketSnapshots.bucketMs,
            openInterestUsd: sql<number>`coalesce(sum(${risexscanMarketSnapshots.oiUsd}), 0)`,
            volume24hUsd: sql<number>`coalesce(sum(${risexscanMarketSnapshots.volume24hUsd}), 0)`,
            marketCount: sql<number>`count(*)`,
          })
          .from(risexscanMarketSnapshots)
          .groupBy(risexscanMarketSnapshots.bucketMs)
          .orderBy(desc(risexscanMarketSnapshots.bucketMs))
          .limit(168),
        db
          .select({
            firstTradeAt: sql<number | null>`min(${risexscanObservedTrades.timeMs})`,
            lastTradeAt: sql<number | null>`max(${risexscanObservedTrades.timeMs})`,
            observedTrades: sql<number>`count(*)`,
          })
          .from(risexscanObservedTrades),
        db
          .select({
            firstSnapshotAt: sql<number | null>`min(${risexscanMarketSnapshots.bucketMs})`,
            lastSnapshotAt: sql<number | null>`max(${risexscanMarketSnapshots.bucketMs})`,
          })
          .from(risexscanMarketSnapshots),
      ]);

      return {
        dailyTrades: trades.reverse().map((r) => ({
          day: Number(r.day),
          volumeUsd: Number(r.volumeUsd || 0),
          reportedFeesUsd: r.reportedFeesUsd === null ? null : Number(r.reportedFeesUsd),
          feeEventCount: Number(r.feeEventCount || 0),
          tradeCount: Number(r.tradeCount || 0),
        })),
        oiSnapshots: snapshots.reverse().map((r) => ({
          time: Number(r.time),
          openInterestUsd: Number(r.openInterestUsd || 0),
          volume24hUsd: Number(r.volume24hUsd || 0),
          marketCount: Number(r.marketCount || 0),
        })),
        firstTradeAt:
          tradeRange[0]?.firstTradeAt == null ? null : Number(tradeRange[0].firstTradeAt),
        lastTradeAt:
          tradeRange[0]?.lastTradeAt == null ? null : Number(tradeRange[0].lastTradeAt),
        firstSnapshotAt:
          snapshotRange[0]?.firstSnapshotAt == null
            ? null
            : Number(snapshotRange[0].firstSnapshotAt),
        lastSnapshotAt:
          snapshotRange[0]?.lastSnapshotAt == null
            ? null
            : Number(snapshotRange[0].lastSnapshotAt),
        observedTrades: Number(tradeRange[0]?.observedTrades || 0),
      };
    } catch (error) {
      console.error('HistoryStore getHistoricalAnalytics failed:', error);
      throw new Error('Failed to load historical analytics.', { cause: error });
    }
  }
}
