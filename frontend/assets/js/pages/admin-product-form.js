import { initLayout, initAdminLayout } from '../layout.js';
import { requireAdmin } from '../guards.js';
import { adminApi, categoryApi, productApi, getErrorMessage } from '../api.js';
import { escapeHtml } from '../format.js';

if (requireAdmin('../')) {
  initLayout({ base: '../' });
  initAdminLayout('products.html');

  // 画面上の写真の並び。1枚目が一覧などで代表として使われる。
  let images = [];

  function renderImages() {
    const list = document.getElementById('image-list');
    document.getElementById('no-image-msg').classList.toggle('hidden', images.length > 0);
    list.innerHTML = images
      .map(
        (url, i) => `
        <div class="relative" data-image-index="${i}">
          <img src="${escapeHtml(url)}" alt="" class="h-24 w-24 rounded border object-cover" />
          ${i === 0 ? '<span class="absolute left-1 top-1 rounded bg-brand-500 px-1.5 py-0.5 text-[10px] text-white">代表</span>' : ''}
          <button type="button" data-action="remove-image" class="absolute -right-2 -top-2 h-6 w-6 rounded-full border bg-white text-sm text-red-600 shadow" aria-label="この写真を削除">×</button>
        </div>
      `,
      )
      .join('');
    list.querySelectorAll('[data-action="remove-image"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        images.splice(Number(btn.closest('[data-image-index]').dataset.imageIndex), 1);
        syncImageField();
        renderImages();
      });
    });
  }

  // URL直接入力の欄とも中身を合わせておき、どちらから編集しても保存内容が一致するようにする
  function syncImageField() {
    document.getElementById('images').value = images.join('\n');
  }

  document.getElementById('images').addEventListener('input', (e) => {
    images = e.target.value.split('\n').map((v) => v.trim()).filter(Boolean);
    renderImages();
  });

  document.getElementById('image-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const status = document.getElementById('upload-status');
    status.textContent = 'アップロード中…';
    status.className = 'ml-2 text-sm text-gray-500';
    try {
      const res = await adminApi.uploadImage(file);
      images.push(res.data.url);
      syncImageField();
      renderImages();
      status.textContent = '追加しました';
      status.className = 'ml-2 text-sm text-green-700';
    } catch (err) {
      status.textContent = getErrorMessage(err, 'アップロードに失敗しました');
      status.className = 'ml-2 text-sm text-red-600';
    } finally {
      e.target.value = ''; // 同じ写真をもう一度選べるようにする
    }
  });

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

  renderImages();

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
      document.getElementById('tax-rate').value = String(p.taxRate ?? 10);
      images = [...p.images];
      syncImageField();
      renderImages();
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
        taxRate: Number(document.getElementById('tax-rate').value),
        images,
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
