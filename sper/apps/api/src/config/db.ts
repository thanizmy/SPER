import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env, isProd } from './env';
import * as schema from '../db/schema';

/**
 * Single shared connection pool + Drizzle instance.
 * Import `db` in repositories; import `pool` only for shutdown/health.
 */

// On Vercel, each request may run in its own short-lived function instance,
// each opening its own pool -- keep per-instance pool size small and lean on
// the database's own connection pooler (e.g. Neon's pooled connection string).
const isServerless = Boolean(process.env.VERCEL);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: isServerless ? 3 : isProd ? 20 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

export type DB = typeof db;
export { schema };

/** Graceful shutdown hook for the HTTP server / worker process. */
export async function closeDb(): Promise<void> {
  await pool.end();
}
