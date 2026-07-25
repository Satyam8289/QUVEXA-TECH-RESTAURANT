/* One-time seed: two restaurants with isolated data + per-staff logins. */
import { q, tx } from "./db.js";
import { hashPassword } from "./auth.js";

const img = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=600&q=70`;

const CATEGORIES = [
  ["starters", "Starters"], ["main", "Main Course"], ["breads", "Breads"],
  ["rice", "Rice & Biryani"], ["desserts", "Desserts"], ["beverages", "Beverages"],
];

const MENU = [
  ["Paneer Tikka", "starters", true, 289, 4.7, 24, "Chargrilled cottage cheese in spiced yogurt.", "1567188040759-fb8a883dc6d8"],
  ["Chicken 65", "starters", false, 329, 4.6, 18, "Crispy South-Indian fried chicken with curry leaves.", "1610057099431-d73a1c9d2f2f"],
  ["Crispy Corn Chaat", "starters", true, 219, 4.4, 30, "Golden sweet corn tossed with onion, chilli & lime.", "1625944525533-473f1a3d54e7"],
  ["Butter Chicken", "main", false, 429, 4.9, 20, "Tandoori chicken in a silky tomato-butter gravy.", "1603894584373-5ac82b2ae398"],
  ["Dal Makhani", "main", true, 279, 4.8, 26, "Slow-cooked black lentils finished with cream.", "1546833999-b9f581a1996d"],
  ["Paneer Butter Masala", "main", true, 349, 4.7, 22, "Cottage cheese in a rich cashew gravy.", "1631452180519-c014fe946bc7"],
  ["Garlic Naan", "breads", true, 79, 4.6, 60, "Tandoor-baked bread brushed with garlic butter.", "1601050690597-df0568f70950"],
  ["Laccha Paratha", "breads", true, 69, 4.5, 45, "Flaky multi-layered whole-wheat flatbread.", "1626777552726-4a6b54c97e46"],
  ["Hyderabadi Biryani", "rice", false, 379, 4.9, 16, "Fragrant dum-cooked basmati with spiced chicken.", "1563379091339-03b21ab4a4f8"],
  ["Veg Dum Biryani", "rice", true, 299, 4.6, 19, "Layered basmati with vegetables & saffron.", "1596797038530-2c107229654b"],
  ["Gulab Jamun", "desserts", true, 129, 4.8, 40, "Warm milk dumplings in rose-cardamom syrup.", "1601050690597-df0568f70950"],
  ["Kesar Rasmalai", "desserts", true, 159, 4.7, 8, "Soft cheese discs in saffron-pistachio milk.", "1605197161470-0e5c5b9a6c0f"],
  ["Masala Chai", "beverages", true, 59, 4.5, 100, "Slow-brewed spiced Indian tea with milk.", "1571934811356-5cc061b6821f"],
];

const TENANTS = [
  {
    slug: "food-house", name: "The Food House", tagline: "Modern Indian Kitchen",
    phone: "+919000000000", address: "42 Residency Road, Bengaluru",
    menu: MENU,
    occupied: [2, 4, 5, 8, 9, 12],
    users: [
      { name: "Aarav Mehta", username: "owner@foodhouse.com", password: "admin123", role: "owner", shift: "Full day" },
      { name: "Priya Nair", username: "manager@foodhouse.com", password: "manager123", role: "manager", shift: "Morning" },
      { name: "Rohan Das", username: "foodhouse.waiter", password: "waiter123", role: "waiter", shift: "Evening" },
    ],
  },
  {
    slug: "spice-route", name: "Spice Route", tagline: "Coastal Flavours",
    phone: "+919111111111", address: "7 Marine Drive, Kochi",
    menu: MENU.filter((m) => ["Chicken 65", "Butter Chicken", "Hyderabadi Biryani", "Garlic Naan", "Gulab Jamun", "Masala Chai"].includes(m[0])),
    occupied: [],
    users: [
      { name: "S. Kurien", username: "owner@spiceroute.com", password: "admin123", role: "owner", shift: "Full day" },
      { name: "Anu Thomas", username: "spice-route.waiter", password: "waiter123", role: "waiter", shift: "Morning" },
    ],
  },
];

export async function seedIfEmpty() {
  const { rows } = await q("SELECT count(*)::int AS c FROM tenants");
  if (rows[0].c > 0) { console.log("[seed] already seeded"); return; }
  console.log("[seed] seeding demo restaurants…");

  for (const t of TENANTS) {
    await tx(async (c) => {
      const tenant = (await c.query(
        `INSERT INTO tenants (slug, name, tagline, phone, address) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [t.slug, t.name, t.tagline, t.phone, t.address]
      )).rows[0];

      // categories
      const catId = {};
      for (let i = 0; i < CATEGORIES.length; i++) {
        const [slug, name] = CATEGORIES[i];
        const r = await c.query(
          `INSERT INTO categories (tenant_id, slug, name, sort) VALUES ($1,$2,$3,$4) RETURNING id`,
          [tenant.id, slug, name, i]
        );
        catId[slug] = r.rows[0].id;
      }

      // menu
      for (const [name, cat, veg, price, rating, stock, desc, imgId] of t.menu) {
        await c.query(
          `INSERT INTO menu_items (tenant_id, category_id, name, description, price, veg, rating, stock, image)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [tenant.id, catId[cat], name, desc, price, veg, rating, stock, img(imgId)]
        );
      }

      // tables (12)
      for (let n = 1; n <= 12; n++) {
        await c.query(
          `INSERT INTO restaurant_tables (tenant_id, number, seats, status) VALUES ($1,$2,$3,$4)`,
          [tenant.id, n, n % 3 === 0 ? 6 : 4, t.occupied.includes(n) ? "occupied" : "free"]
        );
      }

      // staff logins
      for (const u of t.users) {
        await c.query(
          `INSERT INTO users (tenant_id, name, username, password_hash, role, shift)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [tenant.id, u.name, u.username, await hashPassword(u.password), u.role, u.shift]
        );
      }
    });
  }
  console.log("[seed] done — 2 restaurants, isolated data, per-staff logins");
}
