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
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);
-- Cash orders start uncollected; everything else (UPI/Card) is settled instantly.
UPDATE orders SET payment_collected = true WHERE method <> 'Cash' AND payment_collected = false;

-- Platform-level operator (you) — separate from every restaurant's own
-- owner/manager/waiter accounts. Logs into a distinct Super Admin panel to
-- onboard new restaurants and manage their domains, not into any one
-- restaurant's dashboard.
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
