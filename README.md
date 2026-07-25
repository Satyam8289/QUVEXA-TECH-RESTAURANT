# 🍴 The Food House

A complete **QR-based dine-in ordering + restaurant management** web app built with
**pure HTML, CSS and Vanilla JavaScript** — zero frameworks, zero build tools,
zero `npm install`.

Just open **`index.html`** in a browser and everything works.

---

## ✨ Features

### Customer side (QR → order from table)
- **Landing** (`index.html`) — table number + hero + View Menu
- **Menu** (`menu.html`) — live search, category filters, veg-only toggle, add-to-cart steppers, stock badges
- **Cart** (`cart.html`) — qty +/–, per-item notes, GST + service charge, live totals
- **Checkout** (`checkout.html`) — name, phone, table, UPI/Card/Cash
- **Thank You** (`thankyou.html`) — order ID + one-tap **WhatsApp** order message
- **Live Tracking** (`tracking.html`) — Pending → Preparing → Ready → Served timeline (auto-updates)

### Staff / Owner side
- **Login** (`login.html`) — demo mode, any email/password works
- **Dashboard** (`dashboard.html`)
  - KPI cards: revenue, orders, avg order value, occupied tables
  - Live orders table with one-click status changes
  - Hourly sales bar chart (pure CSS/SVG — no chart library)
  - Top-selling items, low-stock alerts
  - 12-table floor grid, recent payments, staff on shift

### Platform
- 🏢 **Multi-tenant database** — each restaurant has its own isolated data
  namespace in `localStorage` (`foodhouse:<tenant>:…`). Switch restaurants from
  the dashboard sidebar. Two demo tenants included: *The Food House* & *Spice Route*.
- 💬 **WhatsApp** deep-linking for order confirmations (`wa.me`).
- 📱 Fully **responsive** — mobile-first phone shell + desktop dashboard.
- 🖼️ Works **offline** — broken/blocked images fall back to a branded SVG.

---

## 📁 Structure
```
index.html        menu.html      cart.html      checkout.html
thankyou.html     tracking.html  login.html     dashboard.html
css/style.css     — design system (Emerald green · cream · orange, Fraunces + Inter)
js/data.js        — all seed data (menu, tables, staff, tenants) — edit here
js/db.js          — multi-tenant localStorage data layer
js/cart.js        — cart logic (localStorage: "foodhouse-cart")
js/app.js         — shared helpers (icons, currency, toast, WhatsApp)
```

## ▶️ Run
Double-click **`index.html`**, or serve the folder:
```bash
python -m http.server 8000    # then open http://localhost:8000
```

## ✏️ Customize
- **Menu / prices / restaurants** → `js/data.js`
- **Colours / fonts** → CSS variables at the top of `css/style.css`
- **WhatsApp number** → each tenant's `phone` in `js/data.js`

Currency: **INR (₹)** · Language: **English**
