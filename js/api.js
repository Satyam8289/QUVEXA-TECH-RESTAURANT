/* ============================================================
   The Food House — Backend API client
   ------------------------------------------------------------
   Talks to the real Node/Express + PostgreSQL backend (see /backend).
   Replaces the old localStorage-only data layer for both the
   customer flow (public endpoints, tenant resolved by slug) and
   the staff flow (JWT-authenticated, tenant resolved from the token
   so one restaurant's staff can never read another's data).
   ============================================================ */

const Api = (() => {
  // Same-origin by default — server.js serves the API and this frontend from
  // one process/URL in both dev and production. Only set window.FH_API_BASE
  // if the API is genuinely hosted on a different origin than the frontend.
  const BASE = (window.FH_API_BASE || "") + "/api";

  const SLUG_KEY = "foodhouse-tenant-slug";
  const TOKEN_KEY = "foodhouse-token";
  const USER_KEY = "foodhouse-user";

  /* ---------- tenant slug (customer side) ---------- */
  function tenantSlug() {
    const fromUrl = new URLSearchParams(location.search).get("r");
    if (fromUrl) { localStorage.setItem(SLUG_KEY, fromUrl); return fromUrl; }
    return localStorage.getItem(SLUG_KEY) || "food-house";
  }
  const setTenantSlug = (s) => localStorage.setItem(SLUG_KEY, s);

  /* ---------- low-level fetch ---------- */
  async function req(path, opts = {}) {
    let res;
    try {
      res = await fetch(BASE + path, {
        method: opts.method || "GET",
        headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      const err = new Error("Can't reach the server. Is the backend running?");
      err.offline = true;
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function authHeaders() {
    const t = localStorage.getItem(TOKEN_KEY);
    return t ? { Authorization: `Bearer ${t}` } : {};
  }
  async function authReq(path, opts = {}) {
    try {
      return await req(path, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
    } catch (e) {
      if (e.status === 401) { Api.logout(); location.href = "login.html"; }
      throw e;
    }
  }

  /* ---------- cached "current tenant" for branding/money helpers ---------- */
  let cache = { tenant: null, categories: [], menu: [], tables: [] };

  /* ==================== PUBLIC (customer) ==================== */
  const resolveDomain = (host) => req(`/public/domain/${encodeURIComponent(host)}`);

  /* Custom domain → tenant resolution. If a restaurant has pointed their own
     domain (e.g. foodhouse.com) at this app, figure out which tenant that is
     BEFORE loading data — same multi-tenant app, just a different lookup key
     than ?r=<slug>. An explicit ?r= in the URL always wins (lets staff/QR
     links override). Safe to call multiple times — only resolves once. */
  let domainResolved = null;
  async function ensureTenantResolved() {
    if (domainResolved) return domainResolved;
    domainResolved = (async () => {
      if (new URLSearchParams(location.search).get("r")) return; // explicit override
      const host = location.hostname;
      if (host === "localhost" || host === "127.0.0.1" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return; // local dev
      try {
        const res = await resolveDomain(host);
        if (res && res.slug) setTenantSlug(res.slug);
      } catch (e) { /* not a linked domain — fall back to stored/default slug */ }
    })();
    return domainResolved;
  }

  async function loadPublic() {
    await ensureTenantResolved();
    const data = await req(`/public/${tenantSlug()}`);
    cache = { tenant: data.tenant, categories: data.categories, menu: data.menu, tables: data.tables };
    return cache;
  }
  const getMenuPublic = () => cache.menu;
  const getCategoriesPublic = () => cache.categories;

  const placeOrderPublic = (payload) => req(`/public/${tenantSlug()}/orders`, { method: "POST", body: payload });
  const getOrderByCode = (code) => req(`/public/${tenantSlug()}/orders/${encodeURIComponent(code)}`);
  const myOrders = (phone) => req(`/public/${tenantSlug()}/orders?phone=${encodeURIComponent(phone)}`);

  /* Loyalty preview + private feedback (customer side). */
  const loyaltyStatus = (phone, subtotal) =>
    req(`/public/${tenantSlug()}/loyalty?phone=${encodeURIComponent(phone || "")}&subtotal=${subtotal || 0}`);
  const submitFeedback = (code, rating, comment) =>
    req(`/public/${tenantSlug()}/feedback`, { method: "POST", body: { code, rating, comment } });

  /* Combos (staff side). */
  const getCombos = () => authReq("/combos");
  const saveCombo = (combo) => authReq("/combos", { method: "POST", body: combo });
  const deleteCombo = (id) => authReq(`/combos/${id}`, { method: "DELETE" });
  const getFeedback = () => authReq("/feedback");

  /* Razorpay online checkout: create a gateway order sized to the cart,
     then (after the customer pays) verify + create the real order in one step. */
  // phone is sent so the server can apply the same loyalty discount it will
  // record on the order — otherwise we'd charge full price for a discounted order.
  const razorpayCreateOrder = (items, phone) => req(`/public/${tenantSlug()}/razorpay/order`, { method: "POST", body: { items, phone } });
  const razorpayVerifyAndPlaceOrder = (payload) => req(`/public/${tenantSlug()}/razorpay/verify`, { method: "POST", body: payload });

  /* Branding lookup while typing a username on the staff login page. */
  const lookupBranding = (username) => req(`/auth/lookup?username=${encodeURIComponent(username)}`);

  /* Image upload → Cloudflare R2 (see backend/src/r2.js). Returns a public
     URL string. Callers should fall back to storing the raw data URL when
     this rejects with R2_NOT_CONFIGURED (local dev without R2 keys). */
  const uploadImage = (dataUrl, folder) => authReq("/uploads/image", { method: "POST", body: { dataUrl, folder } });

  /* ==================== AUTH (staff) ==================== */
  async function login(username, password) {
    const data = await req("/auth/login", { method: "POST", body: { username, password } });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    cache.tenant = data.tenant;
    return data;
  }
  function logout() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
  function isAuthed() { return !!localStorage.getItem(TOKEN_KEY); }
  function currentUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; } }
  async function me() {
    const data = await authReq("/auth/me");
    cache.tenant = data.tenant;
    return data;
  }
  /* Guards a staff page. Verifies the token against the server (so an
     expired/tampered token is caught, not just "a token exists"). */
  async function requireAuth(roles) {
    if (!isAuthed()) { location.replace("login.html"); return null; }
    try {
      const data = await me();
      if (roles && !roles.includes(data.user.role)) { location.replace("dashboard.html"); return null; }
      return data;
    } catch (e) {
      location.replace("login.html");
      return null;
    }
  }

  /* ==================== STAFF DATA ==================== */
  const getMenu = () => authReq("/menu");
  const saveMenuItem = (item) => item.id
    ? authReq(`/menu/${item.id}`, { method: "PUT", body: item })
    : authReq("/menu", { method: "POST", body: item });
  const deleteMenuItem = (id) => authReq(`/menu/${id}`, { method: "DELETE" });
  const getCategories = () => authReq("/categories");

  const getTables = () => authReq("/tables");
  const addTable = (t) => authReq("/tables", { method: "POST", body: t });

  const getOrders = (sessionId) => authReq(`/orders${sessionId ? `?session=${sessionId}` : ""}`);
  const createOrder = (payload) => authReq("/orders", { method: "POST", body: payload });
  const updateOrderStatus = (id, status) => authReq(`/orders/${id}`, { method: "PATCH", body: { status } });
  const collectPayment = (id) => authReq(`/orders/${id}/collect`, { method: "PATCH" });

  const getSessions = () => authReq("/sessions");
  const createSession = (name) => authReq("/sessions", { method: "POST", body: { name } });
  const activateSession = (id) => authReq(`/sessions/${id}/activate`, { method: "PATCH" });

  const getStaff = () => authReq("/staff");
  const addStaff = (member) => authReq("/staff", { method: "POST", body: member });
  const deleteStaff = (id) => authReq(`/staff/${id}`, { method: "DELETE" });
  const resetStaffPassword = (id, password) => authReq(`/staff/${id}/password`, { method: "PATCH", body: { password } });
  const changeMyPassword = (currentPassword, newPassword) => authReq(`/me/password`, { method: "PATCH", body: { currentPassword, newPassword } });

  const getSettings = () => authReq("/settings");
  const saveSettings = (patch) => authReq("/settings", { method: "PUT", body: patch });

  const getStats = (sessionId) => authReq(`/stats${sessionId ? `?session=${sessionId}` : ""}`);
  const getCustomers = () => authReq("/customers");

  /* ---------- money / brand helpers (used by app.js) ---------- */
  const currency = () => (cache.tenant && cache.tenant.currency) || "₹";
  const money = (n) => `${currency()}${Number(n || 0).toLocaleString("en-IN")}`;
  const brandName = () => (cache.tenant && cache.tenant.name) || "Restaurant";
  const brandTagline = () => (cache.tenant && cache.tenant.tagline) || "";
  const brandLogo = () => (cache.tenant && cache.tenant.logo) || "";
  const brandPhone = () => (cache.tenant && cache.tenant.phone) || "";

  return {
    BASE, tenantSlug, setTenantSlug, cache: () => cache,
    loadPublic, getMenuPublic, getCategoriesPublic, placeOrderPublic, getOrderByCode, myOrders, lookupBranding,
    razorpayCreateOrder, razorpayVerifyAndPlaceOrder, uploadImage,
    loyaltyStatus, submitFeedback, getCombos, saveCombo, deleteCombo, getFeedback,
    resolveDomain, ensureTenantResolved,
    login, logout, isAuthed, currentUser, me, requireAuth, authReq,
    getMenu, saveMenuItem, deleteMenuItem, getCategories, getTables, addTable,
    getOrders, createOrder, updateOrderStatus, collectPayment,
    getSessions, createSession, activateSession,
    getStaff, addStaff, deleteStaff, resetStaffPassword, changeMyPassword, getSettings, saveSettings, getStats, getCustomers,
    money, brandName, brandTagline, brandLogo, brandPhone,
  };
})();

window.Api = Api;
