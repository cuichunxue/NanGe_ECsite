import { initLayout, initAdminLayout } from '../layout.js';
import { NO_IMAGE_PLACEHOLDER } from '../placeholder.js';
import { requireAdmin } from '../guards.js';
import { adminApi, getErrorMessage } from '../api.js';
import { formatDateTime, formatPrice, orderStatusColor, orderStatusLabel, escapeHtml } from '../format.js';

if (requireAdmin('../')) {
  initLayout({ base: '../' });
  initAdminLayout('orders.html');

  const PAYMENT_LABEL = { CREDIT_CARD: 'クレジットカード', PAYPAY: 'PayPay', COD: '代金引換' };

  // 代金引換は商品と引き換えに支払われるため、入金前でも発送できる。
  // オンライン決済は入金が確認できるまで発送させない。
  function nextStatuses(o) {
    if (o.status === 'PENDING_PAYMENT') {
      return o.paymentMethod === 'COD' ? ['SHIPPED', 'CANCELLED'] : ['CANCELLED'];
    }
    return { PAID: ['SHIPPED', 'REFUNDED'], SHIPPED: ['COMPLETED', 'REFUNDED'], COMPLETED: [], CANCELLED: [], REFUNDED: [] }[o.status] ?? [];
  }

  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  let order = null;

  function render() {
    document.getElementById('loading-msg').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');

    document.getElementById('order-no').textContent = `注文番号: ${order.orderNo}`;
    document.getElementById('order-created').textContent = formatDateTime(order.createdAt);
    document.getElementById('order-buyer').textContent = `購入者: ${order.user?.name ?? ''} (${order.user?.email ?? ''})`;
    const badge = document.getElementById('order-status-badge');
    badge.className = `rounded px-3 py-1 text-sm ${orderStatusColor[order.status]}`;
    badge.textContent = orderStatusLabel[order.status];

    document.getElementById('address-recipient').textContent = `${order.addressSnapshot.recipient} (${order.addressSnapshot.phone})`;
    document.getElementById(
      'address-detail',
    ).textContent = `${order.addressSnapshot.province}${order.addressSnapshot.city}${order.addressSnapshot.district}${order.addressSnapshot.detail}`;

    document.getElementById('order-items').innerHTML = order.items
      .map(
        (item) => `
        <div class="flex items-center gap-4 py-3">
          <img src="${escapeHtml(item.productImage || NO_IMAGE_PLACEHOLDER)}" class="h-16 w-16 rounded object-cover" />
          <div class="flex-1">
            <p class="text-sm">${escapeHtml(item.productName)}</p>
            <p class="text-xs text-gray-400">${formatPrice(item.price)} × ${item.quantity}</p>
          </div>
        </div>
      `,
      )
      .join('');

    document.getElementById('order-total').textContent = formatPrice(order.totalAmount);
    const payEl = document.getElementById('order-payment');
    const label = PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod ?? '—';
    payEl.textContent = order.paymentMethod === 'COD' ? `お支払い方法: ${label}（配達時に集金してください）` : `お支払い方法: ${label}`;
    payEl.className = order.paymentMethod === 'COD' ? 'text-sm font-medium text-amber-700' : 'text-sm text-gray-500';

    const actionsEl = document.getElementById('status-actions');
    const next = nextStatuses(order);
    if (next.length > 0) {
      actionsEl.classList.remove('hidden');
      actionsEl.classList.add('flex');
      actionsEl.innerHTML = next.map((s) => `<button data-status="${s}" class="btn-primary">${orderStatusLabel[s]}にする</button>`).join('');
      actionsEl.querySelectorAll('[data-status]').forEach((btn) => {
        btn.addEventListener('click', () => handleChangeStatus(btn.dataset.status));
      });
    } else {
      actionsEl.classList.add('hidden');
      actionsEl.classList.remove('flex');
    }
  }

  function reload() {
    adminApi.order(id).then((res) => {
      order = res.data;
      render();
    });
  }

  async function handleChangeStatus(status) {
    const errorMsg = document.getElementById('error-msg');
    errorMsg.classList.add('hidden');
    try {
      await adminApi.setOrderStatus(order.id, status);
      reload();
    } catch (err) {
      errorMsg.textContent = getErrorMessage(err);
      errorMsg.classList.remove('hidden');
    }
  }

  if (id) reload();
}
