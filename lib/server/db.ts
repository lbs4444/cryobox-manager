import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var cryoboxPool: Pool | undefined;
}

export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("未配置 DATABASE_URL");
  globalThis.cryoboxPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  return globalThis.cryoboxPool;
}
