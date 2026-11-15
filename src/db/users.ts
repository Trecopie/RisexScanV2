import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { users, userWatchlists } from './schema.ts';

export async function getOrCreateUser(uid: string, email: string) {
  if (!db) {
    throw new Error('Database is not configured.');
  }
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function getUserWatchlist(uid: string): Promise<string[]> {
  if (!db) {
    throw new Error('Database is not configured.');
  }
  try {
    const rows = await db
      .select()
      .from(userWatchlists)
      .where(eq(userWatchlists.uid, uid))
      .limit(1);
    return Array.isArray(rows[0]?.marketIds) ? rows[0].marketIds : [];
  } catch (error) {
    console.error('Database watchlist read failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function saveUserWatchlist(uid: string, marketIds: string[]): Promise<string[]> {
  if (!db) {
    throw new Error('Database is not configured.');
  }
  const clean = Array.from(
    new Set(marketIds.map((v) => String(v).trim()).filter((v) => /^\d{1,6}$/.test(v)))
  ).slice(0, 24);
  try {
    const rows = await db
      .insert(userWatchlists)
      .values({
        uid,
        marketIds: clean,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userWatchlists.uid,
        set: {
          marketIds: clean,
          updatedAt: new Date(),
        },
      })
      .returning();
    return rows[0]?.marketIds ?? clean;
  } catch (error) {
    console.error('Database watchlist save failed:', error);
    throw new Error('Database write failed. Please try again later.', { cause: error });
  }
}
