/* ============================================================
   The Food House — Multi-Tenant Data Layer
   ------------------------------------------------------------
   A tiny persistence layer over localStorage. Every restaurant
   ("tenant") gets its own isolated namespace:

       foodhouse:<tenantId>:<collection>

   So orders / menu / tables for "food-house" never collide with
   "spice-route". This mimics a real multi-tenant database while
   staying 100% client-side (no server, no build tools).
   ============================================================ */

const DB = (() => {
  const NS = "foodhouse";
  const TENANT_KEY = `${NS}:activeTenant`;

  const { TENANTS, DEFAULT_TENANT } = window.FH_SEED;

  /* ---- Tenant selection ---- */
  function getTenantId() {
    const id = localStorage.getItem(TENANT_KEY);
    return id && TENANTS[id] ? id : DEFAULT_TENANT;
  }
  function setTenant(id) {
    if (!TENANTS[id]) return false;
    localStorage.setItem(TENANT_KEY, id);
    return true;
  }
  function tenant() {
    return TENANTS[getTenantId()];
  }

  /* ---- Key helper ---- */
  const key = (collection) => `${NS}:${getTenantId()}:${collection}`;

  /* ---- Seeding: run once per tenant ---- */
  function ensureSeeded() {
    const t = tenant();
    const flag = `${NS}:${t.id}:seeded`;
    if (localStorage.getItem(flag)) return;
    write("menu", t.seed.menu);
    write("tables", t.seed.tables);
    write("staff", t.seed.staff);
    write("orders", t.seed.orders);
    localStorage.setItem(flag, "1");
  }

  /* ---- Raw read / write ---- */
  function read(collection, fallback = []) {
    try {
      const raw = localStorage.getItem(key(collection));
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(collection, value) {
    localStorage.setItem(key(collection), JSON.stringify(value));
    return value;
  }

  /* ---- Collections ---- */
  const getMenu   = () => read("menu");
  const getTables = () => read("tables");
  const getStaff  = () => read("staff");
  const getOrders = () => read("orders");

  function menuItem(id) {
    return getMenu().find((m) => m.id === id);
  }

  /* ---- Settings (per tenant: brand name, logo, phone, waiter creds) ---- */
  const settingsKeyFor = (tid) => `${NS}:${tid}:settings`;
  function settingsFor(tid) {
    const t = TENANTS[tid];
    if (!t) return null;
    try { const raw = localStorage.getItem(settingsKeyFor(tid)); if (raw) return JSON.parse(raw); } catch (e) {}
    const def = { name: t.name, tagline: t.tagline, phone: t.phone, logo: "", waiterUser: `${tid}.waiter`, waiterPass: "waiter123" };
    localStorage.setItem(settingsKeyFor(tid), JSON.stringify(def));
    return def;
  }
  const getSettings = () => settingsFor(getTenantId());
  function saveSettings(patch) {
    const s = { ...getSettings(), ...patch };
    localStorage.setItem(settingsKeyFor(getTenantId()), JSON.stringify(s));
    return s;
  }
  const brandName = () => getSettings().name;
  const brandLogo = () => getSettings().logo;
  const brandTagline = () => getSettings().tagline;
  const brandPhone = () => getSettings().phone;

  /* ---- Menu editing (owner) ---- */
  function nextMenuId() {
    const nums = getMenu()
      .map((m) => parseInt(String(m.id).replace(/\D/g, ""), 10))
      .filter((n) => !isNaN(n));
    return `m${(nums.length ? Math.max(...nums) : 0) + 1}`;
  }

  function saveMenuItem(item) {
    const menu = getMenu();
    if (item.id) {
      const idx = menu.findIndex((m) => m.id === item.id);
      if (idx > -1) menu[idx] = { ...menu[idx], ...item };
      else menu.push(item);
    } else {
      menu.push({ ...item, id: nextMenuId() });
    }
    write("menu", menu);
    return menu;
  }

  function deleteMenuItem(id) {
    write("menu", getMenu().filter((m) => m.id !== id));
  }

  /* ---- Staff ---- */
  function nextStaffId() {
    const nums = getStaff().map((s) => parseInt(String(s.id).replace(/\D/g, ""), 10)).filter((n) => !isNaN(n));
    return `s${(nums.length ? Math.max(...nums) : 0) + 1}`;
  }
  function addStaff(s) {
    const staff = getStaff();
    const initials = (s.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    staff.push({ id: nextStaffId(), initials, ...s });
    write("staff", staff);
    return staff;
  }
  function deleteStaff(id) { write("staff", getStaff().filter((s) => s.id !== id)); }

  function resetTenant() {
    localStorage.removeItem(`${NS}:${getTenantId()}:seeded`);
    ["menu", "tables", "staff", "orders"].forEach((c) => localStorage.removeItem(key(c)));
    ensureSeeded();
  }

  /* ---- Orders ---- */
  function nextOrderId() {
    const orders = getOrders();
    const nums = orders
      .map((o) => parseInt(String(o.id).replace(/\D/g, ""), 10))
      .filter((n) => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 2040) + 1;
    return `FH-${next}`;
  }

  function placeOrder(order) {
    const orders = getOrders();
    const record = {
      id: nextOrderId(),
      status: "pending",
      createdAt: Date.now(),
      ...order,
    };
    orders.unshift(record);
    write("orders", orders);

    // Mark the table occupied.
    if (record.table) {
      const tables = getTables();
      const t = tables.find((x) => x.id === Number(record.table));
      if (t) { t.status = "occupied"; write("tables", tables); }
    }
    return record;
  }

  function updateOrderStatus(orderId, status) {
    const orders = getOrders();
    const o = orders.find((x) => x.id === orderId);
    if (o) { o.status = status; write("orders", orders); }
    return o;
  }

  function getOrder(orderId) {
    return getOrders().find((o) => o.id === orderId);
  }

  /* ---- Analytics helpers for the dashboard ---- */
  function orderTotal(o) {
    return o.items.reduce((s, it) => s + it.price * it.qty, 0);
  }

  function stats() {
    const orders = getOrders();
    const revenue = orders.reduce((s, o) => s + orderTotal(o), 0);
    const count = orders.length;
    const avg = count ? Math.round(revenue / count) : 0;
    const occupied = getTables().filter((t) => t.status === "occupied").length;
    return { revenue, count, avg, occupied };
  }

  return {
    TENANTS, getTenantId, setTenant, tenant, setActive: setTenant,
    ensureSeeded, read, write,
    getMenu, getTables, getStaff, getOrders, menuItem,
    saveMenuItem, deleteMenuItem, nextMenuId, resetTenant,
    addStaff, deleteStaff, nextStaffId,
    settingsFor, getSettings, saveSettings, brandName, brandLogo, brandTagline, brandPhone,
    placeOrder, updateOrderStatus, getOrder, nextOrderId,
    orderTotal, stats,
  };
})();

/* Seed the active tenant as soon as the DB loads. */
DB.ensureSeeded();
window.DB = DB;
