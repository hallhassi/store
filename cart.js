// ─── cart.js ──────────────────────────────────────────────────────────────────
// Cart state management and shipping/fee calculation.
// No DOM access — returns pure data that ui.js renders.

// ── State ─────────────────────────────────────────────────────────────────────

let _cart = {};         // { [productId]: { qty: number } }
let _rates = [];        // shipping_rates rows from Supabase
let _inventory = [];    // products array (reference, not owned here)

export function setRates(rates)         { _rates = rates; }
export function setInventory(inventory) { _inventory = inventory; }
export function getCart()               { return _cart; }

// ── Mutations ─────────────────────────────────────────────────────────────────

export function addItem(id) {
  _cart[id] = { qty: 1 };
}

export function updateQty(id, qty) {
  const q = parseInt(qty, 10);
  if (q > 0) _cart[id] = { qty: q };
  else delete _cart[id];
}

export function removeItem(id) {
  delete _cart[id];
}

export function clearCart() {
  _cart = {};
}

export function hasItems() {
  return Object.keys(_cart).length > 0;
}

// ── Calculation ───────────────────────────────────────────────────────────────

export function calculate(region, method) {
  if (!hasItems()) return { total: 0, breakdown: [] };
  if (!region || !method || !_rates.length) return null;

  let subtotal = 0;
  let totalGrams = 0;
  const breakdown = [];

  Object.entries(_cart).forEach(([id, { qty }]) => {
    const product = _inventory.find(p => p.id === id);
    if (!product) return;
    const itemTotal = product.price * qty;
    subtotal += itemTotal;
    totalGrams += product.weight * qty;
    const qtyPrefix = qty > 1 ? `${qty}x ` : '';
    breakdown.push(`$${itemTotal.toFixed(2)} ${qtyPrefix}${product.title}`);
  });

  // Weight in lbs with 20% handling buffer
  const weightLbs = (totalGrams / 453.592) * 1.2;
  const searchRegion = region.toLowerCase();
  let shipping = 0;

  if (searchRegion === 'usa') {
    const base  = _rates.find(r => r.region.toLowerCase() === 'usa' && r.is_base_rate);
    const extra = _rates.find(r => r.region.toLowerCase() === 'usa' && !r.is_base_rate);
    if (base && extra) {
      shipping = parseFloat(base.price) +
        Math.max(0, Math.ceil(weightLbs) - 1) * parseFloat(extra.price);
    }
  } else {
    const tiers = _rates
      .filter(r => r.region.toLowerCase() === searchRegion)
      .sort((a, b) => a.weight_limit_lbs - b.weight_limit_lbs);
    let rem = weightLbs;
    while (rem > 0 && tiers.length) {
      const tier = tiers.find(r => Math.min(rem, 4) <= r.weight_limit_lbs) || tiers[tiers.length - 1];
      shipping += parseFloat(tier.price);
      rem -= 4;
    }
  }

  breakdown.push(`$${shipping.toFixed(2)} shipping`);

  let total = subtotal + shipping;
  if (method === 'card')   total = (total + 0.30) / (1 - 0.029);
  if (method === 'paypal') total = (total + 0.49) / (1 - 0.044);

  const fee = total - (subtotal + shipping);
  if (fee > 0.005) breakdown.push(`$${fee.toFixed(2)} processing fee`);

  return { total, breakdown };
}
