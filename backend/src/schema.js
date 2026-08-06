/* PostgreSQL schema — multi-tenant restaurant platform.
   Every business table carries tenant_id → strict data isolation.
   gen_random_uuid() is built into PostgreSQL 13+. */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  tagline         TEXT,
  phone           TEXT,
  address         TEXT,
  logo            TEXT,
  currency        TEXT NOT NULL DEFAULT '₹',
  is_closed       BOOLEAN NOT NULL DEFAULT false,
  custom_domain   TEXT UNIQUE,
  primary_color   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_color TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS razorpay_key_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS razorpay_key_secret TEXT;
-- Loyalty: every Nth order from the same phone number earns a % discount.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS loyalty_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS loyalty_every_n INT NOT NULL DEFAULT 5;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS loyalty_percent INT NOT NULL DEFAULT 10;
-- Where to send happy customers to leave a public review (we can never post
-- on their behalf — Google forbids it — so this is just a link they tap).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS google_review_url TEXT;
-- WhatsApp order-confirmation (Meta Cloud API, "Utility" message category).
-- Requires the restaurant's own Meta WhatsApp Business Platform number and a
-- pre-approved template — we never touch WhatsApp's servers except via their
-- official Graph API using the tenant's own credentials.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_access_token TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_template_name TEXT DEFAULT 'order_confirmation';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp_template_lang TEXT DEFAULT 'en_US';
-- Geofencing: restrict dine-in orders to customers physically near the
-- restaurant. Built and ready, but off by default per-tenant (geofence_enabled)
-- — enable only when explicitly asked for.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS geofence_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS geofence_lat DOUBLE PRECISION;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS geofence_lng DOUBLE PRECISION;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS geofence_radius_m INT NOT NULL DEFAULT 300;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_custom_domain ON tenants(custom_domain) WHERE custom_domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  username       TEXT UNIQUE NOT NULL,           -- email or username (global login id)
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('owner','manager','waiter','cook')),
  shift          TEXT DEFAULT 'Full day',
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

CREATE TABLE IF NOT EXISTS categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  sort       INT NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS menu_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id  UUID REFERENCES categories(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  price        NUMERIC(10,2) NOT NULL DEFAULT 0,
  veg          BOOLEAN NOT NULL DEFAULT true,
  rating       NUMERIC(2,1) NOT NULL DEFAULT 4.5,
  stock        INT NOT NULL DEFAULT 0,
  image        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_menu_tenant ON menu_items(tenant_id);

-- A combo is just a menu_item flagged as one, so it gets a name, price,
-- photo, category and menu placement for free — combo_items then lists the
-- dishes it bundles, which is what actually gets deducted from stock.
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_combo BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS combo_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id      UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  menu_item_id  UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  qty           INT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_combo_items_combo ON combo_items(combo_id);

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number     INT NOT NULL,
  seats      INT NOT NULL DEFAULT 4,
  status     TEXT NOT NULL DEFAULT 'free',
  UNIQUE (tenant_id, number)
);

-- A "session" is a financial year (e.g. "FY 2026-2027"). Orders belong to
-- exactly one session, so an owner can view each year's business separately
-- — but the menu, stock and customer/messaging data are NOT session-scoped;
-- they live on directly and carry over from one year to the next.
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);

CREATE TABLE IF NOT EXISTS orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id         UUID REFERENCES sessions(id),
  code               TEXT NOT NULL,
  table_number       INT,
  customer_name      TEXT,
  phone              TEXT,
  method             TEXT NOT NULL DEFAULT 'Cash',
  status             TEXT NOT NULL DEFAULT 'pending',
  total              NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_collected  BOOLEAN NOT NULL DEFAULT false,
  collected_by       TEXT,
  collected_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id, created_at DESC);

-- Additive migrations for restaurants that already exist from earlier runs
-- (CREATE TABLE IF NOT EXISTS above won't add columns to a table that's
-- already there, so these ALTERs keep existing data intact and up to date).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_collected BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS collected_by TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0;
-- Tax and service charge are stored per order (not just recomputed) so a
-- past bill still shows what was actually charged if the rates ever change.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge NUMERIC(10,2) NOT NULL DEFAULT 0;
-- 'dine-in' uses a table number; 'takeaway' (incl. car service) uses no table
-- at all and carries the customer's vehicle number instead.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'dine-in';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_number TEXT;
-- An unguessable token for the customer-facing order URL. Order codes are
-- sequential (ORD-2041, 2042…) so anyone could otherwise walk them and read
-- every customer's name/phone/items. The public track/bill endpoints require
-- this token; staff reach orders through the authenticated API instead.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS public_token TEXT;
-- Backfill old rows with a random token. md5(random()||id) needs no pgcrypto
-- extension (gen_random_bytes does); new orders get a crypto-strong token
-- generated in Node, see createOrder.
UPDATE orders SET public_token = md5(random()::text || id::text) WHERE public_token IS NULL;

-- Private feedback: only the restaurant ever sees this. Asking here rather
-- than on a public review site is the point — the owner hears about a bad
-- meal before it turns into a one-star review.
CREATE TABLE IF NOT EXISTS feedback (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_code     TEXT,
  rating         INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        TEXT,
  customer_name  TEXT,
  phone          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_tenant ON feedback(tenant_id, created_at DESC);
-- Cash orders start uncollected; everything else (UPI/Card, chosen at the
-- counter) is settled instantly. Razorpay is the one online method that
-- stays uncollected until its payment is actually verified.
UPDATE orders SET payment_collected = true WHERE method NOT IN ('Cash','Razorpay') AND payment_collected = false;

-- Platform-level operator (you) — separate from every restaurant's own
-- owner/manager/waiter accounts. Logs into a distinct Super Admin panel to
-- onboard new restaurants and manage their domains, not into any one
-- restaurant's dashboard.
-- Leads from the public demo gate (company website "try the demo" flow) —
-- platform-level, not tied to any tenant, visible only in Super Admin.
CREATE TABLE IF NOT EXISTS demo_leads (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name  TEXT NOT NULL,
  phone          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_admins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username       TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id  UUID,
  name          TEXT NOT NULL,
  price         NUMERIC(10,2) NOT NULL,
  qty           INT NOT NULL,
  note          TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
`;
