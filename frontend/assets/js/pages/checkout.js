import { initLayout } from '../layout.js';
import { requireAuth } from '../guards.js';
import { addressApi, cartApi, orderApi, getErrorMessage } from '../api.js';
import { formatPrice, escapeHtml } from '../format.js';
import { calculateShippingFee } from '../shipping.js';
import { renderFreeShippingProgress } from '../components.js';

if (requireAuth('')) {
  initLayout({ base: '' });

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
    };
    const res = await addressApi.create(payload);
    document.getElementById('address-form').classList.add('hidden');
    document.getElementById('address-form').classList.remove('grid');
    document.getElementById('show-address-form-btn').classList.remove('hidden');
    ['addr-recipient', 'addr-phone', 'addr-province', 'addr-city', 'addr-district', 'addr-detail'].forEach((id) => {
      document.getElementById(id).value = '';
    });
    await loadAddresses();
    selectedAddress = res.data.id;
    renderAddresses();
  });

  function renderSummary() {
    const subtotal = cart?.totalAmount ?? 0;
    const shippingFee = calculateShippingFee(subtotal);
    const total = subtotal + shippingFee;

    renderFreeShippingProgress(document.getElementById('shipping-progress'), subtotal);
    document.getElementById('summary-subtotal').textContent = formatPrice(subtotal);
    document.getElementById('summary-shipping').textContent = shippingFee === 0 ? '無料' : formatPrice(shippingFee);
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

      if (paymentMethod === 'COD') {
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
