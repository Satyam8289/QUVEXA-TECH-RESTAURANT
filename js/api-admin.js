/* ============================================================
   Super Admin API client — platform-level control.
   Completely separate token scope from js/api.js (restaurant staff).
   A platform-admin token can never be used against tenant-scoped
   endpoints and vice versa (enforced server-side in auth.js).
   ============================================================ */

const AdminApi = (() => {
  // Same cross-origin rule as js/api.js: this panel is served statically from
  // Vercel, so it has to cross the wire to the VPS's own API domain —
  // there's no backend on any Vercel-served origin at all.
  const CROSS_ORIGIN_API = "https://api.quvexatech.com";
  const isLocalDev = location.hostname === "localhost" || location.hostname === "127.0.0.1" || /^\d+\.\d+\.\d+\.\d+$/.test(location.hostname);
  const BASE = (window.FH_API_BASE || (isLocalDev ? "" : CROSS_ORIGIN_API)) + "/api/platform";
  const TOKEN_KEY = "foodhouse-platform-token";
  const ADMIN_KEY = "foodhouse-platform-admin";

  async function req(path, opts = {}) {
    let res;
    try {
      res = await fetch(BASE + path, {
        method: opts.method || "GET",
        headers: { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      const err = new Error("Can't reach the server. Is the backend running?");
      err.offline = true;
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      if (res.status === 401) { logout(); location.href = "superadmin.html"; }
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }
  const authHeaders = () => { const t = localStorage.getItem(TOKEN_KEY); return t ? { Authorization: `Bearer ${t}` } : {}; };

  async function login(username, password) {
    const data = await req("/login", { method: "POST", body: { username, password } });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(data.admin));
    return data;
  }
  const logout = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ADMIN_KEY); };
  const isAuthed = () => !!localStorage.getItem(TOKEN_KEY);
  const currentAdmin = () => { try { return JSON.parse(localStorage.getItem(ADMIN_KEY)); } catch (e) { return null; } };
  const changePassword = (password) => req("/password", { method: "PATCH", body: { password } });

  const getStats = () => req("/stats");
  const getTenants = () => req("/tenants");
  const createTenant = (payload) => req("/tenants", { method: "POST", body: payload });
  const updateTenant = (id, patch) => req(`/tenants/${id}`, { method: "PATCH", body: patch });

  return { login, logout, isAuthed, currentAdmin, changePassword, getStats, getTenants, createTenant, updateTenant };
})();

window.AdminApi = AdminApi;
