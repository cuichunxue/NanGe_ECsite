import { initLayout } from '../layout.js';
import { categoryApi, productApi } from '../api.js';
import { renderProductGrid } from '../components.js';
import { getRecentlyViewed } from '../recentlyViewed.js';
import { escapeHtml } from '../format.js';

initLayout({ base: '' });

categoryApi.list().then((res) => {
  const grid = document.getElementById('categories-grid');
  grid.innerHTML = res.data
    .map(
      (c) => `
      <a href="products.html?categoryId=${encodeURIComponent(c.id)}" class="card flex flex-col items-center gap-2 p-4 text-center hover:shadow-md">
        <span class="text-2xl">🛍️</span>
        <span class="text-sm text-gray-700">${escapeHtml(c.name)}</span>
      </a>
    `,
    )
    .join('');
});

productApi.list({ sort: 'newest', pageSize: 10 }).then((res) => {
  renderProductGrid(document.getElementById('newest-grid'), res.data);
});

productApi.list({ sort: 'sales', pageSize: 10 }).then((res) => {
  renderProductGrid(document.getElementById('popular-grid'), res.data);
});

const viewedIds = getRecentlyViewed();
if (viewedIds.length > 0) {
  productApi.byIds(viewedIds).then((res) => {
    if (res.data.length === 0) return;
    document.getElementById('recently-viewed-section').classList.remove('hidden');
    renderProductGrid(document.getElementById('recently-viewed-grid'), res.data);
  });
}
