/* All REST endpoints. Staff routes are tenant-scoped via the JWT (req.user.tid),
   guaranteeing one restaurant can never read another's data. Public (customer)
   routes resolve the tenant from the URL slug and only expose safe data. */
import { Router } from "express";
import crypto from "node:crypto";
import { q, tx } from "./db.js";
import { auth, requireRole, hashPassword, verifyPassword, signToken } from "./auth.js";
import { uploadDataUrlToR2, r2Configured } from "./r2.js";

const r = Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- shaping helpers ---------- */
const MENU_SELECT = `
  SELECT m.id, m.name, m.description, m.price::float AS price, m.veg,
         m.rating::float AS rating, m.stock, m.image, c.slug AS category
  FROM menu_items m LEFT JOIN categories c ON c.id = m.category_id`;

const ORDERS_SELECT = `
  SELECT o.id, o.code, o.table_number AS table, o.customer_name AS customer, o.phone,
         o.method, o.status, o.total::float AS total, o.created_at AS "createdAt",
         o.payment_collected AS "paymentCollected", o.collected_by AS "collectedBy", o.collected_at AS "collectedAt",
         COALESCE(json_agg(json_build_object(
           'id', oi.menu_item_id, 'name', oi.name, 'price', oi.price::float,
           'qty', oi.qty, 'note', oi.note) ORDER BY oi.id)
           FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
  FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id`;

async function categoryIdForSlug(tenantId, slug) {
  if (!slug) return null;
  const { rows } = await q("SELECT id FROM categories WHERE tenant_id=$1 AND slug=$2", [tenantId, slug]);
  return rows[0] ? rows[0].id : null;
}

