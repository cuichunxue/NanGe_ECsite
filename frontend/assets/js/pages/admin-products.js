import { initLayout, initAdminLayout } from '../layout.js';
import { NO_IMAGE_PLACEHOLDER } from '../placeholder.js';
import { requireAdmin } from '../guards.js';
import { productApi } from '../api.js';
import { formatPrice, escapeHtml } from '../format.js';
import { renderPagination } from '../components.js';

if (requireAdmin('../')) {
  initLayout({ base: '../' });
  initAdminLayout('products.html');

  let page = 1;
  let keyword = '';

  function load() {
    productApi.list({ page, pageSize: 20, keyword: keyword || undefined, status: undefined }).then((res) => {
      document.getElementById('product-rows').innerHTML = res.data
        .map(
          (p) => `
          <tr class="border-t" data-product-id="${p.id}">
            <td class="flex items-center gap-2 p-3">
              <img src="${escapeHtml(p.images[0] || NO_IMAGE_PLACEHOLDER)}" class="h-10 w-10 rounded object-cover" />
              <span class="line-clamp-1">${escapeHtml(p.name)}</span>
            </td>
            <td class="p-3 text-gray-500">${escapeHtml(p.sku)}</td>
            <td class="p-3">${formatPrice(p.price)}</td>
            <td class="p-3 ${p.stock <= 10 ? 'text-red-500' : ''}">${p.stock}</td>
            <td class="p-3">
              <span class="rounded px-2 py-0.5 text-xs ${p.status === 'ON_SALE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${p.status === 'ON_SALE' ? '公開中' : '非公開'}</span>
            </td>
            <td class="space-x-2 p-3">
              <a href="product-form.html?id=${encodeURIComponent(p.id)}" class="text-brand-500 hover:underline">編集</a>
              <button data-action="toggle" class="text-gray-500 hover:underline">${p.status === 'ON_SALE' ? '非公開' : '公開'}</button>
            </td>
          </tr>
        `,
        )
        .join('');

      document.querySelectorAll('[data-product-id]').forEach((row) => {
        const p = res.data.find((item) => item.id === row.dataset.productId);
        row.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
          if (p.status === 'ON_SALE') {
            await productApi.remove(p.id);
          } else {
            await productApi.update(p.id, { status: 'ON_SALE' });
          }
          load();
        });
      });

      renderPagination(document.getElementById('pagination'), res.pagination.page, res.pagination.totalPages, (p) => {
        page = p;
        load();
      });
    });
  }

  document.getElementById('search-btn').addEventListener('click', () => {
    keyword = document.getElementById('keyword').value;
    page = 1;
    load();
  });

  load();
}
