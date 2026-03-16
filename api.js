// ─── api.js ───────────────────────────────────────────────────────────────────
// All network calls: Supabase reads, Netlify function calls, storage uploads.

import { db } from './config.js';

// ── Products ──────────────────────────────────────────────────────────────────

export async function fetchProducts(adminKey) {
  let query = db.from('products').select('*').order('created_at', { ascending: false });
  if (!adminKey) query = query.eq('is_public', true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchShippingRates() {
  const { data, error } = await db.from('shipping_rates').select('*');
  if (error) throw error;
  return data || [];
}

// ── Admin: Save / Delete ──────────────────────────────────────────────────────

export async function saveProduct(adminKey, productData) {
  const res = await fetch('/.netlify/functions/manage-products', {
    method: 'POST',
    body: JSON.stringify({ key: adminKey, data: productData }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteProduct(adminKey, id) {
  const res = await fetch('/.netlify/functions/manage-products', {
    method: 'DELETE',
    body: JSON.stringify({ key: adminKey, data: { id } }),
  });
  if (!res.ok) throw new Error(await res.text());
}

// ── Image Upload ──────────────────────────────────────────────────────────────

export async function uploadImages(files) {
  const urls = [];
  for (const file of files) {
    const ext = file.name.split('.').pop();
    const filePath = `covers/${Math.random()}-${Date.now()}.${ext}`;
    const { error } = await db.storage.from('product-media').upload(filePath, file);
    if (error) throw error;
    const { data: { publicUrl } } = db.storage.from('product-media').getPublicUrl(filePath);
    urls.push(publicUrl);
  }
  return urls;
}

// ── Checkout ──────────────────────────────────────────────────────────────────

export async function createCheckoutSession(cart, region, method) {
  const res = await fetch('/.netlify/functions/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cart, region, method }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function handlePayPalPurchase(order, cart) {
  await fetch('/.netlify/functions/handle-purchase', {
    method: 'POST',
    body: JSON.stringify({ source: 'paypal', details: order, cart }),
  });
}