async function nextOrderCode(client, tenantId) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(code,'[^0-9]','','g'),'')::int), 2040) + 1 AS n
     FROM orders WHERE tenant_id=$1`, [tenantId]);
  return `ORD-${rows[0].n}`;
}

async function getActiveSessionId(client, tenantId) {
  const { rows } = await client.query("SELECT id FROM sessions WHERE tenant_id=$1 AND is_active=true LIMIT 1", [tenantId]);
  return rows[0] ? rows[0].id : null;
}

async function createOrder(client, tenantId, body) {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw Object.assign(new Error("Order has no items"), { status: 400 });
  const table = body.table ? Number(body.table) : null;
  const total = items.reduce((s, it) => s + Number(it.price) * Number(it.qty), 0);
  const code = await nextOrderCode(client, tenantId);
  const method = body.method || "Cash";
  // Cash needs someone to physically collect it; every other method (Card/UPI,
  // whether paid at the counter or verified via Razorpay) is settled already —
  // the Razorpay verify route below overrides this explicitly regardless.
  const paymentCollected = method !== "Cash";
  // Every order belongs to the tenant's current active session (financial
  // year) — this is how each year's orders/payments/analytics stay separate.
  const sessionId = await getActiveSessionId(client, tenantId);
  const order = (await client.query(
    `INSERT INTO orders (tenant_id, session_id, code, table_number, customer_name, phone, method, status, total, payment_collected)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9) RETURNING id, code`,
    [tenantId, sessionId, code, table, body.customer || "Guest", body.phone || "", method, total, paymentCollected]
  )).rows[0];
  for (const it of items) {
    await client.query(
      `INSERT INTO order_items (order_id, menu_item_id, name, price, qty, note) VALUES ($1,$2,$3,$4,$5,$6)`,
      [order.id, it.id || null, it.name, it.price, it.qty, it.note || null]
    );
    // Never let stock go negative — a race between two customers ordering the
    // last few portions at once just clamps at 0 rather than erroring out.
    if (it.id) {
      await client.query(
        `UPDATE menu_items SET stock = GREATEST(0, stock - $1) WHERE id=$2 AND tenant_id=$3`,
        [Number(it.qty) || 0, it.id, tenantId]
      );
    }
  }
  if (table) await client.query("UPDATE restaurant_tables SET status='occupied' WHERE tenant_id=$1 AND number=$2", [tenantId, table]);
  return order;
}

const publicTenant = (t) => ({
  slug: t.slug, name: t.name, tagline: t.tagline, phone: t.phone, address: t.address, logo: t.logo,
  currency: t.currency, isClosed: t.is_closed, customDomain: t.custom_domain, primaryColor: t.primary_color,
  // Safe to expose: just tells the customer app whether to offer "Pay online".
  // The actual key id (needed to open Razorpay's checkout) is fetched per-order
  // from the /razorpay/order endpoint below, never handed out in bulk here.
  razorpayEnabled: !!(t.razorpay_key_id && t.razorpay_key_secret),
});

/* ==================== AUTH ==================== */
r.post("/auth/login", h(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Enter username and password" });
  const { rows } = await q("SELECT * FROM users WHERE lower(username)=lower($1) AND active", [String(username).trim()]);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash)))
    return res.status(401).json({ error: "Invalid username or password" });
  const t = (await q("SELECT * FROM tenants WHERE id=$1", [user.tenant_id])).rows[0];
  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, role: user.role, username: user.username },
    tenant: publicTenant(t),
  });
}));

/* Branding lookup while typing a username — shows that restaurant's name/logo
   on the login page before the password is even entered. No sensitive data. */
r.get("/auth/lookup", h(async (req, res) => {
  const username = String(req.query.username || "").trim();
  if (!username) return res.json(null);
  const { rows } = await q(
    `SELECT t.name, t.tagline, t.logo FROM users u JOIN tenants t ON t.id = u.tenant_id
     WHERE lower(u.username) = lower($1) AND u.active`, [username]);
  res.json(rows[0] || null);
}));

r.get("/auth/me", auth, h(async (req, res) => {
  const u = (await q("SELECT id,name,role,username FROM users WHERE id=$1", [req.user.uid])).rows[0];
  const t = (await q("SELECT * FROM tenants WHERE id=$1", [req.user.tid])).rows[0];
  if (!u || !t) return res.status(401).json({ error: "Account not found" });
  res.json({ user: u, tenant: publicTenant(t) });
}));

/* ==================== CATEGORIES ==================== */
r.get("/categories", auth, h(async (req, res) => {
  const { rows } = await q("SELECT slug, name FROM categories WHERE tenant_id=$1 ORDER BY sort", [req.user.tid]);
  res.json(rows);
}));

/* ==================== MENU ==================== */
r.get("/menu", auth, h(async (req, res) => {
  const { rows } = await q(`${MENU_SELECT} WHERE m.tenant_id=$1 ORDER BY c.sort NULLS LAST, m.name`, [req.user.tid]);
  res.json(rows);
}));

r.post("/menu", auth, requireRole("owner", "manager"), h(async (req, res) => {
  const b = req.body || {};
  const catId = await categoryIdForSlug(req.user.tid, b.category);
  const { rows } = await q(
    `INSERT INTO menu_items (tenant_id, category_id, name, description, price, veg, rating, stock, image)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [req.user.tid, catId, b.name, b.description || "", b.price || 0, b.veg !== false, b.rating || 4.5, b.stock || 0, b.image || ""]
  );
  res.status(201).json({ id: rows[0].id });
}));

r.put("/menu/:id", auth, requireRole("owner", "manager"), h(async (req, res) => {
  const b = req.body || {};
  const catId = b.category ? await categoryIdForSlug(req.user.tid, b.category) : undefined;
  // build dynamic update from provided fields
  const fields = [], vals = [];
  const set = (col, val) => { if (val !== undefined) { fields.push(`${col}=$${fields.length + 1}`); vals.push(val); } };
  set("name", b.name); set("description", b.description); set("price", b.price);
  set("veg", b.veg); set("rating", b.rating); set("stock", b.stock); set("image", b.image);
  if (catId !== undefined) set("category_id", catId);
  if (!fields.length) return res.json({ ok: true });
  vals.push(req.params.id, req.user.tid);
  await q(`UPDATE menu_items SET ${fields.join(", ")} WHERE id=$${vals.length - 1} AND tenant_id=$${vals.length}`, vals);
  res.json({ ok: true });
}));

