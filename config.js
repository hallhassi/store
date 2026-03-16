// ─── config.js ───────────────────────────────────────────────────────────────
// Central configuration: Supabase client, product schema, and app constants.

export const db = supabase.createClient(
  'https://numeejvkeadsucxwsecn.supabase.co',
  'sb_publishable_oVLDp_xdbMLQ1rYjIJm-nQ_WRQfhfXC'
);

// ── Product Schema ────────────────────────────────────────────────────────────
// Drives both the admin form AND product card rendering.
// Each field: { key, label, type, placeholder?, options? }
export const PRODUCT_SCHEMA = [
  { key: 'title',     label: 'Title',          type: 'text',     placeholder: 'Product title' },
  { key: 'price',     label: 'Price ($)',       type: 'number',   placeholder: '0.00' },
  { key: 'stock',     label: 'Stock',           type: 'number',   placeholder: '0' },
  { key: 'weight',    label: 'Weight (grams)',  type: 'number',   placeholder: '0' },
  { key: 'is_public', label: 'Public?',         type: 'checkbox' },
  { key: 'image_urls',label: 'Images',          type: 'file',     accept: 'image/*', multiple: true },
];

// ── Shipping / Payment Config ─────────────────────────────────────────────────
export const REGIONS = [
  { value: 'usa',    label: 'USA' },
  { value: 'canada', label: 'Canada' },
  { value: 'row',    label: 'Rest of World' },
];

export const PAYMENT_METHODS = [
  { value: 'paypal', label: 'PayPal' },
  { value: 'zelle',  label: 'Zelle' },
  { value: 'card',   label: 'Credit Card' },
];

export const ZELLE_EMAIL = 'your@email.com';

export const CDN_BASE = '/.netlify/images';

export const getCdnUrl = (url, width = 300) =>
  `${CDN_BASE}?url=${encodeURIComponent(url)}&w=${width}&fit=contain`;
