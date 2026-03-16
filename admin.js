// ─── admin.js ─────────────────────────────────────────────────────────────────
// Admin authentication and product management (create / edit / delete).
// Delegates API calls to api.js and form rendering to ui.js.

import { saveProduct as apiSave, deleteProduct as apiDelete, uploadImages } from './api.js';
import { populateForm, clearForm, readFormValues, setFormTitle } from './ui.js';

let _editingId  = null;   // null = creating new, string = editing existing
let _inventory  = [];     // reference set by app.js

export function setInventory(inventory) { _inventory = inventory; }

export function isAdmin() {
  return !!localStorage.getItem('admin_key');
}

// ── Form Visibility ───────────────────────────────────────────────────────────

export function showCreateForm() {
  _editingId = null;
  clearForm();
  setFormTitle('add product');
  document.getElementById('admin-form-container').classList.remove('hidden');
}

export function showEditForm(id) {
  const product = _inventory.find(p => p.id === id);
  if (!product) return;
  _editingId = id;
  populateForm(product);
  setFormTitle('edit product');
  document.getElementById('admin-form-container').classList.remove('hidden');
}

export function hideForm() {
  _editingId = null;
  document.getElementById('admin-form-container').classList.add('hidden');
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function handleSave(btn) {
  btn.disabled = true;
  btn.textContent = 'saving…';

  try {
    const values = readFormValues();
    const imageFiles = values.image_urls; // FileList
    delete values.image_urls;

    // Merge existing image URLs when editing
    let imageUrls = [];
    if (_editingId) {
      const current = _inventory.find(p => p.id === _editingId);
      imageUrls = current?.image_urls || [];
    }
    if (imageFiles?.length > 0) {
      const newUrls = await uploadImages(imageFiles);
      imageUrls = [...imageUrls, ...newUrls];
    }

    const productData = { ...values, image_urls: imageUrls };
    if (_editingId) productData.id = _editingId;

    await apiSave(localStorage.getItem('admin_key'), productData);
    alert('saved!');
    location.reload();
  } catch (err) {
    console.error(err);
    alert('Error: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'save product';
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function handleDelete(id) {
  if (!confirm('Delete this product?')) return;
  try {
    await apiDelete(localStorage.getItem('admin_key'), id);
    alert('Deleted');
    location.reload();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function logout() {
  localStorage.removeItem('admin_key');
  window.location.href = '/';
}
