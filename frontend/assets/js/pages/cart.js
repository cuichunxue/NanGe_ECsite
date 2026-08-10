import { initLayout } from '../layout.js';
import { NO_IMAGE_PLACEHOLDER } from '../placeholder.js';
import { requireAuth } from '../guards.js';
import { cartApi } from '../api.js';
import { formatPrice, escapeHtml } from '../format.js';
import { renderFreeShippingProgress } from '../components.js';

if (requireAuth('')) {
  initLayout({ base: '' });

  function renderCart(cart) {
    document.getElementById('loading-msg').classList.add('hidden');

    if (cart.items.length === 0) {
      document.getElementById('empty-cart').classList.remove('hidden');
      return;
    }
    document.getElementById('cart-view').classList.remove('hidden');
    renderFreeShippingProgress(document.getElementById('shipping-progress'), cart.totalAmount);

    const itemsEl = document.getElementById('cart-items');
    itemsEl.innerHTML = cart.items
      .map(
        (item) => `
        <div class="flex items-center gap-4 p-4" data-product-id="${item.productId}">
          <img src="${escapeHtml(item.product.images[0] || NO_IMAGE_PLACEHOLDER)}" class="h-20 w-20 rounded object-cover" />
          <div class="min-w-0 flex-1">
            <a href="product-detail.html?id=${encodeURIComponent(item.productId)}" class="line-clamp-2 text-sm font-medium hover:text-brand-500">${escapeHtml(item.product.name)}</a>
            ${
              item.unavailable
                ? '<p class="mt-1 text-xs font-medium text-red-500">この商品は販売終了しました。削除してください</p>'
                : item.stockWarning
                  ? `<p class="mt-1 text-xs text-red-500">在庫数を超えています（在庫: ${item.product.stock}）</p>`
                  : ''
            }
          </div>
          <div class="flex items-center rounded border">
            <button data-action="dec" class="px-2 py-1">−</button>
            <span class="w-8 text-center text-sm">${item.quantity}</span>
            <button data-action="inc" class="px-2 py-1">+</button>
          </div>
          <div class="w-24 text-right font-semibold text-brand-500">${formatPrice(item.subtotal)}</div>
          <button data-action="remove" class="text-sm text-gray-400 hover:text-red-500">削除</button>
        </div>
      `,
      )
      .join('');

    itemsEl.querySelectorAll('[data-product-id]').forEach((row) => {
      const productId = row.dataset.productId;
      const item = cart.items.find((i) => i.productId === productId);
      row.querySelector('[data-action="dec"]').addEventListener('click', () => updateQty(productId, item.quantity - 1));
      row.querySelector('[data-action="inc"]').addEventListener('click', () => updateQty(productId, item.quantity + 1));
      row.querySelector('[data-action="remove"]').addEventListener('click', () => removeItem(productId));
    });

    if (cart.hasUnavailableItems) {
      document.getElementById('unavailable-msg').classList.remove('hidden');
    }
    document.getElementById('total-qty').textContent = `合計 ${cart.totalQuantity} 点`;
    document.getElementById('total-amount').textContent = formatPrice(cart.totalAmount);
    document.getElementById('checkout-btn').disabled = cart.hasUnavailableItems;
  }

  function reload() {
    cartApi.get().then((res) => renderCart(res.data));
  }

  async function updateQty(productId, quantity) {
    if (quantity < 1) return;
    const res = await cartApi.updateItem(productId, quantity);
    renderCart(res.data);
  }

  async function removeItem(productId) {
    const res = await cartApi.removeItem(productId);
    renderCart(res.data);
  }

  document.getElementById('checkout-btn').addEventListener('click', () => {
    location.href = 'checkout.html';
  });

  reload();
}
