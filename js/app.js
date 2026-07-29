/* ============================================================
   The Food House — Shared helpers (icons, currency, toast,
   WhatsApp, image fallback, tenant switching)
   ============================================================ */

const App = (() => {
  const money = (n) => Api.money(n);

  /* ---- Inline SVG icon set (no emojis, no icon libs) ---- */
  const ICONS = {
    cart:    '<path d="M6 6h15l-1.5 9h-12L6 3H3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/>',
    search:  '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.2-3.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    plus:    '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    minus:   '<path d="M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    back:    '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    check:   '<path d="M4 12.5l5 5 11-11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    star:    '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
    clock:   '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    table:   '<rect x="3" y="8" width="18" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 17v3M17 17v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    whatsapp:'<path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.6 14.2c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .2-3.2-.7-2.7-1.1-4.4-3.8-4.5-4-.1-.2-1.1-1.4-1.1-2.7s.7-1.9 .9-2.1c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .6l-.4.6c-.1.2-.3.3-.1.6.1.3.7 1.1 1.4 1.7.9.8 1.6 1 1.9 1.2.2.1.4.1.5-.1l.6-.8c.2-.3.4-.2.6-.1l1.8.9c.2.1.4.2.5.3.1.3.1.7-.1 1.3Z"/>',
    dashboard:'<rect x="3" y="3" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13" y="3" width="8" height="5" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13" y="11" width="8" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="14" width="8" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>',
    revenue: '<path d="M12 3v18M8 7h5a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    bag:     '<path d="M6 8h12l-1 12H7L6 8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 8a3 3 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="2"/>',
    trend:   '<path d="M4 15l5-5 4 4 7-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 6h4v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    users:   '<circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 5.2a3 3 0 0 1 0 5.6M17 20a5.5 5.5 0 0 0-2-4.3" fill="none" stroke="currentColor" stroke-width="2"/>',
    alert:   '<path d="M12 3l9 16H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v4M12 16.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    logout:  '<path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M17 8l4 4-4 4M21 12H9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    leaf:    '<path d="M4 20c8 2 15-4 15-14 0 0-13-3-15 8 0 0 3-4 9-5-4 3-9 5-9 11Z"/>',
    pin:     '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/>',
    clipboard:'<rect x="5" y="4" width="14" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9" y="2.6" width="6" height="3.4" rx="1.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 11h7M8.5 15h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    cutlery: '<path d="M6 3v5a2 2 0 0 0 4 0V3M8 10v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3c-1.6 .8-2.5 3-2.5 5.2 0 1.6 1 2.6 2.5 2.8V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    card:    '<rect x="3" y="6" width="18" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18" stroke="currentColor" stroke-width="2"/><path d="M7 15h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    box:     '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    gear:    '<path d="M19.4 13a7.7 7.7 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1l-.4-2.5H10l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L3.6 11a7.7 7.7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    upload:  '<path d="M12 15V4M8 8l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    floor:   '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/>',
    message: '<path d="M4 5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 10h8M8 13.5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    send:    '<path d="M4 12 20 4l-6.5 16-2.7-7L4 12Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    lock:    '<rect x="4.5" y="10.5" width="15" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="15" r="1.6"/>',
    rupee:   '<text x="12" y="17.5" text-anchor="middle" font-size="16" font-weight="700" fill="currentColor" font-family="Georgia, \'Times New Roman\', serif">₹</text>',
    car:     '<path d="M4 16v-3.2L6 8h12l2 4.8V16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M3.5 16h17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="7.5" cy="18" r="1.7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16.5" cy="18" r="1.7" fill="none" stroke="currentColor" stroke-width="2"/>',
    dinein:  '<path d="M7 3v6a2.5 2.5 0 0 0 5 0V3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9.5 11v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 3c-1.4 1-2 3-2 5.2 0 1.5.8 2.4 2 2.6V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  };

  /* ---- Brand mark (uploaded logo, or leaf icon fallback) ---- */
  function brandMark(size = 40) {
    const logo = Api.brandLogo();
    if (logo) return `<span class="brand-mark has-logo" style="width:${size}px;height:${size}px"><img src="${logo}" alt="logo"/></span>`;
    return `<span class="brand-mark" style="width:${size}px;height:${size}px">${icon("leaf", Math.round(size * 0.5))}</span>`;
  }

  function icon(name, size = 20, cls = "") {
    const p = ICONS[name] || "";
    return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  }

  /* ---- Image fallback (works offline / broken Unsplash) ---- */
  function imgFallback(el) {
    const svg = encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'>
        <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0' stop-color='#0f5132'/><stop offset='1' stop-color='#1a7a4c'/></linearGradient></defs>
        <rect width='400' height='300' fill='url(#g)'/>
        <text x='50%' y='52%' fill='#ffffff' opacity='0.85' font-family='sans-serif'
          font-size='26' font-weight='700' text-anchor='middle'>The Food House</text></svg>`
    );
    el.onerror = null;
    el.src = `data:image/svg+xml,${svg}`;
  }

  /* ---- Toast ---- */
  let toastTimer;
  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  /* ---- WhatsApp deep link ---- */
  function whatsappOrderLink(order, toNumber) {
    const lines = order.items.map((it) => `• ${it.qty} × ${it.name} — ${money(it.price * it.qty)}`);
    const total = order.total != null ? order.total : order.items.reduce((s, it) => s + it.price * it.qty, 0);
    const text =
      `*${Api.brandName()} — Order ${order.code || order.id}*%0A` +
      `Table: ${order.table}%0A` +
      `Name: ${order.customer || "Guest"}%0A%0A` +
      lines.join("%0A") + "%0A%0A" +
      `*Total: ${money(total)}*%0A` +
      `Payment: ${order.method}%0A%0A` +
      `Thank you! Please prepare my order.`;
    // Default: send to the restaurant's WhatsApp business number. Pass the
    // customer's own number (toNumber) to open a chat to themselves instead
    // (WhatsApp's "Message Yourself"), so they can keep the bill on their phone.
    const num = (toNumber || Api.brandPhone()).replace(/\D/g, "");
    return `https://wa.me/${num}?text=${text}`;
  }

  /* ---- Customer bottom navigation (app-like) ---- */
  function bottomNav(active) {
    const c = window.Cart ? Cart.count() : 0;
    const badge = c > 0 ? `<span class="bn-badge">${c}</span>` : "";
    const item = (key, href, ico, label, extra = "") =>
      `<a class="bn-item ${key === active ? "active" : ""}" href="${href}">${extra}${icon(ico, 23)}<span>${label}</span></a>`;
    return `<nav class="bottomnav">
      ${item("menu", "menu.html", "cutlery", "Menu")}
      ${item("orders", "orders.html", "clock", "My Orders")}
      ${item("cart", "cart.html", "cart", "Cart", badge)}
    </nav>`;
  }

  /* ---- Render the shared brand header for customer pages ---- */
  function brandBar(opts = {}) {
    const table = getTableNo();
    const back = opts.back ? `<a class="iconbtn" href="${opts.back}" aria-label="Back">${icon("back", 22)}</a>` : brandMark(40);
    const tableChip = table ? `<span class="chip chip-soft">${icon("table", 15)} Table ${table}</span>` : "";
    const ordersBtn = opts.orders === false ? "" : `<a class="iconbtn" href="orders.html" aria-label="My Orders" title="My Orders">${icon("clock", 20)}</a>`;
    return `
      <header class="topbar">
        ${back}
        <div class="topbar-title">
          <strong>${Api.brandName()}</strong>
          <small>${opts.subtitle || Api.brandTagline()}</small>
        </div>
        ${tableChip}
        ${ordersBtn}
      </header>`;
  }

  /* ---- Table number persistence ---- */
  const TABLE_KEY = "foodhouse-table";
  const LOCK_KEY = "foodhouse-tableLocked";
  const getTableNo = () => localStorage.getItem(TABLE_KEY) || "";
  const setTableNo = (n) => localStorage.setItem(TABLE_KEY, n);
  const isTableLocked = () => localStorage.getItem(LOCK_KEY) === "1";
  const setTableLocked = (v) => v ? localStorage.setItem(LOCK_KEY, "1") : localStorage.removeItem(LOCK_KEY);

  /* ---- Order type: "dine-in" (a table number) or "takeaway" (no table, a
     vehicle number instead — this is what car service uses too). ---- */
  const TYPE_KEY = "foodhouse-orderType";
  const VEHICLE_KEY = "foodhouse-vehicle";
  // Empty until the customer actually picks one on the menu overlay; anything
  // that isn't "takeaway" behaves as dine-in.
  const getOrderType = () => localStorage.getItem(TYPE_KEY) || "";
  const setOrderType = (t) => localStorage.setItem(TYPE_KEY, t === "takeaway" ? "takeaway" : "dine-in");
  const clearOrderType = () => localStorage.removeItem(TYPE_KEY);
  const isTakeaway = () => getOrderType() === "takeaway";
  const getVehicle = () => localStorage.getItem(VEHICLE_KEY) || "";
  const setVehicle = (v) => localStorage.setItem(VEHICLE_KEY, (v || "").toUpperCase());

  /* ---- Customer identity (name + phone), captured once via a gate modal
     before the first item is added to the cart. Stored per restaurant so
     switching restaurants asks again. Powers "My Orders" phone lookup,
     checkout prefill and the WhatsApp bill. ---- */
  const custKey = () => `foodhouse-customer:${Api.tenantSlug()}`;
  const getCustomer = () => { try { return JSON.parse(localStorage.getItem(custKey())); } catch (e) { return null; } };
  const setCustomer = (c) => localStorage.setItem(custKey(), JSON.stringify(c));

  const timeAgo = (ts) => {
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h} hr ago`;
    return `${Math.floor(h / 24)} d ago`;
  };

  return { money, icon, ICONS, imgFallback, toast, whatsappOrderLink, brandBar, brandMark, bottomNav,
           getTableNo, setTableNo, isTableLocked, setTableLocked,
           getOrderType, setOrderType, clearOrderType, isTakeaway, getVehicle, setVehicle,
           getCustomer, setCustomer, timeAgo };
})();

window.App = App;

/* ---- Staff auth convenience wrappers (real backend, see js/api.js) ---- */
App.login = (username, password) => Api.login(username, password);
App.currentUser = () => Api.currentUser();
App.isAuthed = () => Api.isAuthed();
App.logout = () => Api.logout();
App.requireAuth = (roles) => Api.requireAuth(roles);

/* ---- Customer bottom nav mount (auto-updates cart badge) ---- */
App.mountBottomNav = function (active) {
  let el = document.getElementById("bnav");
  if (!el) { el = document.createElement("div"); el.id = "bnav"; document.body.appendChild(el); }
  el.dataset.active = active;
  el.innerHTML = App.bottomNav(active);
};
document.addEventListener("cart:change", () => {
  const el = document.getElementById("bnav");
  if (el) App.mountBottomNav(el.dataset.active);
});

/* ---- Role-aware staff navigation ---- */
App.NAV = [
  { key: "overview",  label: "Overview",     icon: "dashboard", roles: ["owner", "manager", "waiter"] },
  { key: "orders",    label: "Live orders",  icon: "clipboard", roles: ["owner", "manager", "waiter"] },
  { key: "pos",       label: "New Order",    icon: "cart",      roles: ["waiter"], href: "pos.html" },
  { key: "menu",      label: "Menu",         icon: "cutlery",   roles: ["owner", "manager"], href: "admin-menu.html" },
  { key: "tables",    label: "Tables & QR",  icon: "table",     roles: ["owner", "manager", "waiter"], href: "qr.html" },
  { key: "payments",  label: "Payments",     icon: "card",      roles: ["owner", "manager"] },
  { key: "stock",     label: "Stock",        icon: "box",       roles: ["owner", "manager"] },
  { key: "staff",     label: "Staff",        icon: "users",     roles: ["owner"] },
  { key: "analytics", label: "Analytics",    icon: "trend",     roles: ["owner", "manager"] },
  { key: "feedback",  label: "Feedback",     icon: "star",      roles: ["owner", "manager"] },
  { key: "messages",  label: "Send Message", icon: "message",   roles: ["owner", "manager"], href: "messages.html" },
  { key: "settings",  label: "Settings",     icon: "gear",      roles: ["owner"] },
];
App.navHref = (key) => { const it = App.NAV.find((n) => n.key === key); return it && it.href ? it.href : `dashboard.html#${key}`; };
App.navFor = (role) => App.NAV.filter((n) => n.roles.includes(role));

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
App.initials = (name) => (name || "?").replace(/[^a-zA-Z ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "U";

App.mountSidebar = function (elId, active) {
  const el = document.getElementById(elId);
  if (!el) return;
  const user = App.currentUser() || { name: "Owner", role: "owner" };
  const links = App.navFor(user.role).map((n) =>
    `<a class="navlink ${n.key === active ? "active" : ""}" data-key="${n.key}" href="${App.navHref(n.key)}">${App.icon(n.icon, 19)} ${n.label}</a>`).join("");
  el.innerHTML = `
    <div class="logo">${App.brandMark(38)}
      <div><strong>${Api.brandName()}</strong><small>${cap(user.role)} workspace</small></div></div>
    ${links}
    <div class="spacer"></div>
    <a class="navlink" href="index.html">${App.icon("leaf", 19)} Customer view</a>
    <a class="navlink" id="logoutLink" href="login.html">${App.icon("logout", 19)} Sign out</a>`;
  el.querySelector("#logoutLink").addEventListener("click", () => App.logout());
};
App.setActiveNav = function (elId, active) {
  document.querySelectorAll(`#${elId} .navlink`).forEach((a) => a.classList.toggle("active", a.dataset.key === active));
};
App.mountMobileNav = function (elId, active) {
  const el = document.getElementById(elId);
  if (!el) return;
  const role = (App.currentUser() || { role: "owner" }).role;
  el.innerHTML = App.navFor(role).map((n) =>
    `<a class="mnav-item ${n.key === active ? "active" : ""}" data-key="${n.key}" href="${App.navHref(n.key)}">${App.icon(n.icon, 18)}<span>${n.label}</span></a>`).join("");
};

/* ---- Admin topbar: fixed eyebrow "RESTRO" + page title (updates on nav)
   with search / refresh / notifications / user chip on the right. ---- */
App.mountTopbar = function (elId, title, onRefresh) {
  const el = document.getElementById(elId);
  if (!el) return;
  const user = App.currentUser() || { name: "Owner", role: "owner" };
  el.innerHTML = `
    <div class="titles"><span class="dash-eyebrow">RESTRO</span><h1 id="tbTitle">${title}</h1></div>
    <div class="actions">
      <div class="tt-search">${App.icon("search", 16)}<input id="tbSearch" placeholder="Search orders, items…" autocomplete="off" /></div>
      <button class="tt-icon" id="tbRefresh" title="Refresh" type="button">${App.icon("dashboard", 18)}</button>
      <button class="tt-icon" id="tbBell" title="Notifications" type="button">${App.icon("alert", 18)}<span class="dot" id="tbDot" style="display:none"></span></button>
      <div class="tt-user"><span class="avatar">${App.initials(user.name)}</span>
        <div><b>${user.name}</b><small>${cap(user.role)}</small></div></div>
    </div>`;
  if (onRefresh) document.getElementById("tbRefresh").addEventListener("click", onRefresh);
};
App.setTopbarTitle = (title) => { const h1 = document.getElementById("tbTitle"); if (h1) h1.textContent = title; };
App.setNotifDot = (show) => { const d = document.getElementById("tbDot"); if (d) d.style.display = show ? "block" : "none"; };

/* Deep-link handling for QR codes: ?r=<tenant-slug>&table=<n>
   Api.tenantSlug() already resolves & persists ?r= on every call.
   Here we just lock the table number when it arrives via a table QR. */
(function () {
  const onLanding = /(^|\/)index\.html$/.test(location.pathname) || location.pathname === "/";
  // Landing here starts a fresh visit, so ask dine-in vs takeaway again on
  // the menu rather than reusing whatever they picked last time.
  if (onLanding) App.clearOrderType();

  const table = new URLSearchParams(location.search).get("table");
  // A table QR pins which table they're at, but not how they're ordering —
  // someone seated may still want a parcel, so the menu overlay asks.
  if (table) { App.setTableNo(table); App.setTableLocked(true); return; }
  // No ?table= on the landing page means this visit didn't come from a table
  // QR — release any lock left over from an earlier scan, or that device
  // stays pinned to one table forever.
  if (onLanding) App.setTableLocked(false);
})();
