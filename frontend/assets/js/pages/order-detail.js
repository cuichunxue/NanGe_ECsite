import { initLayout } from '../layout.js';
import { NO_IMAGE_PLACEHOLDER } from '../placeholder.js';
import { requireAuth } from '../guards.js';
import { orderApi, reviewApi, getErrorMessage } from '../api.js';
import { carrierLabel, trackingUrlFor } from '../carrier.js';
import { isOnlinePayment } from '../payment.js';
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
            <img src="${escapeHtml(item.productImage || NO_IMAGE_PLACEHOLDER)}" class="h-16 w-16 rounded object-cover" />
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

  // 発送後に購入者が最も知りたい情報。控えが無い発送方法もあるため、あるときだけ出す。
  function renderTracking() {
    const box = document.getElementById('tracking-box');
    if (!order.trackingNumber) {
      box.classList.add('hidden');
      return;
    }
    document.getElementById('tracking-carrier').textContent = `配送業者: ${carrierLabel(order.carrier)}`;
    document.getElementById('tracking-number').textContent = `お問い合わせ番号: ${order.trackingNumber}`;
    const link = document.getElementById('tracking-link');
    const url = trackingUrlFor(order.carrier, order.trackingNumber);
    link.classList.toggle('hidden', !url);
    if (url) link.href = url;
    box.classList.remove('hidden');
  }

  function render() {
    document.getElementById('loading-msg').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');

    document.getElementById('order-no').textContent = `注文番号: ${order.orderNo}`;
    document.getElementById('order-created').textContent = formatDateTime(order.createdAt);
    const badge = document.getElementById('order-status-badge');
    // 注文番号が長いため、狭い画面でバッジが縦に折り返されないようにする
    badge.className = `shrink-0 whitespace-nowrap rounded px-3 py-1 text-sm ${orderStatusColor[order.status]}`;
    badge.textContent = orderStatusLabel[order.status];

    document.getElementById('address-recipient').textContent = `${order.addressSnapshot.recipient} (${order.addressSnapshot.phone})`;
    // 郵便番号は発送ラベルに必要なので、あれば先頭に出す
    const zip = order.addressSnapshot.postalCode ? `〒${order.addressSnapshot.postalCode} ` : '';
    document.getElementById(
      'address-detail',
    ).textContent = `${zip}${order.addressSnapshot.province}${order.addressSnapshot.city}${order.addressSnapshot.district}${order.addressSnapshot.detail}`;

    renderTracking();
    renderItems();

    document.getElementById('summary-subtotal').textContent = formatPrice(order.subtotal);
    document.getElementById('summary-shipping').textContent = formatPrice(order.shippingFee);
    document.getElementById('summary-total').textContent = formatPrice(order.totalAmount);

    const pendingActions = document.getElementById('pending-actions');
    const shippedActions = document.getElementById('shipped-actions');
    pendingActions.classList.add('hidden');
    pendingActions.classList.remove('flex');
    shippedActions.classList.add('hidden');
    // 領収書はお支払いが済んだ注文でのみ発行する
    const canIssueInvoice = ['PAID', 'SHIPPED', 'COMPLETED', 'REFUNDED'].includes(order.status);
    document.getElementById('invoice-link-wrap').classList.toggle('hidden', !canIssueInvoice);
    document.getElementById('invoice-link').href = `invoice.html?id=${encodeURIComponent(order.id)}`;

    const codNote = document.getElementById('cod-note');
    codNote.classList.add('hidden');
    if (order.status === 'PENDING_PAYMENT') {
      // 代金引換は事前の支払い手続きがないため、支払いボタンではなく案内を出す
      const payOnline = isOnlinePayment(order.paymentMethod);
      codNote.classList.toggle('hidden', payOnline);
      document.getElementById('pay-btn').classList.toggle('hidden', !payOnline);
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
    const btn = document.getElementById('pay-btn');
    btn.disabled = true;
    try {
      const res = await orderApi.createPaymentSession(order.id);
      location.href = res.data.paymentUrl;
    } catch (err) {
      showMessage(getErrorMessage(err, 'お支払い手続きを開始できませんでした'));
      btn.disabled = false;
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

  // 決済ページから戻った直後は、入金通知(Webhook)がまだ届いていないことがある。
  // 購入者が「払ったのに反映されない」と不安にならないよう案内を出しつつ、
  // 少し待って一度だけ再読み込みする。
  const params2 = new URLSearchParams(location.search);
  if (params2.get('payment_error')) {
    showMessage('お支払い手続きを開始できませんでした。「お支払いに進む」からやり直してください');
  } else if (params2.get('session_id')) {
    showMessage('お支払いの確認中です。反映まで少しお待ちください');
    setTimeout(reload, 3000);
  }

  if (id) reload();
}
