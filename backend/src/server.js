/* The Food House — single-service deploy: this one Node process serves
   both the JSON API (/api/*) and the static frontend (every .html/.css/.js
   file in the project root) from the same origin. Simplest possible
   production setup — one process, one URL, no CORS to configure. */
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb, shutdownDb } from "./db.js";
import { seedIfEmpty } from "./seed.js";
import routes from "./routes.js";
import adminRoutes from "./admin-routes.js";

const PORT = Number(process.env.PORT || 4000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(__dirname, "..", ".."); // backend/src -> backend -> project root

const app = express();
app.disable("x-powered-by");              // don't advertise Express/version
app.use(cors());
app.use(express.json({ limit: "5mb" }));  // large limit for base64 logo uploads

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "foodhouse-api" }));
app.use("/api", routes);
app.use("/api/platform", adminRoutes);    // Super Admin — separate token scope, see auth.js

// The frontend lives in the project root ALONGSIDE backend/ and .git, so
// serving the root naively also exposed backend/src/*.js, package.json, etc.
// Block anything that isn't customer-facing before it reaches express.static.
const BLOCKED_PATH = /(^|\/)(backend|node_modules|deploy|\.git)(\/|$)/i;
app.use((req, res, next) => {
  if (BLOCKED_PATH.test(decodeURIComponent(req.path))) return res.status(404).json({ error: "Not found" });
  next();
});

// Static frontend (index.html, menu.html, dashboard.html, superadmin.html, css/, js/…).
// dotfiles:"deny" keeps .env and friends unreachable even if the guard above
// is ever loosened.
app.use(express.static(FRONTEND_DIR, { extensions: ["html"], dotfiles: "deny" }));

// 404 + error handler (only reached if neither an API route nor a static file matched)
app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  // 4xx messages are our own validation text (safe to show); 5xx could carry
  // internal DB/stack detail, so return a generic message for those.
  res.status(status).json({ error: status >= 500 ? "Something went wrong. Please try again." : (err.message || "Request failed") });
});

async function main() {
  await initDb();
  // Demo restaurants (with well-known passwords) are only useful for local
  // development — never auto-seed them in production, even if the tenants
  // table happens to be empty (e.g. right after deleting a demo tenant).
  if (process.env.NODE_ENV !== "production") await seedIfEmpty();
  const server = app.listen(PORT, () => console.log(`[api] listening on http://localhost:${PORT}`));

  const stop = async () => { console.log("\n[api] shutting down…"); server.close(); await shutdownDb(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => { console.error("Fatal startup error:", e); process.exit(1); });
