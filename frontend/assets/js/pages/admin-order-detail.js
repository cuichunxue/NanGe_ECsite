import { initLayout, initAdminLayout } from '../layout.js';
import { NO_IMAGE_PLACEHOLDER } from '../placeholder.js';
import { requireAdmin } from '../guards.js';
import { adminApi, getErrorMessage } from '../api.js';
import { CARRIERS, carrierLabel, trackingUrlFor } from '../carrier.js';
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

  const shipForm = document.getElementById('ship-form');
  const carrierSelect = document.getElementById('ship-carrier');
  const trackingInput = document.getElementById('ship-tracking');
  const actionsEl = document.getElementById('status-actions');
  const trackingInfo = document.getElementById('tracking-info');

  carrierSelect.innerHTML = CARRIERS.map((c) => `<option value="${c.key}">${escapeHtml(c.label)}</option>`).join('');

  // 発送済みにする前に、配送業者と追跡番号を控える画面を挟む。
  // 番号は購入者への発送メールに載る唯一の機会なので、後から思い出す手間を減らす。
  function openShipForm() {
    document.getElementById('error-msg').classList.add('hidden');
    shipForm.classList.remove('hidden');
    actionsEl.classList.add('hidden');
    actionsEl.classList.remove('flex');
    trackingInput.focus();
  }

  function closeShipForm() {
    shipForm.classList.add('hidden');
    render();
  }

  /** 発送済みの注文に控えがあれば、業者名・番号・追跡ページへのリンクを出す */
  function renderTracking() {
    if (!order.trackingNumber) {
      trackingInfo.classList.add('hidden');
      return;
    }
    const url = trackingUrlFor(order.carrier, order.trackingNumber);
    const link = url
      ? ` <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="text-brand-500 hover:underline">配送状況を見る</a>`
      : '';
    trackingInfo.innerHTML = `配送業者: ${escapeHtml(carrierLabel(order.carrier))}　お問い合わせ番号: ${escapeHtml(order.trackingNumber)}${link}`;
    trackingInfo.classList.remove('hidden');
  }

  function render() {
    document.getElementById('loading-msg').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');

    document.getElementById('order-no').textContent = `注文番号: ${order.orderNo}`;
    document.getElementById('order-created').textContent = formatDateTime(order.createdAt);
    document.getElementById('order-buyer').textContent = `購入者: ${order.user?.name ?? ''} (${order.user?.email ?? ''})`;
    const badge = document.getElementById('order-status-badge');
    badge.className = `shrink-0 whitespace-nowrap rounded px-3 py-1 text-sm ${orderStatusColor[order.status]}`;
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

    renderTracking();

    const next = nextStatuses(order);
    if (next.length > 0) {
      actionsEl.classList.remove('hidden');
      actionsEl.classList.add('flex');
      actionsEl.innerHTML = next.map((s) => `<button data-status="${s}" class="btn-primary">${orderStatusLabel[s]}にする</button>`).join('');
      actionsEl.querySelectorAll('[data-status]').forEach((btn) => {
        // 発送だけは、追跡番号を控えてから確定させる
        btn.addEventListener('click', () => (btn.dataset.status === 'SHIPPED' ? openShipForm() : handleChangeStatus(btn.dataset.status)));
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

  async function handleChangeStatus(status, shipment = {}) {
    const errorMsg = document.getElementById('error-msg');
    errorMsg.classList.add('hidden');
    try {
      await adminApi.setOrderStatus(order.id, status, shipment);
      shipForm.classList.add('hidden');
      reload();
    } catch (err) {
      errorMsg.textContent = getErrorMessage(err);
      errorMsg.classList.remove('hidden');
    }
  }

  const shipConfirmBtn = document.getElementById('ship-confirm-btn');
  shipConfirmBtn.addEventListener('click', async () => {
    const trackingNumber = trackingInput.value.trim();
    // 二度押しで「状態が変更されました」と出てしまわないよう、送信中は押せなくする
    shipConfirmBtn.disabled = true;
    // 追跡番号が無ければ業者も送らない（追跡できない発送方法をそのまま扱えるように）
    await handleChangeStatus('SHIPPED', trackingNumber ? { carrier: carrierSelect.value, trackingNumber } : {});
    shipConfirmBtn.disabled = false;
  });
  document.getElementById('ship-cancel-btn').addEventListener('click', closeShipForm);

  if (id) reload();
}
