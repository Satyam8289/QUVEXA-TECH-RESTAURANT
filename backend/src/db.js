/* Database layer — PostgreSQL.
   - If DATABASE_URL is set (cloud like Neon/Supabase, or local install),
     connect to it directly.
   - Otherwise boot a real embedded PostgreSQL for local development
     (no manual install needed). Same SQL either way. */
import "dotenv/config";
import pg from "pg";
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import { SCHEMA } from "./schema.js";
import { hashPassword } from "./auth.js";

const { Pool } = pg;
let pool;
let embedded = null;

export async function initDb() {
  let connectionString = process.env.DATABASE_URL;

  // Guard rail: most hosts (Railway/Render/etc.) wipe local disk on every
  // redeploy, so the embedded dev database would silently lose all data in
  // production. Fail loudly instead of starting with a database that's
  // about to disappear — set DATABASE_URL to a real Postgres (Neon/Supabase/
  // the host's own Postgres addon) before deploying.
  if (!connectionString && process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is not set. Refusing to start in production with the embedded " +
      "dev database — its data does not survive a redeploy. Set DATABASE_URL to a " +
      "real PostgreSQL instance (e.g. Neon or Supabase) in your host's environment variables."
    );
  }

  if (!connectionString) {
    const port = Number(process.env.PG_PORT || 55432);
    embedded = new EmbeddedPostgres({
      databaseDir: path.join(process.cwd(), "pgdata"),
      user: "postgres",
      password: "postgres",
      port,
      persistent: true,
      // Force UTF-8 so symbols like ₹ and any language work (Windows defaults to WIN1252).
      initdbFlags: ["--encoding=UTF8", "--locale=C"],
    });
    try { await embedded.initialise(); } catch (e) { /* already initialised */ }
    await embedded.start();
    try { await embedded.createDatabase("foodhouse"); } catch (e) { /* already exists */ }
    connectionString = `postgres://postgres:postgres@localhost:${port}/foodhouse`;
    console.log(`[db] embedded PostgreSQL running on :${port}`);
  } else {
    console.log("[db] connecting to DATABASE_URL");
  }

  pool = new Pool({
    connectionString,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  await pool.query("SELECT 1");
  await pool.query(SCHEMA);
  console.log("[db] schema ready");
  await ensureSessions();
  await ensurePlatformAdmin();
  return pool;
}

/* Bootstraps the one Super Admin account (you) from env vars, only if none
   exists yet. Change the password afterwards from the Super Admin panel. */
async function ensurePlatformAdmin() {
  const { rows } = await pool.query("SELECT id FROM platform_admins LIMIT 1");
  if (rows[0]) return;
  const username = process.env.PLATFORM_ADMIN_USER || "admin";
  const password = process.env.PLATFORM_ADMIN_PASSWORD || "changeme123";
  await pool.query(
    "INSERT INTO platform_admins (username, password_hash) VALUES ($1,$2)",
    [username, await hashPassword(password)]
  );
  console.log(`[db] Super Admin account created — username: ${username}`);
}

/* Indian financial year: April → March. */
function defaultSessionName(date = new Date()) {
  const y = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? y : y - 1; // month 3 = April (0-indexed)
  return `FY ${startYear}-${startYear + 1}`;
}

/* Every tenant needs at least one active session; any pre-existing orders
   (from before sessions existed) are backfilled into it so nothing is lost
   or silently excluded from a tenant's history. Safe to run on every boot. */
async function ensureSessions() {
  const tenants = (await pool.query("SELECT id FROM tenants")).rows;
  for (const t of tenants) {
    const active = (await pool.query(
      "SELECT id FROM sessions WHERE tenant_id=$1 AND is_active=true LIMIT 1", [t.id]
    )).rows[0];
    let sessionId = active && active.id;
    if (!sessionId) {
      const anyExisting = (await pool.query("SELECT id FROM sessions WHERE tenant_id=$1 LIMIT 1", [t.id])).rows[0];
      if (anyExisting) {
        await pool.query("UPDATE sessions SET is_active=true WHERE id=$1", [anyExisting.id]);
        sessionId = anyExisting.id;
      } else {
        const ins = await pool.query(
          "INSERT INTO sessions (tenant_id, name, is_active) VALUES ($1,$2,true) RETURNING id",
          [t.id, defaultSessionName()]
        );
        sessionId = ins.rows[0].id;
      }
    }
    await pool.query("UPDATE orders SET session_id=$1 WHERE tenant_id=$2 AND session_id IS NULL", [sessionId, t.id]);
  }
}

export const q = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function shutdownDb() {
  try { if (pool) await pool.end(); } catch (e) {}
  try { if (embedded) await embedded.stop(); } catch (e) {}
}
