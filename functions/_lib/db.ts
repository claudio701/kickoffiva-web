import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

/** Environment bindings provided to Cloudflare Pages Functions (c.env). */
export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  SII_ENC_KEY: string;
}

/** Neon serverless sql tagged-template client type. */
export type Sql = NeonQueryFunction<false, false>;

/** Returns a Neon serverless sql client built from env.DATABASE_URL. */
export function getDb(env: Env): Sql {
  return neon(env.DATABASE_URL);
}

/** Runs a parameterized query ($1, $2, ...) and returns the result rows. */
export async function q<T = Record<string, unknown>>(
  env: Env,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const sql = getDb(env);
  const rows = await sql.query(text, params);
  return rows as T[];
}

// ensureSchema: NO-OP — the schema is applied separately via migrations/001_init.sql.
