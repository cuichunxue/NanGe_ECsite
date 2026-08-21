import { initLayout } from '../layout.js';
import { requireAuth } from '../guards.js';
import { addressApi, cartApi, orderApi, getErrorMessage } from '../api.js';
import { formatPrice, escapeHtml } from '../format.js';
import { calculateShippingFee, resolveShippingRegion, SHIPPING_REGIONS, PREFECTURES } from '../shipping.js';
import { PAYMENT_METHODS, isOnlinePayment } from '../payment.js';
import { renderFreeShippingProgress } from '../components.js';
import { notify } from '../notify.js';

if (requireAuth('')) {
  initLayout({ base: '' });

  // 支払い方法の選択肢を組み立てる。バックエンドが受け付ける方法と一致させるため、
  // 画面に直接書かず payment.js の一覧から作る。
  document.getElementById('payment-options').innerHTML = PAYMENT_METHODS.map(
    (m, i) => `
      <label class="flex items-start gap-2">
        <input type="radio" name="payment" value="${escapeHtml(m.key)}" class="mt-1" ${i === 0 ? 'checked' : ''} />
        <span>
          ${escapeHtml(m.label)}
          ${m.note ? `<span class="block text-xs text-gray-500">${escapeHtml(m.note)}</span>` : ''}
        </span>
      </label>
    `,
  ).join('');

  // 都道府県は送料に直結するため選択式にする。自由入力だと「おきなわ」等の
  // 表記ゆれが本州扱いになり、店主が送料を負担することになる。
  document.getElementById('addr-province').innerHTML =
    '<option value="">都道府県を選ぶ</option>' + PREFECTURES.map((p) => `<option value="${p}">${p}</option>`).join('');

  let cart = null;
  let addresses = [];
  let selectedAddress = '';
  let submitting = false;

  function loadAddresses() {
    return addressApi.list().then((res) => {
      addresses = res.data;
      const def = addresses.find((a) => a.isDefault) ?? addresses[0];
      if (def) selectedAddress = def.id;
      renderAddresses();
    });
  }

  function renderAddresses() {
    document.getElementById('address-list').innerHTML = addresses
      .map(
        (a) => `
        <label class="flex cursor-pointer items-start gap-2 rounded border p-3 ${selectedAddress === a.id ? 'border-brand-500 bg-brand-50' : ''}" data-address-id="${a.id}">
          <input type="radio" name="address" ${selectedAddress === a.id ? 'checked' : ''} class="mt-1" />
          <span class="text-sm">${escapeHtml(a.recipient)} (${escapeHtml(a.phone)})<br />${escapeHtml(a.province)}${escapeHtml(a.city)}${escapeHtml(a.district)}${escapeHtml(a.detail)}</span>
        </label>
      `,
      )
      .join('');
    document.querySelectorAll('[data-address-id]').forEach((label) => {
      label.addEventListener('click', () => {
        selectedAddress = label.dataset.addressId;
        renderAddresses();
        renderSummary(); // 届け先で送料が変わるため合計も引き直す
      });
    });
  }

  document.getElementById('show-address-form-btn').addEventListener('click', () => {
    document.getElementById('address-form').classList.remove('hidden');
    document.getElementById('address-form').classList.add('grid');
    document.getElementById('show-address-form-btn').classList.add('hidden');
  });
  document.getElementById('cancel-address-btn').addEventListener('click', () => {
    document.getElementById('address-form').classList.add('hidden');
    document.getElementById('address-form').classList.remove('grid');
    document.getElementById('show-address-form-btn').classList.remove('hidden');
  });
  document.getElementById('save-address-btn').addEventListener('click', async () => {
    const payload = {
      recipient: document.getElementById('addr-recipient').value,
      phone: document.getElementById('addr-phone').value,
      province: document.getElementById('addr-province').value,
      city: document.getElementById('addr-city').value,
      district: document.getElementById('addr-district').value,
      detail: document.getElementById('addr-detail').value,
      postalCode: document.getElementById('addr-postal-code').value,
    };
    // 保存できなかったことを伝えないと、購入者はレジで「押しても何も起きない」状態になる
    let res;
    try {
      res = await addressApi.create(payload);
    } catch (err) {
      notify(getErrorMessage(err, '住所を保存できませんでした'));
      return;
    }
    document.getElementById('address-form').classList.add('hidden');
    document.getElementById('address-form').classList.remove('grid');
    document.getElementById('show-address-form-btn').classList.remove('hidden');
    ['addr-recipient', 'addr-phone', 'addr-postal-code', 'addr-province', 'addr-city', 'addr-district', 'addr-detail'].forEach((id) => {
      document.getElementById(id).value = '';
    });
    await loadAddresses();
    selectedAddress = res.data.id;
    renderAddresses();
  });

  function renderSummary() {
    const subtotal = cart?.totalAmount ?? 0;
    const province = addresses.find((a) => a.id === selectedAddress)?.province;
    const shippingFee = calculateShippingFee(subtotal, province);
    const total = subtotal + shippingFee;

    renderFreeShippingProgress(document.getElementById('shipping-progress'), subtotal);
    document.getElementById('summary-subtotal').textContent = formatPrice(subtotal);
    const shippingEl = document.getElementById('summary-shipping');
    if (shippingFee === 0) {
      shippingEl.textContent = '無料';
    } else if (province) {
      shippingEl.textContent = `${formatPrice(shippingFee)}（${SHIPPING_REGIONS.find((r) => r.key === resolveShippingRegion(province)).label}）`;
    } else {
      shippingEl.textContent = formatPrice(shippingFee);
    }
    document.getElementById('summary-total').textContent = formatPrice(total);
    document.getElementById('submit-btn').textContent = submitting ? '処理中…' : `注文を確定する（${formatPrice(total)}）`;
    return { total };
  }

  document.getElementById('submit-btn').addEventListener('click', async () => {
    const errorMsg = document.getElementById('error-msg');
    errorMsg.classList.add('hidden');
    if (!selectedAddress) {
      errorMsg.textContent = '配送先住所を選択してください';
      errorMsg.classList.remove('hidden');
      return;
    }
    submitting = true;
    renderSummary();
    document.getElementById('submit-btn').disabled = true;
    try {
      const paymentMethod = document.querySelector('input[name="payment"]:checked').value;
      const res = await orderApi.checkout({
        addressId: selectedAddress,
        paymentMethod,
      });
      const orderId = res.data.id;

      if (!isOnlinePayment(paymentMethod)) {
        location.href = `order-detail.html?id=${encodeURIComponent(orderId)}`;
        return;
      }

      // オンライン決済は決済会社のページで支払う。ここで失敗しても注文自体は
      // 「支払い待ち」で残るので、注文詳細から改めて支払いに進める。
      try {
        const session = await orderApi.createPaymentSession(orderId);
        location.href = session.data.paymentUrl;
      } catch (err) {
        location.href = `order-detail.html?id=${encodeURIComponent(orderId)}&payment_error=1`;
      }
    } catch (err) {
      errorMsg.textContent = getErrorMessage(err, '注文の確定に失敗しました');
      errorMsg.classList.remove('hidden');
    } finally {
      submitting = false;
      document.getElementById('submit-btn').disabled = false;
      renderSummary();
    }
  });

  Promise.all([
    cartApi.get().then((res) => {
      cart = res.data;
    }),
    loadAddresses(),
  ]).then(() => {
    document.getElementById('loading-msg').classList.add('hidden');
    document.getElementById('checkout-view').classList.remove('hidden');
    renderSummary();
  });
}
