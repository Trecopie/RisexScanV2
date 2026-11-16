import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export function isSqlConfigured(): boolean {
  return Boolean(
    process.env.SQL_HOST &&
      process.env.SQL_USER &&
      process.env.SQL_PASSWORD &&
      process.env.SQL_DB_NAME
  );
}

export const createPool = (): Pool | null => {
  if (!isSqlConfigured()) {
    return null;
  }
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 5000,
    });

    global._postgresPool.on('error', (err: any) => {
      const code = String(err?.code || '');
      const msg = String(err?.message || '');
      const isExpectedIdleRecycle =
        code === '57P01' ||
        code === '57P02' ||
        code === '57P03' ||
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'EPIPE' ||
        /Connection terminated unexpectedly|terminating connection due to administrator command|ECONNRESET|socket hang up/i.test(
          msg
        );
      if (isExpectedIdleRecycle) {
        return;
      }
      console.warn('SQL pool client recycled:', msg || err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const sqlPool = pool;
export const db = pool ? drizzle(pool, { schema }) : null;
