import {
  bigint,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const userWatchlists = pgTable('risexscan_user_watchlists', {
  uid: text('uid')
    .primaryKey()
    .references(() => users.uid, { onDelete: 'cascade' }),
  marketIds: jsonb('market_ids').$type<string[]>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const risexscanState = pgTable('risexscan_state', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const risexscanTraders = pgTable(
  'risexscan_traders',
  {
    address: text('address').primaryKey(),
    record: jsonb('record').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('risexscan_traders_updated_idx').on(t.updatedAt, t.address)]
);

export const risexscanMarketSnapshots = pgTable(
  'risexscan_market_snapshots',
  {
    marketId: text('market_id').notNull(),
    bucketMs: bigint('bucket_ms', { mode: 'number' }).notNull(),
    observedAtMs: bigint('observed_at_ms', { mode: 'number' }).notNull(),
    oiUsd: doublePrecision('oi_usd').notNull(),
    volume24hUsd: doublePrecision('volume_24h_usd').notNull(),
    fundingRate: doublePrecision('funding_rate').notNull(),
    markPrice: doublePrecision('mark_price').notNull(),
  },
  (t) => [primaryKey({ columns: [t.marketId, t.bucketMs] })]
);

export const risexscanObservedTrades = pgTable(
  'risexscan_observed_trades',
  {
    marketId: text('market_id').notNull(),
    tradeId: text('trade_id').notNull(),
    timeMs: bigint('time_ms', { mode: 'number' }).notNull(),
    notionalUsd: doublePrecision('notional_usd').notNull(),
    reportedFeeUsd: doublePrecision('reported_fee_usd'),
    makerAddress: text('maker_address'),
    takerAddress: text('taker_address'),
    makerSide: smallint('maker_side'),
    priceText: text('price_text'),
    sizeText: text('size_text'),
  },
  (t) => [
    primaryKey({ columns: [t.marketId, t.tradeId] }),
    index('risexscan_trades_time_idx').on(t.timeMs),
  ]
);

export const risexscanCohortSnapshots = pgTable(
  'risexscan_cohort_snapshots',
  {
    marketId: text('market_id').notNull(),
    cohort: text('cohort').notNull(),
    bucketMs: bigint('bucket_ms', { mode: 'number' }).notNull(),
    longUsd: doublePrecision('long_usd').notNull(),
    shortUsd: doublePrecision('short_usd').notNull(),
    positionCount: integer('position_count').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.marketId, t.cohort, t.bucketMs] }),
    index('risexscan_cohorts_bucket_idx').on(t.bucketMs),
  ]
);
