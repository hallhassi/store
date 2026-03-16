// ─── ui.js ────────────────────────────────────────────────────────────────────
// All DOM rendering. Schema-driven product cards. No inline event handlers —
// uses data-* attributes; event delegation is wired in app.js.

import { PRODUCT_SCHEMA, REGIONS, PAYMENT_METHODS, getCdnUrl } from './config.js';

// ── Product List ──────────────────────────────────────────────────────────────

export function renderProducts(inventory, cart, isAdmin) {
  const list = document.getElementById('product-list');

  list.innerHTML = inventory.map(product => {
    const inCart = cart[product.id];

    // Images
    const imagesHtml = (product.image_urls || [])
      .map(url => `<img src="${getCdnUrl(url, 300)}" loading="lazy" alt="${product.title}">`)
      .join('');

    // Admin controls — driven by product data, not hardcoded fields
    const adminTools = isAdmin ? `
      <div class="admin-tools">
        <button data-action="edit-product" data-id="${product.id}">edit</button>
        <button data-action="delete-product" data-id="${product.id}" class="danger">delete</button>
        <span>${product.is_public ? '✅ public' : '🔒 private'}</span>
        <span>Stock: ${product.stock}</span>
      </div>
    ` : '';

    // Buy controls (customers only)
    let buyControls = '';
    if (!isAdmin) {
      if (product.stock <= 0) {
        buyControls = `<button disabled class="out-of-stock">out of stock</button>`;
      } else if (inCart) {
        const qtyInput = product.stock > 1
          ? `<input type="number" value="${inCart.qty}" min="1" max="${product.stock}"
               data-action="update-qty" data-id="${product.id}" style="width:40px;">`
          : '';
        buyControls = `
          <button data-action="remove-item" data-id="${product.id}">remove</button>
          ${qtyInput}
        `;
      } else {
        buyControls = `<button data-action="add-to-cart" data-id="${product.id}">buy</button>`;
      }
    }

    return `
      <li class="product-card" data-product-id="${product.id}">
        <div class="product-images">${imagesHtml}</div>
        <strong>${product.title}</strong> — $${product.price}
        ${adminTools}
        <div class="buy-controls">${buyControls}</div>
      </li>
    `;
  }).join('');
}

// ── Cart Summary ──────────────────────────────────────────────────────────────

export function renderCartSummary(result) {
  const totalSection   = document.getElementById('total-section');
  const checkoutSection = document.getElementById('checkout-section');
  const paypalContainer = document.getElementById('paypal-button-container');
  const checkoutBtn    = document.querySelector('[data-action="checkout"]');
  const method = document.querySelector('input[name="method"]:checked')?.value;

  if (!result || result.breakdown.length === 0) {
    totalSection.classList.add('hidden');
    checkoutSection.classList.add('hidden');
    return;
  }

  document.getElementById('summary-list').innerHTML =
    result.breakdown.map(l => `<li>${l}</li>`).join('') +
    `<li><strong>$${result.total.toFixed(2)} total</strong></li>`;

  totalSection.classList.remove('hidden');
  checkoutSection.classList.remove('hidden');

  if (method === 'paypal') {
    checkoutBtn?.parentElement.classList.add('hidden');
    paypalContainer.classList.remove('hidden');
  } else {
    checkoutBtn?.parentElement.classList.remove('hidden');
    paypalContainer.classList.add('hidden');
    paypalContainer.innerHTML = '';
  }
}

// ── Cart Visibility ───────────────────────────────────────────────────────────

export function showCart() {
  document.getElementById('cart-wrapper').classList.remove('hidden');
}

export function hideCartSections() {
  document.getElementById('total-section').classList.add('hidden');
  document.getElementById('checkout-section').classList.add('hidden');
}

// ── Schema-Driven Admin Form ──────────────────────────────────────────────────
// Builds the form from PRODUCT_SCHEMA so adding a new field only
// requires updating the schema in config.js.

export function buildAdminForm() {
  const container = document.getElementById('admin-form-fields');
  if (!container) return;

  container.innerHTML = PRODUCT_SCHEMA.map(field => {
    switch (field.type) {
      case 'checkbox':
        return `
          <label class="form-row">
            <input type="checkbox" id="f-${field.key}" name="${field.key}" checked>
            ${field.label}
          </label>`;
      case 'file':
        return `
          <div class="form-row">
            <label for="f-${field.key}">${field.label}</label>
            <input type="file" id="f-${field.key}" name="${field.key}"
              ${field.accept ? `accept="${field.accept}"` : ''}
              ${field.multiple ? 'multiple' : ''}>
          </div>`;
      default:
        return `
          <div class="form-row">
            <label for="f-${field.key}">${field.label}</label>
            <input type="${field.type}" id="f-${field.key}" name="${field.key}"
              placeholder="${field.placeholder || ''}">
          </div>`;
    }
  }).join('');
}

// Read all schema-defined fields from the form into a plain object.
export function readFormValues() {
  const values = {};
  PRODUCT_SCHEMA.forEach(field => {
    const el = document.getElementById(`f-${field.key}`);
    if (!el) return;
    if (field.type === 'checkbox')  values[field.key] = el.checked;
    else if (field.type === 'file') values[field.key] = el.files;   // FileList
    else if (field.type === 'number') values[field.key] = parseFloat(el.value);
    else values[field.key] = el.value;
  });
  return values;
}

// Populate the form when editing an existing product.
export function populateForm(product) {
  PRODUCT_SCHEMA.forEach(field => {
    const el = document.getElementById(`f-${field.key}`);
    if (!el || field.type === 'file') return; // files can't be pre-filled
    if (field.type === 'checkbox') el.checked = !!product[field.key];
    else el.value = product[field.key] ?? '';
  });
}

export function clearForm() {
  PRODUCT_SCHEMA.forEach(field => {
    const el = document.getElementById(`f-${field.key}`);
    if (!el) return;
    if (field.type === 'checkbox') el.checked = true;
    else if (field.type === 'file') el.value = '';
    else el.value = '';
  });
}

export function setFormTitle(text) {
  const h3 = document.querySelector('#admin-form-container h3');
  if (h3) h3.textContent = text;
}

// ── Static HTML Shell (call once on init) ─────────────────────────────────────
// Generates the cart region/payment radios from config arrays so they're
// never hardcoded in the HTML.

export function buildCartOptions() {
  const regionList  = document.getElementById('region-list');
  const methodList  = document.getElementById('method-list');

  if (regionList) {
    regionList.innerHTML = REGIONS.map(r => `
      <li>
        <input type="radio" id="${r.value}" name="region" value="${r.value}"
          data-action="update-total">
        <label for="${r.value}">${r.label}</label>
      </li>
    `).join('');
  }

  if (methodList) {
    methodList.innerHTML = PAYMENT_METHODS.map(m => `
      <li>
        <input type="radio" id="pay_${m.value}" name="method" value="${m.value}"
          data-action="update-total">
        <label for="pay_${m.value}">${m.label}</label>
      </li>
    `).join('');
  }
}
