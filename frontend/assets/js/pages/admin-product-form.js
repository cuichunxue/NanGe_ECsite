import { initLayout, initAdminLayout } from '../layout.js';
import { requireAdmin } from '../guards.js';
import { categoryApi, productApi, getErrorMessage } from '../api.js';

if (requireAdmin('../')) {
  initLayout({ base: '../' });
  initAdminLayout('products.html');

  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const isEdit = Boolean(id);

  if (isEdit) {
    document.getElementById('page-title').textContent = '商品編集';
    document.getElementById('submit-btn').textContent = '保存する';
  }

  categoryApi.list().then((res) => {
    const select = document.getElementById('category-id');
    res.data.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      select.appendChild(opt);
    });
  });

  if (id) {
    productApi.get(id).then((res) => {
      const p = res.data;
      document.getElementById('name').value = p.name;
      document.getElementById('description').value = p.description;
      document.getElementById('sku').value = p.sku;
      document.getElementById('brand').value = p.brand ?? '';
      document.getElementById('category-id').value = p.categoryId;
      document.getElementById('price').value = p.price;
      document.getElementById('original-price').value = p.originalPrice ?? '';
      document.getElementById('stock').value = String(p.stock);
      document.getElementById('images').value = p.images.join('\n');
    });
  }

  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorMsg = document.getElementById('error-msg');
    errorMsg.classList.add('hidden');
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '保存中…';
    try {
      const originalPrice = document.getElementById('original-price').value;
      const payload = {
        name: document.getElementById('name').value,
        description: document.getElementById('description').value,
        sku: document.getElementById('sku').value,
        brand: document.getElementById('brand').value || undefined,
        categoryId: document.getElementById('category-id').value,
        price: Number(document.getElementById('price').value),
        originalPrice: originalPrice ? Number(originalPrice) : undefined,
        stock: Number(document.getElementById('stock').value),
        images: document
          .getElementById('images')
          .value.split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (isEdit) {
        await productApi.update(id, payload);
      } else {
        await productApi.create(payload);
      }
      location.href = 'products.html';
    } catch (err) {
      errorMsg.textContent = getErrorMessage(err, '保存に失敗しました');
      errorMsg.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = '保存する';
    }
  });
}
