/* Super Admin API — platform-level control, separate from every
   restaurant's own dashboard. This is where YOU onboard new restaurants
   and manage their custom domains. Protected by platformAuth (a distinct
   JWT scope), never a tenant-scoped staff token. */
import { Router } from "express";
import { q, tx } from "./db.js";
import { platformAuth, rateLimit, hashPassword, verifyPassword, signPlatformToken } from "./auth.js";

const r = Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const DEFAULT_CATEGORIES = [
  ["starters", "Starters"], ["main", "Main Course"], ["breads", "Breads"],
  ["rice", "Rice & Biryani"], ["desserts", "Desserts"], ["beverages", "Beverages"],
];

function slugify(name) {
  return String(name).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "restaurant";
}
async function uniqueSlug(base) {
  let slug = base, n = 2;
  while ((await q("SELECT 1 FROM tenants WHERE slug=$1", [slug])).rows[0]) slug = `${base}-${n++}`;
  return slug;
}
function fyName(date = new Date()) {
  const y = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? y : y - 1;
  return `FY ${startYear}-${startYear + 1}`;
}

/* ==================== AUTH ==================== */
const platformLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, label: "platform-login" });
r.post("/login", platformLoginLimiter, h(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Enter username and password" });
  const admin = (await q("SELECT * FROM platform_admins WHERE lower(username)=lower($1)", [String(username).trim()])).rows[0];
  if (!admin || !(await verifyPassword(password, admin.password_hash)))
    return res.status(401).json({ error: "Invalid username or password" });
  res.json({ token: signPlatformToken(admin), admin: { id: admin.id, username: admin.username } });
}));

r.patch("/password", platformAuth, h(async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
  await q("UPDATE platform_admins SET password_hash=$1 WHERE id=$2", [await hashPassword(password), req.admin.pid]);
  res.json({ ok: true });
}));

/* ==================== PLATFORM OVERVIEW ==================== */
r.get("/stats", platformAuth, h(async (req, res) => {
  const tenants = (await q("SELECT COUNT(*)::int AS c FROM tenants")).rows[0].c;
  const orders = (await q("SELECT COUNT(*)::int AS c, COALESCE(SUM(total),0)::float AS revenue FROM orders")).rows[0];
  const staff = (await q("SELECT COUNT(*)::int AS c FROM users")).rows[0].c;
  res.json({ restaurants: tenants, totalOrders: orders.c, totalRevenue: orders.revenue, staffAccounts: staff });
}));

/* ==================== RESTAURANTS (tenants) ==================== */
r.get("/tenants", platformAuth, h(async (req, res) => {
  const { rows } = await q(`
    SELECT t.id, t.slug, t.name, t.address, t.phone, t.logo, t.custom_domain AS "customDomain",
           t.primary_color AS "primaryColor", t.is_closed AS "isClosed", t.created_at AS "createdAt",
           (SELECT COUNT(*)::int FROM users u WHERE u.tenant_id=t.id) AS "staffCount",
           (SELECT COUNT(*)::int FROM orders o WHERE o.tenant_id=t.id) AS "orderCount",
           (SELECT COALESCE(SUM(o.total),0)::float FROM orders o WHERE o.tenant_id=t.id) AS "totalRevenue",
           (SELECT u.username FROM users u WHERE u.tenant_id=t.id AND u.role='owner' ORDER BY u.created_at LIMIT 1) AS "ownerUsername"
    FROM tenants t ORDER BY t.created_at DESC`);
  res.json(rows);
}));

r.post("/tenants", platformAuth, h(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.ownerName || !b.ownerUsername || !b.ownerPassword)
    return res.status(400).json({ error: "Restaurant name, owner name, owner username and password are required" });

  const slug = await uniqueSlug(slugify(b.slug || b.name));
  const result = await tx(async (c) => {
    const tenant = (await c.query(
      `INSERT INTO tenants (slug, name, tagline, phone, address) VALUES ($1,$2,$3,$4,$5) RETURNING id, slug, name`,
      [slug, b.name, b.tagline || "", b.phone || "", b.address || ""]
    )).rows[0];

    for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
      const [catSlug, catName] = DEFAULT_CATEGORIES[i];
      await c.query("INSERT INTO categories (tenant_id, slug, name, sort) VALUES ($1,$2,$3,$4)", [tenant.id, catSlug, catName, i]);
    }
    const tableCount = Number(b.tableCount) > 0 ? Number(b.tableCount) : 12;
    for (let n = 1; n <= tableCount; n++) {
      await c.query("INSERT INTO restaurant_tables (tenant_id, number, seats, status) VALUES ($1,$2,4,'free')", [tenant.id, n]);
    }
    await c.query("INSERT INTO sessions (tenant_id, name, is_active) VALUES ($1,$2,true)", [tenant.id, fyName()]);

    try {
      await c.query(
        `INSERT INTO users (tenant_id, name, username, password_hash, role) VALUES ($1,$2,$3,$4,'owner')`,
        [tenant.id, b.ownerName, String(b.ownerUsername).trim(), await hashPassword(b.ownerPassword)]
      );
    } catch (e) {
      if (e.code === "23505") throw Object.assign(new Error("That owner username is already taken"), { status: 409 });
      throw e;
    }
    return tenant;
  });

  res.status(201).json({
    slug: result.slug,
    name: result.name,
    customerLink: `/index.html?r=${result.slug}`,
    ownerLogin: b.ownerUsername,
  });
}));

r.patch("/tenants/:id", platformAuth, h(async (req, res) => {
  const b = req.body || {};
  const fields = [], vals = [];
  const set = (col, val) => { if (val !== undefined) { fields.push(`${col}=$${fields.length + 1}`); vals.push(val); } };
  set("name", b.name); set("phone", b.phone); set("address", b.address); set("is_closed", b.isClosed);
  set("primary_color", b.primaryColor);
  if (b.customDomain !== undefined) {
    const cleaned = String(b.customDomain).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    set("custom_domain", cleaned || null);
  }
  if (!fields.length) return res.json({ ok: true });
  vals.push(req.params.id);
  try {
    await q(`UPDATE tenants SET ${fields.join(", ")} WHERE id=$${vals.length}`, vals);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "That domain is already linked to another restaurant" });
    throw e;
  }
  res.json({ ok: true });
}));

/* ==================== DEMO LEADS ==================== */
/* Submitted via POST /api/public/demo-lead (routes.js) from the company
   website's "try the demo" gate — visible only here, never on the public
   internet. */
r.get("/demo-leads", platformAuth, h(async (req, res) => {
  const { rows } = await q(
    `SELECT id, business_name AS "businessName", phone, created_at AS "createdAt"
     FROM demo_leads ORDER BY created_at DESC LIMIT 500`);
  res.json(rows);
}));

export default r;