r.delete("/menu/:id", auth, requireRole("owner", "manager"), h(async (req, res) => {
  await q("DELETE FROM menu_items WHERE id=$1 AND tenant_id=$2", [req.params.id, req.user.tid]);
  res.json({ ok: true });
}));

/* ==================== TABLES ==================== */
r.get("/tables", auth, h(async (req, res) => {
  const { rows } = await q("SELECT number AS id, number, seats, status FROM restaurant_tables WHERE tenant_id=$1 ORDER BY number", [req.user.tid]);
  res.json(rows);
}));

r.post("/tables", auth, requireRole("owner", "manager"), h(async (req, res) => {
  const b = req.body || {};
  const number = Number(b.number);
  const seats = Number(b.seats) || 4;
  if (!number || number < 1) return res.status(400).json({ error: "Enter a valid table number" });
  try {
    await q("INSERT INTO restaurant_tables (tenant_id, number, seats, status) VALUES ($1,$2,$3,'free')", [req.user.tid, number, seats]);
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: `Table ${number} already exists` });
    throw e;
  }
}));

/* Resolves ?session=<id> to a real session belonging to this tenant,
   falling back to the tenant's current active session (financial year). */
async function resolveSessionId(tenantId, requestedId) {
  if (requestedId) {
    const { rows } = await q("SELECT id FROM sessions WHERE id=$1 AND tenant_id=$2", [requestedId, tenantId]);
    if (rows[0]) return rows[0].id;
  }
  const { rows } = await q("SELECT id FROM sessions WHERE tenant_id=$1 AND is_active=true LIMIT 1", [tenantId]);
  return rows[0] ? rows[0].id : null;
}

/* ==================== SESSIONS (financial years) ====================
   Orders/payments/analytics are scoped to a session so each year's
   business can be viewed separately. Menu, stock, staff and customer/
   messaging data are NOT session-scoped — they carry over every year. */
r.get("/sessions", auth, h(async (req, res) => {
  const { rows } = await q(
    "SELECT id, name, is_active AS \"isActive\", created_at AS \"createdAt\" FROM sessions WHERE tenant_id=$1 ORDER BY created_at DESC",
    [req.user.tid]);
  res.json(rows);
}));

