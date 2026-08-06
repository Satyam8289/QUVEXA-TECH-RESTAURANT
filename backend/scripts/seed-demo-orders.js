/* One-off seed: fills the "quvexa-demo" tenant with realistic-looking
   sample orders/feedback so a prospective customer sees a lively dashboard
   instead of an empty one. Safe to re-run — it clears this tenant's own
   orders/order_items/feedback first, never touches any other tenant.

   Run on the VPS (where DATABASE_URL points at the real production DB):
     cd /var/www/QUVEXA-TECH-RESTAURANT/backend
     node scripts/seed-demo-orders.js
*/
import "dotenv/config";
import pg from "pg";
import crypto from "node:crypto";

const TENANT_SLUG = "quvexa-demo";
const { Pool } = pg;

const FIRST_NAMES = ["Aarav", "Vivaan", "Ishaan", "Aditi", "Priya", "Rohan", "Sanya", "Kabir", "Meera", "Arjun", "Neha", "Karan", "Diya", "Yash", "Simran"];
const LAST_NAMES = ["Sharma", "Verma", "Gupta", "Rao", "Nair", "Iyer", "Reddy", "Singh", "Kapoor", "Malhotra"];
const NOTES = ["", "", "", "Less spicy please", "Extra raita", "No onion", "Make it quick"];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  const tenant = (await pool.query("SELECT * FROM tenants WHERE slug=$1", [TENANT_SLUG])).rows[0];
  if (!tenant) { console.error(`Tenant "${TENANT_SLUG}" not found. Nothing seeded.`); await pool.end(); process.exit(1); }

  const session = (await pool.query("SELECT id FROM sessions WHERE tenant_id=$1 AND is_active=true LIMIT 1", [tenant.id])).rows[0];
  if (!session) { console.error("No active session for this tenant. Nothing seeded."); await pool.end(); process.exit(1); }

  const menu = (await pool.query("SELECT id, name, price FROM menu_items WHERE tenant_id=$1", [tenant.id])).rows;
  if (menu.length < 3) { console.error("Tenant has too few menu items to build realistic orders. Nothing seeded."); await pool.end(); process.exit(1); }

  const tables = (await pool.query("SELECT number FROM restaurant_tables WHERE tenant_id=$1 ORDER BY number", [tenant.id])).rows.map(r => r.number);
  if (!tables.length) { console.error("Tenant has no tables. Nothing seeded."); await pool.end(); process.exit(1); }

  // Clean slate for this tenant only — re-runnable without piling up duplicates.
  await pool.query("DELETE FROM feedback WHERE tenant_id=$1", [tenant.id]);
  await pool.query("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE tenant_id=$1)", [tenant.id]);
  await pool.query("DELETE FROM orders WHERE tenant_id=$1", [tenant.id]);
  await pool.query("UPDATE restaurant_tables SET status='free' WHERE tenant_id=$1", [tenant.id]);

  const GST_RATE = 0.05, SERVICE_RATE = 0.03;
  let code = 2041;
  const createdOrderIds = [];
  const ORDER_COUNT = 26;
  const now = Date.now();

  for (let i = 0; i < ORDER_COUNT; i++) {
    // Spread across the last 6 days, skewed toward more-recent (today looks busiest).
    const daysAgo = i < 6 ? 0 : randInt(0, 5);
    const hour = randInt(11, 22);
    const createdAt = new Date(now - daysAgo * 86400000);
    createdAt.setHours(hour, randInt(0, 59), 0, 0);

    const isTakeaway = Math.random() < 0.25;
    const itemCount = randInt(1, 4);
    const items = Array.from({ length: itemCount }, () => rand(menu));
    const qtyById = new Map();
    for (const it of items) qtyById.set(it.id, (qtyById.get(it.id) || 0) + randInt(1, 2));
    const lineItems = [...qtyById.entries()].map(([id, qty]) => ({ ...menu.find(m => m.id === id), qty }));

    const subtotal = lineItems.reduce((s, it) => s + Number(it.price) * it.qty, 0);
    const tax = Math.round(subtotal * GST_RATE);
    const serviceCharge = Math.round(subtotal * SERVICE_RATE);
    const total = subtotal + tax + serviceCharge;

    // Most historical orders are finished; the most recent handful (today)
    // are left mid-flow so Live Orders/Kitchen actually has something to show.
    const isRecent = daysAgo === 0 && i >= ORDER_COUNT - 4;
    const status = isRecent ? rand(["pending", "preparing", "preparing", "ready"]) : "served";
    const method = rand(["Cash", "Card/UPI", "Card/UPI"]);
    const paymentCollected = isTakeaway || method !== "Cash" || status === "served";

    const table = isTakeaway ? null : rand(tables);
    const vehicleNumber = isTakeaway ? `${rand(["DL","MH","KA","UP"])}${randInt(1,9)}${rand(["A","B","C"])}${randInt(1000,9999)}` : null;
    const customerName = `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`;
    const phone = `90000${String(10000 + i).slice(-5)}`; // obviously-fake, non-dialable block
    const publicToken = crypto.randomBytes(9).toString("hex");

    const order = (await pool.query(
      `INSERT INTO orders (tenant_id, session_id, code, table_number, customer_name, phone, method, status,
                           total, tax, service_charge, discount, payment_collected, order_type, vehicle_number,
                           public_token, created_at, collected_at, collected_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [tenant.id, session.id, `ORD-${code++}`, table, customerName, phone, method, status,
       total, tax, serviceCharge, paymentCollected, isTakeaway ? "takeaway" : "dine-in", vehicleNumber,
       publicToken, createdAt, paymentCollected ? createdAt : null, paymentCollected ? (method === "Cash" ? "Counter" : method) : null]
    )).rows[0];
    createdOrderIds.push({ id: order.id, code: `ORD-${code - 1}`, status, isRecent, table });

    for (const it of lineItems) {
      await pool.query(
        `INSERT INTO order_items (order_id, menu_item_id, name, price, qty, note) VALUES ($1,$2,$3,$4,$5,$6)`,
        [order.id, it.id, it.name, it.price, it.qty, rand(NOTES)]
      );
    }
  }

  // Leave a couple of tables genuinely "occupied" to match the still-open orders.
  for (const o of createdOrderIds) {
    if (o.isRecent && o.table && o.status !== "served") {
      await pool.query("UPDATE restaurant_tables SET status='occupied' WHERE tenant_id=$1 AND number=$2", [tenant.id, o.table]);
    }
  }

  // A handful of positive feedback entries on served orders, for realism.
  const served = createdOrderIds.filter(o => o.status === "served");
  const feedbackSample = served.sort(() => Math.random() - 0.5).slice(0, 6);
  const comments = ["Amazing food, quick service!", "Loved the ambience and taste.", "Best biryani in town.", "Great experience, will come again.", "Food was good, slightly delayed.", "Loved it, highly recommend."];
  for (const o of feedbackSample) {
    await pool.query(
      `INSERT INTO feedback (tenant_id, order_id, order_code, rating, comment, customer_name, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [tenant.id, o.id, o.code, randInt(4, 5), rand(comments), rand(FIRST_NAMES), `90000${randInt(10000,99999)}`]
    );
  }

  console.log(`Seeded ${createdOrderIds.length} orders and ${feedbackSample.length} feedback entries for "${TENANT_SLUG}".`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
