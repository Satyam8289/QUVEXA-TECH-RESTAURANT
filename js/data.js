/* ============================================================
   The Food House — Seed Data (Multi-Tenant)
   ------------------------------------------------------------
   All demo data lives here so it's trivial to edit.
   Two tenants (restaurants) are provided to demonstrate the
   multi-tenant database layer in js/db.js.
   ============================================================ */

(function () {
/* ---------- Categories ---------- */
const CATEGORIES = [
  { id: "starters",  name: "Starters" },
  { id: "main",      name: "Main Course" },
  { id: "breads",    name: "Breads" },
  { id: "rice",      name: "Rice & Biryani" },
  { id: "desserts",  name: "Desserts" },
  { id: "beverages", name: "Beverages" },
];

/* Unsplash image helper — stable photo IDs, auto-cropped. */
const img = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=600&q=70`;

/* ---------- Menu (13 items, 6 categories) ---------- */
const MENU_ITEMS = [
  // Starters
  { id: "m1",  name: "Paneer Tikka",        category: "starters",  veg: true,  price: 289, rating: 4.7, stock: 24,
    description: "Chargrilled cottage cheese marinated in spiced yogurt.", image: img("1567188040759-fb8a883dc6d8") },
  { id: "m2",  name: "Chicken 65",          category: "starters",  veg: false, price: 329, rating: 4.6, stock: 18,
    description: "Crispy South-Indian fried chicken with curry leaves.",   image: img("1610057099431-d73a1c9d2f2f") },
  { id: "m3",  name: "Crispy Corn Chaat",   category: "starters",  veg: true,  price: 219, rating: 4.4, stock: 30,
    description: "Golden sweet corn tossed with onion, chilli & lime.",    image: img("1625944525533-473f1a3d54e7") },

  // Main Course
  { id: "m4",  name: "Butter Chicken",      category: "main",      veg: false, price: 429, rating: 4.9, stock: 20,
    description: "Tandoori chicken in a silky tomato-butter gravy.",       image: img("1603894584373-5ac82b2ae398") },
  { id: "m5",  name: "Dal Makhani",         category: "main",      veg: true,  price: 279, rating: 4.8, stock: 26,
    description: "Slow-cooked black lentils finished with cream.",         image: img("1546833999-b9f581a1996d") },
  { id: "m6",  name: "Paneer Butter Masala",category: "main",      veg: true,  price: 349, rating: 4.7, stock: 22,
    description: "Cottage cheese simmered in a rich cashew gravy.",        image: img("1631452180519-c014fe946bc7") },

  // Breads
  { id: "m7",  name: "Garlic Naan",         category: "breads",    veg: true,  price: 79,  rating: 4.6, stock: 60,
    description: "Tandoor-baked leavened bread brushed with garlic butter.", image: img("1601050690597-df0568f70950") },
  { id: "m8",  name: "Laccha Paratha",      category: "breads",    veg: true,  price: 69,  rating: 4.5, stock: 45,
    description: "Flaky multi-layered whole-wheat flatbread.",             image: img("1626777552726-4a6b54c97e46") },

  // Rice & Biryani
  { id: "m9",  name: "Hyderabadi Biryani",  category: "rice",      veg: false, price: 379, rating: 4.9, stock: 16,
    description: "Fragrant dum-cooked basmati with spiced chicken.",       image: img("1563379091339-03b21ab4a4f8") },
  { id: "m10", name: "Veg Dum Biryani",     category: "rice",      veg: true,  price: 299, rating: 4.6, stock: 19,
    description: "Layered basmati rice with seasonal vegetables & saffron.", image: img("1596797038530-2c107229654b") },

  // Desserts
  { id: "m11", name: "Gulab Jamun",         category: "desserts",  veg: true,  price: 129, rating: 4.8, stock: 40,
    description: "Warm milk dumplings soaked in rose-cardamom syrup.",     image: img("1601050690597-df0568f70950") },
  { id: "m12", name: "Kesar Rasmalai",      category: "desserts",  veg: true,  price: 159, rating: 4.7, stock: 8,
    description: "Soft cheese discs in saffron-pistachio milk.",           image: img("1605197161470-0e5c5b9a6c0f") },

  // Beverages
  { id: "m13", name: "Masala Chai",         category: "beverages", veg: true,  price: 59,  rating: 4.5, stock: 100,
    description: "Slow-brewed spiced Indian tea with milk.",               image: img("1571934811356-5cc061b6821f") },
];

/* ---------- Tables (12) ---------- */
const TABLES = Array.from({ length: 12 }, (_, i) => {
  const occupiedSeed = [2, 4, 5, 8, 9, 12]; // some pre-occupied
  const n = i + 1;
  return {
    id: n,
    seats: n % 3 === 0 ? 6 : 4,
    status: occupiedSeed.includes(n) ? "occupied" : "free",
  };
});

/* ---------- Staff ---------- */
const STAFF = [
  { id: "s1", name: "Aarav Mehta",   role: "Owner",    shift: "Full day", initials: "AM" },
  { id: "s2", name: "Priya Nair",    role: "Manager",  shift: "Morning",  initials: "PN" },
  { id: "s3", name: "Rohan Das",     role: "Chef",     shift: "Evening",  initials: "RD" },
  { id: "s4", name: "Sneha Kapoor",  role: "Waiter",   shift: "Morning",  initials: "SK" },
  { id: "s5", name: "Imran Sheikh",  role: "Waiter",   shift: "Evening",  initials: "IS" },
  { id: "s6", name: "Divya Rao",     role: "Cashier",  shift: "Full day", initials: "DR" },
];

/* ---------- Demo Orders ---------- */
const now = Date.now();
const min = 60 * 1000;
const DEMO_ORDERS = [
  { id: "FH-2041", table: 4,  status: "preparing", method: "UPI",  createdAt: now - 6 * min,
    customer: "Walk-in", phone: "+91 90000 11111",
    items: [ { id: "m4", name: "Butter Chicken", qty: 1, price: 429 }, { id: "m7", name: "Garlic Naan", qty: 3, price: 79 } ] },
  { id: "FH-2040", table: 9,  status: "ready", method: "Card", createdAt: now - 14 * min,
    customer: "Kabir", phone: "+91 90000 22222",
    items: [ { id: "m9", name: "Hyderabadi Biryani", qty: 2, price: 379 }, { id: "m13", name: "Masala Chai", qty: 2, price: 59 } ] },
  { id: "FH-2039", table: 2,  status: "pending", method: "Cash", createdAt: now - 2 * min,
    customer: "Ananya", phone: "+91 90000 33333",
    items: [ { id: "m1", name: "Paneer Tikka", qty: 1, price: 289 }, { id: "m5", name: "Dal Makhani", qty: 1, price: 279 } ] },
  { id: "FH-2038", table: 5,  status: "served", method: "UPI", createdAt: now - 38 * min,
    customer: "Vihaan", phone: "+91 90000 44444",
    items: [ { id: "m10", name: "Veg Dum Biryani", qty: 2, price: 299 }, { id: "m11", name: "Gulab Jamun", qty: 2, price: 129 } ] },
  { id: "FH-2037", table: 8,  status: "served", method: "Card", createdAt: now - 52 * min,
    customer: "Meera", phone: "+91 90000 55555",
    items: [ { id: "m6", name: "Paneer Butter Masala", qty: 1, price: 349 }, { id: "m7", name: "Garlic Naan", qty: 2, price: 79 } ] },
  { id: "FH-2036", table: 12, status: "served", method: "UPI", createdAt: now - 70 * min,
    customer: "Arjun", phone: "+91 90000 66666",
    items: [ { id: "m2", name: "Chicken 65", qty: 1, price: 329 }, { id: "m9", name: "Hyderabadi Biryani", qty: 1, price: 379 } ] },
];

/* ---------- Admin / staff accounts (demo credentials) ----------
   Client-side only — for a real deployment these would live behind a
   server. Each account is tied to a tenant and a role. */
const ACCOUNTS = [
  { email: "owner@foodhouse.com",   password: "admin123",   name: "Aarav Mehta", role: "Owner",   tenant: "food-house" },
  { email: "manager@foodhouse.com", password: "manager123", name: "Priya Nair",  role: "Manager", tenant: "food-house" },
  { email: "owner@spiceroute.com",  password: "admin123",   name: "S. Kurien",   role: "Owner",   tenant: "spice-route" },
];

/* ---------- Tenants (multi-restaurant) ---------- */
const TENANTS = {
  "food-house": {
    id: "food-house",
    name: "The Food House",
    tagline: "Modern Indian Kitchen",
    phone: "+919000000000",      // WhatsApp business number (digits only, with country code)
    address: "42 Residency Road, Bengaluru",
    currency: "₹",
    seed: { menu: MENU_ITEMS, tables: TABLES, staff: STAFF, orders: DEMO_ORDERS },
  },
  "spice-route": {
    id: "spice-route",
    name: "Spice Route",
    tagline: "Coastal Flavours",
    phone: "+919111111111",
    address: "7 Marine Drive, Kochi",
    currency: "₹",
    // A trimmed menu to prove tenants are independent.
    seed: {
      menu: MENU_ITEMS.filter((m) => ["m2", "m9", "m4", "m13", "m11", "m7"].includes(m.id)),
      tables: TABLES.map((t) => ({ ...t, status: "free" })),
      staff: STAFF.slice(0, 4),
      orders: [],
    },
  },
};

const DEFAULT_TENANT = "food-house";

/* Expose everything on a namespace for the browser (no modules/build step).
   Wrapped in an IIFE so none of these identifiers leak into global scope,
   avoiding "already declared" collisions with page-level inline scripts. */
window.FH_SEED = { CATEGORIES, MENU_ITEMS, TABLES, STAFF, DEMO_ORDERS, TENANTS, DEFAULT_TENANT, ACCOUNTS };
})();
