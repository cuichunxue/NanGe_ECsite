import { initLayout } from '../layout.js';
import { requireAuth } from '../guards.js';
import { orderApi, reviewApi, getErrorMessage } from '../api.js';
import { formatDateTime, formatPrice, orderStatusColor, orderStatusLabel, escapeHtml } from '../format.js';

if (requireAuth('')) {
  initLayout({ base: '' });

  const params = new URLSearchParams(location.search);
  const id = params.get('id');

  let order = null;
  let reviewedProductIds = new Set();
  let reviewTarget = null;
  let reviewForm = { rating: 5, content: '' };

  function showMessage(text) {
    const el = document.getElementById('message');
    el.textContent = text;
    el.classList.toggle('hidden', !text);
  }

  function renderItems() {
    document.getElementById('order-items').innerHTML = order.items
      .map((item) => {
        let reviewHtml = '';
        if (order.status === 'COMPLETED') {
          if (reviewedProductIds.has(item.productId)) {
            reviewHtml = '<p class="mt-1 text-xs text-gray-400">レビュー投稿済み</p>';
          } else if (reviewTarget === item.productId) {
            reviewHtml = `
              <div class="mt-2 flex flex-col gap-2 rounded border p-2" data-review-form="${item.productId}">
                <select class="input" data-role="rating">
                  ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${reviewForm.rating === n ? 'selected' : ''}>評価: ${n}</option>`).join('')}
                </select>
                <textarea class="input" placeholder="レビューを入力" data-role="content">${escapeHtml(reviewForm.content)}</textarea>
                <div class="flex gap-2">
                  <button class="btn-primary" data-action="submit-review">投稿</button>
                  <button class="btn-secondary" data-action="cancel-review">キャンセル</button>
                </div>
              </div>
            `;
          } else {
            reviewHtml = `<button class="mt-1 text-xs text-brand-500 hover:underline" data-action="start-review" data-product-id="${item.productId}">レビューを書く</button>`;
          }
        }
        return `
          <div class="flex items-center gap-4 py-3">
            <img src="${escapeHtml(item.productImage ?? '')}" class="h-16 w-16 rounded object-cover" />
            <div class="min-w-0 flex-1">
              <a href="product-detail.html?id=${encodeURIComponent(item.productId)}" class="line-clamp-2 text-sm hover:text-brand-500">${escapeHtml(item.productName)}</a>
              <p class="text-xs text-gray-400">${formatPrice(item.price)} × ${item.quantity}</p>
              ${reviewHtml}
            </div>
          </div>
        `;
      })
      .join('');

    document.querySelectorAll('[data-action="start-review"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        reviewTarget = btn.dataset.productId;
        reviewForm = { rating: 5, content: '' };
        renderItems();
      });
    });
    document.querySelectorAll('[data-action="cancel-review"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        reviewTarget = null;
        renderItems();
      });
    });
    document.querySelectorAll('[data-review-form]').forEach((formEl) => {
      const productId = formEl.dataset.reviewForm;
      formEl.querySelector('[data-role="rating"]').addEventListener('change', (e) => {
        reviewForm.rating = Number(e.target.value);
      });
      formEl.querySelector('[data-role="content"]').addEventListener('input', (e) => {
        reviewForm.content = e.target.value;
      });
      formEl.querySelector('[data-action="submit-review"]').addEventListener('click', () => submitReview(productId));
    });
  }

  async function submitReview(productId) {
    try {
      await reviewApi.create({ productId, orderId: order.id, rating: reviewForm.rating, content: reviewForm.content });
      showMessage('レビューを投稿しました');
      reviewTarget = null;
      reviewForm = { rating: 5, content: '' };
      reviewedProductIds.add(productId);
      renderItems();
    } catch (err) {
      showMessage(getErrorMessage(err));
    }
  }

  function render() {
    document.getElementById('loading-msg').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');

    document.getElementById('order-no').textContent = `注文番号: ${order.orderNo}`;
    document.getElementById('order-created').textContent = formatDateTime(order.createdAt);
    const badge = document.getElementById('order-status-badge');
    badge.className = `rounded px-3 py-1 text-sm ${orderStatusColor[order.status]}`;
    badge.textContent = orderStatusLabel[order.status];

    document.getElementById('address-recipient').textContent = `${order.addressSnapshot.recipient} (${order.addressSnapshot.phone})`;
    document.getElementById(
      'address-detail',
    ).textContent = `${order.addressSnapshot.province}${order.addressSnapshot.city}${order.addressSnapshot.district}${order.addressSnapshot.detail}`;

    renderItems();

    document.getElementById('summary-subtotal').textContent = formatPrice(order.subtotal);
    document.getElementById('summary-discount').textContent = `-${formatPrice(order.discount)}`;
    document.getElementById('summary-shipping').textContent = formatPrice(order.shippingFee);
    document.getElementById('summary-total').textContent = formatPrice(order.totalAmount);

    const pendingActions = document.getElementById('pending-actions');
    const shippedActions = document.getElementById('shipped-actions');
    pendingActions.classList.add('hidden');
    pendingActions.classList.remove('flex');
    shippedActions.classList.add('hidden');
    if (order.status === 'PENDING_PAYMENT') {
      pendingActions.classList.remove('hidden');
      pendingActions.classList.add('flex');
    } else if (order.status === 'SHIPPED') {
      shippedActions.classList.remove('hidden');
    }
  }

  function reload() {
    orderApi.get(id).then((res) => {
      order = res.data;
      render();
    });
    reviewApi.mine().then((res) => {
      reviewedProductIds = new Set(res.data.filter((r) => r.orderId === id).map((r) => r.productId));
    });
  }

  document.getElementById('pay-btn').addEventListener('click', async () => {
    try {
      await orderApi.pay(order.id);
      showMessage('お支払いが完了しました');
      reload();
    } catch (err) {
      showMessage(getErrorMessage(err));
    }
  });

  document.getElementById('cancel-btn').addEventListener('click', async () => {
    if (!confirm('この注文をキャンセルしますか？')) return;
    try {
      await orderApi.cancel(order.id);
      reload();
    } catch (err) {
      showMessage(getErrorMessage(err));
    }
  });

  document.getElementById('confirm-receipt-btn').addEventListener('click', async () => {
    if (!confirm('商品を受け取りましたか？')) return;
    try {
      await orderApi.confirmReceipt(order.id);
      showMessage('受け取りを確認しました');
      reload();
    } catch (err) {
      showMessage(getErrorMessage(err));
    }
  });

  if (id) reload();
}
