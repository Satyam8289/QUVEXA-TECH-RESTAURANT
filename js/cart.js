/* ============================================================
   The Food House — Cart (localStorage: "foodhouse-cart")
   Cart is namespaced per tenant so switching restaurants keeps
   baskets separate.
   ============================================================ */

const Cart = (() => {
  const keyFor = () => `foodhouse-cart:${Api.tenantSlug()}`;

  function all() {
    try { return JSON.parse(localStorage.getItem(keyFor())) || []; }
    catch (e) { return []; }
  }
  function save(items) {
    localStorage.setItem(keyFor(), JSON.stringify(items));
    document.dispatchEvent(new CustomEvent("cart:change"));
    return items;
  }

  function add(itemId, qty = 1, note = "") {
    const item = Api.getMenuPublic().find((m) => m.id === itemId);
    if (!item) return;
    const items = all();
    const line = items.find((l) => l.id === itemId);
    if (line) { line.qty += qty; if (note) line.note = note; }
    else items.push({ id: item.id, name: item.name, price: item.price, veg: item.veg, image: item.image, qty, note });
    save(items);
  }

  function setQty(itemId, qty) {
    let items = all();
    const line = items.find((l) => l.id === itemId);
    if (!line) return;
    line.qty = qty;
    if (line.qty <= 0) items = items.filter((l) => l.id !== itemId);
    save(items);
  }

  function setNote(itemId, note) {
    const items = all();
    const line = items.find((l) => l.id === itemId);
    if (line) { line.note = note; save(items); }
  }

  const remove = (itemId) => save(all().filter((l) => l.id !== itemId));
  const clear  = () => save([]);
  const count  = () => all().reduce((s, l) => s + l.qty, 0);
  const qtyOf  = (itemId) => (all().find((l) => l.id === itemId)?.qty || 0);
  const subtotal = () => all().reduce((s, l) => s + l.price * l.qty, 0);

  return { all, add, setQty, setNote, remove, clear, count, qtyOf, subtotal };
})();

window.Cart = Cart;
