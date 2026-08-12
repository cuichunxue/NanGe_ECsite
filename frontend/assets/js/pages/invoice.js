import { initLayout } from '../layout.js';
import { requireAuth } from '../guards.js';
import { orderApi, getErrorMessage } from '../api.js';
import { formatPrice, escapeHtml } from '../format.js';

if (requireAuth('')) {
  initLayout({ base: '' });

  const id = new URLSearchParams(location.search).get('id');

  function formatDate(value) {
    return new Date(value).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function render(data) {
    const { order, issuer, qualified, taxBreakdown } = data;

    // 適格請求書を発行できるのは登録を受けた事業者だけ。登録番号がなければ領収書として出す。
    const title = qualified ? '適格請求書（領収書）' : '領収書';
    document.title = `${title} - Solo Shop`;
    document.getElementById('doc-title').textContent = title;

    const snapshot = order.addressSnapshot ?? {};
    document.getElementById('recipient-name').textContent = snapshot.recipient ?? '';
    document.getElementById('issuer-name').textContent = issuer.name || '【発行者名が未設定です】';
    const numberEl = document.getElementById('issuer-number');
    numberEl.textContent = qualified ? `登録番号: ${issuer.registrationNumber}` : '';
    numberEl.classList.toggle('hidden', !qualified);

    document.getElementById('issue-date').textContent = `発行日: ${formatDate(order.paidAt ?? order.createdAt)}`;
    document.getElementById('order-no').textContent = `注文番号: ${order.orderNo}`;
    document.getElementById('grand-total').textContent = formatPrice(order.totalAmount);
    document.getElementById('back-link').href = `order-detail.html?id=${encodeURIComponent(order.id)}`;

    const hasReduced = taxBreakdown.some((t) => t.reduced);
    const rows = order.items.map(
      (item) => `
        <tr>
          <td class="py-2">${escapeHtml(item.productName)}${item.taxRate === 8 ? ' <span class="text-gray-500">※</span>' : ''}</td>
          <td class="py-2 text-right">${item.quantity}</td>
          <td class="py-2 text-right">${formatPrice(item.price)}</td>
          <td class="py-2 text-right">${formatPrice(Number(item.price) * item.quantity)}</td>
        </tr>`,
    );
    if (Number(order.shippingFee) > 0) {
      rows.push(`
        <tr>
          <td class="py-2">送料</td>
          <td class="py-2 text-right">1</td>
          <td class="py-2 text-right">${formatPrice(order.shippingFee)}</td>
          <td class="py-2 text-right">${formatPrice(order.shippingFee)}</td>
        </tr>`);
    }
    document.getElementById('invoice-items').innerHTML = rows.join('');
    document.getElementById('reduced-note').classList.toggle('hidden', !hasReduced);

    // 税率ごとの区分けと消費税額は、適格請求書に必要な記載事項
    document.getElementById('tax-breakdown').innerHTML = taxBreakdown
      .map(
        (t) => `
        <tr>
          <td class="py-2 text-gray-600">${t.taxRate}%対象${t.reduced ? '（軽減税率）' : ''}</td>
          <td class="py-2 text-right">${formatPrice(t.taxIncludedAmount)}</td>
        </tr>
        <tr>
          <td class="py-2 pl-4 text-gray-500">うち消費税</td>
          <td class="py-2 text-right text-gray-600">${formatPrice(t.taxAmount)}</td>
        </tr>`,
      )
      .join('');

    document.getElementById('qualified-note').textContent = qualified
      ? ''
      : '※ 当店は適格請求書発行事業者の登録がないため、この書類は適格請求書ではありません。仕入税額控除の対象にはなりません。';

    document.getElementById('loading-msg').classList.add('hidden');
    document.getElementById('invoice-view').classList.remove('hidden');
  }

  document.getElementById('print-btn').addEventListener('click', () => window.print());

  if (id) {
    orderApi
      .invoice(id)
      .then((res) => render(res.data))
      .catch((err) => {
        document.getElementById('loading-msg').classList.add('hidden');
        const el = document.getElementById('error-msg');
        el.textContent = getErrorMessage(err, '領収書を表示できませんでした');
        el.classList.remove('hidden');
      });
  }
}