r.post("/sessions", auth, requireRole("owner"), h(async (req, res) => {
  const name = (req.body && req.body.name && String(req.body.name).trim()) || null;
  const finalName = name || `Session ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
  const session = await tx(async (c) => {
    await c.query("UPDATE sessions SET is_active=false WHERE tenant_id=$1", [req.user.tid]);
    const ins = await c.query(
      "INSERT INTO sessions (tenant_id, name, is_active) VALUES ($1,$2,true) RETURNING id, name, is_active AS \"isActive\", created_at AS \"createdAt\"",
      [req.user.tid, finalName]);
    return ins.rows[0];
  });
  res.status(201).json(session);
}));

/* Switch which session new orders go into — e.g. re-activating a past
   financial year, or after accidentally starting a new one. */
r.patch("/sessions/:id/activate", auth, requireRole("owner"), h(async (req, res) => {
  const target = (await q("SELECT id FROM sessions WHERE id=$1 AND tenant_id=$2", [req.params.id, req.user.tid])).rows[0];
  if (!target) return res.status(404).json({ error: "Session not found" });
  await tx(async (c) => {
    await c.query("UPDATE sessions SET is_active=false WHERE tenant_id=$1", [req.user.tid]);
    await c.query("UPDATE sessions SET is_active=true WHERE id=$1", [req.params.id]);
  });
  res.json({ ok: true });
}));

/* ==================== ORDERS ==================== */
r.get("/orders", auth, h(async (req, res) => {
  const sessionId = await resolveSessionId(req.user.tid, req.query.session);
  const { rows } = await q(`${ORDERS_SELECT} WHERE o.tenant_id=$1 AND o.session_id=$2 GROUP BY o.id ORDER BY o.created_at DESC`, [req.user.tid, sessionId]);
  res.json(rows);
}));

r.post("/orders", auth, h(async (req, res) => {
  const order = await tx((c) => createOrder(c, req.user.tid, req.body || {}));
  res.status(201).json(order);
}));

r.patch("/orders/:id", auth, h(async (req, res) => {
  const { status } = req.body || {};
  if (!["pending", "preparing", "ready", "served"].includes(status)) return res.status(400).json({ error: "Bad status" });
  await q("UPDATE orders SET status=$1 WHERE id=$2 AND tenant_id=$3", [status, req.params.id, req.user.tid]);
  res.json({ ok: true });
}));

/* Mark a (usually Cash) order's payment as physically collected — records
   which staff member collected it, so it shows up as "Collected by <name>". */
r.patch("/orders/:id/collect", auth, h(async (req, res) => {
  const { rows } = await q(
    `UPDATE orders SET payment_collected=true, collected_by=$1, collected_at=now()
     WHERE id=$2 AND tenant_id=$3 RETURNING id`,
    [req.user.name, req.params.id, req.user.tid]
  );
  if (!rows[0]) return res.status(404).json({ error: "Order not found" });
  res.json({ ok: true, collectedBy: req.user.name });
}));

/* ==================== STAFF (per-staff logins) ==================== */
r.get("/staff", auth, requireRole("owner", "manager"), h(async (req, res) => {
  const { rows } = await q("SELECT id, name, username, role, shift FROM users WHERE tenant_id=$1 ORDER BY created_at", [req.user.tid]);
  res.json(rows);
}));

r.post("/staff", auth, requireRole("owner"), h(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.username || !b.password) return res.status(400).json({ error: "Name, username and password are required" });
  if (!["manager", "waiter", "cook"].includes(b.role)) return res.status(400).json({ error: "Invalid role" });
  try {
    const { rows } = await q(
      `INSERT INTO users (tenant_id, name, username, password_hash, role, shift)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, username, role, shift`,
      [req.user.tid, b.name, String(b.username).trim(), await hashPassword(b.password), b.role, b.shift || "Full day"]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "That username is already taken" });
    throw e;
  }
}));

/* Passwords are bcrypt-hashed (one-way) — they can never be "looked up"
   again, by design. This lets the owner set a NEW password for a staff
   member, which they can then hand to that person. */
r.patch("/staff/:id/password", auth, requireRole("owner"), h(async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 4) return res.status(400).json({ error: "Password must be at least 4 characters" });
  const { rows } = await q(
    "UPDATE users SET password_hash=$1 WHERE id=$2 AND tenant_id=$3 RETURNING id",
    [await hashPassword(password), req.params.id, req.user.tid]
  );
  if (!rows[0]) return res.status(404).json({ error: "Staff member not found" });
  res.json({ ok: true });
}));

/* Self-service: anyone (owner included — the owner has no one "above" them
   to reset it for them) can change their OWN password, but must prove they
   know the current one first, unlike the owner-resets-someone-else route
   above which trusts the owner's judgement instead. */
r.patch("/me/password", auth, h(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: "New password must be at least 4 characters" });
  const u = (await q("SELECT password_hash FROM users WHERE id=$1", [req.user.uid])).rows[0];
  if (!u || !(await verifyPassword(currentPassword || "", u.password_hash)))
    return res.status(401).json({ error: "Current password is incorrect" });
  await q("UPDATE users SET password_hash=$1 WHERE id=$2", [await hashPassword(newPassword), req.user.uid]);
  res.json({ ok: true });
}));

r.delete("/staff/:id", auth, requireRole("owner"), h(async (req, res) => {
  if (req.params.id === req.user.uid) return res.status(400).json({ error: "You can't remove your own account" });
  await q("DELETE FROM users WHERE id=$1 AND tenant_id=$2 AND role<>'owner'", [req.params.id, req.user.tid]);
  res.json({ ok: true });
}));

/* ==================== CUSTOMERS (for the Send Message / CRM page) ====================
   Aggregated from real orders — every customer who ever ordered, how many
   times, how much they've spent in total, and when they last visited. */
r.get("/customers", auth, requireRole("owner", "manager"), h(async (req, res) => {
  const { rows } = await q(`
    SELECT
      (array_agg(customer_name ORDER BY created_at DESC))[1] AS name,
      (array_agg(phone ORDER BY created_at DESC))[1] AS phone,
      COUNT(*)::int AS "orderCount",
      SUM(total)::float AS "totalSpent",
      MAX(created_at) AS "lastVisit"
    FROM orders
    WHERE tenant_id=$1 AND phone IS NOT NULL AND phone <> '' AND lower(phone) <> 'counter'
      AND length(regexp_replace(phone,'\\D','','g')) >= 6
    GROUP BY right(regexp_replace(phone,'\\D','','g'), 10)
    ORDER BY "lastVisit" DESC
  `, [req.user.tid]);
  res.json(rows);
}));

/* ==================== UPLOADS ==================== */
/* Images (logo, etc.) go to Cloudflare R2 instead of sitting inline as
   base64 in Postgres — see backend/src/r2.js. Falls back with a clear
   error when R2 isn't configured; callers should keep the old inline-base64
   path as a fallback for local dev (see dashboard.html's logo uploader). */
r.post("/uploads/image", auth, requireRole("owner", "manager"), h(async (req, res) => {
  if (!r2Configured) return res.status(501).json({ error: "R2_NOT_CONFIGURED" });
  const { dataUrl, folder } = req.body || {};
  if (!dataUrl) return res.status(400).json({ error: "Missing image data" });
  const safeFolder = /^[a-z0-9-]+$/i.test(folder || "") ? folder : "misc";
  const url = await uploadDataUrlToR2(dataUrl, `${req.user.tid}/${safeFolder}`);
  res.json({ url });
}));

/* ==================== SETTINGS ==================== */
r.get("/settings", auth, h(async (req, res) => {
  const t = (await q("SELECT * FROM tenants WHERE id=$1", [req.user.tid])).rows[0];
  res.json({
    ...publicTenant(t),
    razorpayKeyId: t.razorpay_key_id || "",
    razorpayConnected: !!(t.razorpay_key_id && t.razorpay_key_secret),
  });
}));

r.put("/settings", auth, requireRole("owner", "manager"), h(async (req, res) => {
  const b = req.body || {};
  const fields = [], vals = [];
  const set = (col, val) => { if (val !== undefined) { fields.push(`${col}=$${fields.length + 1}`); vals.push(val); } };
  set("name", b.name); set("tagline", b.tagline); set("phone", b.phone); set("logo", b.logo); set("address", b.address);
  set("is_closed", b.isClosed);
  // Domain, brand colour and payment keys are sensitive/structural — owner only.
  if (req.user.role === "owner") {
    set("primary_color", b.primaryColor);
    if (b.customDomain !== undefined) {
      const cleaned = String(b.customDomain).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
      set("custom_domain", cleaned || null);
    }
    if (b.razorpayKeyId !== undefined) set("razorpay_key_id", String(b.razorpayKeyId).trim() || null);
    // The secret is never sent back to the browser, so an empty/unset value
    // here means "leave the stored secret unchanged" — only overwrite it
    // when the owner actually typed a new one.
    if (b.razorpayKeySecret) set("razorpay_key_secret", String(b.razorpayKeySecret).trim());
  }
  if (!fields.length) return res.json({ ok: true });
  vals.push(req.user.tid);
  try {
    await q(`UPDATE tenants SET ${fields.join(", ")} WHERE id=$${vals.length}`, vals);
    // Closing the store means the dining room is being cleared for the day —
    // free up every table rather than leaving stale "occupied" statuses for
    // whenever the restaurant reopens.
    if (b.isClosed === true) await q("UPDATE restaurant_tables SET status='free' WHERE tenant_id=$1", [req.user.tid]);
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "That domain is already linked to another restaurant" });
    throw e;
  }
  res.json({ ok: true });
}));

/* ==================== STATS ==================== */
r.get("/stats", auth, h(async (req, res) => {
  const t = req.user.tid;
  const sessionId = await resolveSessionId(t, req.query.session);
  const rev = (await q("SELECT COALESCE(SUM(total),0)::float AS revenue, COUNT(*)::int AS count FROM orders WHERE tenant_id=$1 AND session_id=$2", [t, sessionId])).rows[0];
  // Occupied tables is always the CURRENT live floor status, regardless of
  // which session is being viewed — a past year's tables aren't "occupied" now.
  const occ = (await q("SELECT COUNT(*)::int AS occupied, (SELECT COUNT(*)::int FROM restaurant_tables WHERE tenant_id=$1) AS total FROM restaurant_tables WHERE tenant_id=$1 AND status='occupied'", [t])).rows[0];
  res.json({ revenue: rev.revenue, count: rev.count, avg: rev.count ? Math.round(rev.revenue / rev.count) : 0, occupied: occ.occupied, tables: occ.total });
}));

/* ==================== PUBLIC (customer) ==================== */
async function loadTenant(req, res, next) {
  const { rows } = await q("SELECT * FROM tenants WHERE slug=$1", [req.params.slug]);
  if (!rows[0]) return res.status(404).json({ error: "Restaurant not found" });
  req.tenant = rows[0];
  next();
}

/* Custom domain → tenant resolution. When a restaurant points their own
   domain (e.g. foodhouse.com) at this app via DNS, the frontend calls this
   once on load to find out which restaurant that domain belongs to — then
   proceeds exactly as if ?r=<slug> had been given. Multi-tenant stays
   intact: one app, one database, domains are just an alternate lookup key. */
r.get("/public/domain/:host", h(async (req, res) => {
  const host = String(req.params.host).toLowerCase().replace(/^www\./, "");
  const { rows } = await q("SELECT slug FROM tenants WHERE lower(custom_domain)=$1", [host]);
  if (!rows[0]) return res.status(404).json({ error: "No restaurant is linked to this domain" });
  res.json({ slug: rows[0].slug });
}));

r.get("/public/:slug", h(loadTenant), h(async (req, res) => {
  const t = req.tenant;
  const menu = (await q(`${MENU_SELECT} WHERE m.tenant_id=$1 ORDER BY c.sort NULLS LAST, m.name`, [t.id])).rows;
  const categories = (await q("SELECT slug, name FROM categories WHERE tenant_id=$1 ORDER BY sort", [t.id])).rows;
  const tables = (await q("SELECT number, seats, status FROM restaurant_tables WHERE tenant_id=$1 ORDER BY number", [t.id])).rows;
  res.json({ tenant: publicTenant(t), categories, menu, tables });
}));

r.post("/public/:slug/orders", h(loadTenant), h(async (req, res) => {
  // Server-side enforcement of "Close Store" — a customer can't bypass the
  // UI and place an order directly against the API while the store is shut.
  if (req.tenant.is_closed) return res.status(403).json({ error: "This restaurant is currently closed for new orders." });
  const order = await tx((c) => createOrder(c, req.tenant.id, req.body || {}));
  res.status(201).json(order);
}));

r.get("/public/:slug/orders/:code", h(loadTenant), h(async (req, res) => {
  const { rows } = await q(`${ORDERS_SELECT} WHERE o.tenant_id=$1 AND o.code=$2 GROUP BY o.id`, [req.tenant.id, req.params.code]);
  if (!rows[0]) return res.status(404).json({ error: "Order not found" });
  res.json(rows[0]);
}));

/* Razorpay, step 1: create a payment-gateway order sized to the cart total,
   using the restaurant's own keys (every tenant bills through its own
   Razorpay account — we never touch the money). No internal order exists
   yet, so a customer who backs out of the payment leaves nothing behind. */
r.post("/public/:slug/razorpay/order", h(loadTenant), h(async (req, res) => {
  const { razorpay_key_id: keyId, razorpay_key_secret: keySecret } = req.tenant;
  if (!keyId || !keySecret) return res.status(400).json({ error: "Online payments aren't set up for this restaurant yet" });
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: "Your cart is empty" });
  const total = items.reduce((s, it) => s + Number(it.price) * Number(it.qty), 0);
  const amountPaise = Math.round(total * 100);
  if (amountPaise < 100) return res.status(400).json({ error: "Order amount is too small to pay online" });

  const resp = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
    },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: `rcpt_${Date.now()}` }),
  });
  const data = await resp.json();
  if (!resp.ok) return res.status(502).json({ error: data.error?.description || "Could not start the payment" });
  res.json({ razorpayOrderId: data.id, amount: data.amount, currency: data.currency, keyId });
}));

/* Razorpay, step 2: verify the signature Razorpay's checkout returns to the
   browser — an HMAC of orderId|paymentId keyed with the tenant's own secret,
   which is what actually proves the payment happened (nothing from the
   browser alone is trusted). Only once that checks out do we create the
   real order, already marked paid. */
r.post("/public/:slug/razorpay/verify", h(loadTenant), h(async (req, res) => {
  const body = req.body || {};
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    return res.status(400).json({ error: "Missing payment details" });
  if (req.tenant.is_closed) return res.status(403).json({ error: "This restaurant is currently closed for new orders." });

  const expected = crypto
    .createHmac("sha256", req.tenant.razorpay_key_secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  if (expected !== razorpay_signature) return res.status(400).json({ error: "Payment verification failed" });

  const order = await tx(async (c) => {
    // Shown to the owner as "Card/UPI" like any other online payment — the
    // collected_by='Razorpay' set below is what marks it as auto-verified.
    const o = await createOrder(c, req.tenant.id, { ...body, method: "Card/UPI" });
    await c.query(
      `UPDATE orders SET payment_collected=true, collected_by='Razorpay', collected_at=now(),
       razorpay_order_id=$1, razorpay_payment_id=$2 WHERE id=$3`,
      [razorpay_order_id, razorpay_payment_id, o.id]
    );
    return o;
  });
  res.json(order);
}));

/* "My Orders" — every order this restaurant has ever received from a phone
   number, oldest to newest excluded (newest first). This is why order history
   needs a real database: a phone number can be looked up from any device. */
r.get("/public/:slug/orders", h(loadTenant), h(async (req, res) => {
  // Match on the last 10 digits (the national number) so "+91 98765 11111",
  // "919876511111" and "9876511111" are all treated as the same customer.
  const digits = String(req.query.phone || "").replace(/\D/g, "");
  const phone10 = digits.slice(-10);
  if (phone10.length < 6) return res.status(400).json({ error: "Enter a valid phone number" });
  const { rows } = await q(
    `${ORDERS_SELECT} WHERE o.tenant_id=$1 AND right(regexp_replace(o.phone,'\\D','','g'), 10) = $2
     GROUP BY o.id ORDER BY o.created_at DESC`, [req.tenant.id, phone10]);
  res.json(rows);
}));

export default r;
