import { initLayout } from '../layout.js';
import { requireAuth } from '../guards.js';
import { wishlistApi } from '../api.js';
import { productCardHtml } from '../components.js';

if (requireAuth('')) {
  initLayout({ base: '' });

  function render(items) {
    const emptyMsg = document.getElementById('empty-msg');
    const grid = document.getElementById('wishlist-grid');
    if (items.length === 0) {
      emptyMsg.classList.remove('hidden');
      grid.innerHTML = '';
      return;
    }
    emptyMsg.classList.add('hidden');
    grid.innerHTML = items
      .map(
        (item) => `
        <div class="relative" data-product-id="${item.productId}">
          ${productCardHtml(item.product)}
          <button data-action="remove" class="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-xs text-red-500 shadow">削除</button>
        </div>
      `,
      )
      .join('');
    grid.querySelectorAll('[data-product-id]').forEach((el) => {
      el.querySelector('[data-action="remove"]').addEventListener('click', async () => {
        await wishlistApi.remove(el.dataset.productId);
        items = items.filter((i) => i.productId !== el.dataset.productId);
        render(items);
      });
    });
  }

  wishlistApi.list().then((res) => render(res.data));
}
