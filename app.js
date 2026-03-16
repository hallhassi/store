// ─── app.js ───────────────────────────────────────────────────────────────────
// Entry point. Wires up event delegation and orchestrates all modules.
// Every user interaction flows through ONE delegated listener per root element.

import { fetchProducts, fetchShippingRates, createCheckoutSession, handlePayPalPurchase } from './api.js';
import { renderProducts, renderCartSummary, showCart, buildAdminForm, buildCartOptions } from './ui.js';
import * as Cart    from './cart.js';
import * as Admin   from './admin.js';
import { ZELLE_EMAIL } from './config.js';

// ── State ─────────────────────────────────────────────────────────────────────

let inventory = [];

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  // Build schema-driven form fields and radio buttons once
  buildAdminForm();
  buildCartOptions();

  // Post-purchase redirect cleanup
  const params = new URLSearchParams(window.location.search);
  if (params.get('session') === 'success') {
    Cart.clearCart();
    alert('Order received. A confirmation has been sent to your email.');
    window.history.replaceState({}, document.title, '/');
  }

  const adminKey = localStorage.getItem('admin_key');
  if (adminKey) {
    document.getElementById('admin-panel').classList.remove('hidden');
  }

  try {
    const [products, rates] = await Promise.all([
      fetchProducts(adminKey),
      fetchShippingRates(),
    ]);
    inventory = products;
    Cart.setInventory(inventory);
    Cart.setRates(rates);
    Admin.setInventory(inventory);
    render();
  } catch (err) {
    console.error('Init failed', err);
  }
}

// ── Render helpers ────────────────────────────────────────────────────────────

function render() {
  renderProducts(inventory, Cart.getCart(), Admin.isAdmin());
}

function updateTotal() {
  const region = document.querySelector('input[name="region"]:checked')?.value;
  const method = document.querySelector('input[name="method"]:checked')?.value;
  const result = Cart.calculate(region, method);
  renderCartSummary(result);

  if (method === 'paypal' && result?.total > 0) {
    renderPayPal(region, result.total);
  }
}

// ── Event Delegation ──────────────────────────────────────────────────────────
// All clicks/changes flow through document. Each handler checks data-action.

document.addEventListener('click', async (e) => {
  const el     = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id     = el.dataset.id;

  switch (action) {
    // ── Product list actions ──────────────────────────────────────────────────
    case 'add-to-cart':
      Cart.addItem(id);
      showCart();
      render();
      updateTotal();
      break;

    case 'remove-item':
      Cart.removeItem(id);
      render();
      updateTotal();
      break;

    // ── Admin product actions ─────────────────────────────────────────────────
    case 'edit-product':
      Admin.showEditForm(id);
      break;

    case 'delete-product':
      await Admin.handleDelete(id);
      break;

    // ── Admin form actions ────────────────────────────────────────────────────
    case 'show-create-form':
      Admin.showCreateForm();
      break;

    case 'save-product':
      await Admin.handleSave(el);
      break;

    case 'cancel-form':
      Admin.hideForm();
      break;

    // ── Auth ──────────────────────────────────────────────────────────────────
    case 'logout':
      Admin.logout();
      break;

    // ── Checkout ──────────────────────────────────────────────────────────────
    case 'checkout':
      await handleCheckout(el);
      break;
  }
});

// qty input change — also delegated
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action="update-qty"]');
  if (el) {
    Cart.updateQty(el.dataset.id, el.value);
    render();
    updateTotal();
  }

  // Region / method radio changes
  const radio = e.target.closest('[data-action="update-total"]');
  if (radio) updateTotal();
});

// ── Checkout Logic ────────────────────────────────────────────────────────────

async function handleCheckout(btn) {
  const region = document.querySelector('input[name="region"]:checked')?.value;
  const method = document.querySelector('input[name="method"]:checked')?.value;

  if (!region || !method) {
    alert('Please select a region and payment method.');
    return;
  }

  if (method === 'zelle') {
    const result = Cart.calculate(region, method);
    alert(`Please Zelle $${result.total.toFixed(2)} to ${ZELLE_EMAIL}`);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'redirecting…';

  try {
    const data = await createCheckoutSession(Cart.getCart(), region, method);
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (err) {
    alert('Checkout failed: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'checkout';
  }
}

// ── PayPal ────────────────────────────────────────────────────────────────────

function renderPayPal(region) {
  const container = document.getElementById('paypal-button-container');
  container.innerHTML = '';
  paypal.Buttons({
    createOrder: async (_data, actions) => {
      const result = await createCheckoutSession(Cart.getCart(), region, 'paypal');
      return actions.order.create({
        purchase_units: [{ amount: { value: result.total.toString() } }],
      });
    },
    onApprove: async (_data, actions) => {
      const order = await actions.order.capture();
      await handlePayPalPurchase(order, Cart.getCart());
      window.location.href = '/?session=success';
    },
  }).render('#paypal-button-container');
}

// ── Start ─────────────────────────────────────────────────────────────────────

init();
