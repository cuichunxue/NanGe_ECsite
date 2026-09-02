import { initLayout, initAdminLayout } from '../layout.js';
import { requireAdmin } from '../guards.js';
import { adminApi } from '../api.js';
import { formatDateTime, formatPrice, orderStatusLabel, escapeHtml } from '../format.js';

if (requireAdmin('../')) {
  initLayout({ base: '../' });
  initAdminLayout('index.html');

  adminApi.dashboard().then((res) => {
    const stats = res.data;
    document.getElementById('loading-msg').classList.add('hidden');
    const view = document.getElementById('dashboard-view');
    view.classList.remove('hidden');
    view.classList.add('flex');

    const cards = [
      { label: '累計売上', value: formatPrice(stats.totalRevenue) },
      { label: '注文数', value: `${stats.orderCount}件` },
      { label: '会員数', value: `${stats.userCount}人` },
      { label: '公開商品数', value: `${stats.productCount}点` },
      { label: '在庫少商品', value: `${stats.lowStockCount}点`, warn: stats.lowStockCount > 0 },
    ];
    document.getElementById('stat-cards').innerHTML = cards
      .map(
        (c) => `
        <div class="card p-4 ${c.warn ? 'border-red-300 bg-red-50' : ''}">
          <p class="text-xs text-gray-500">${c.label}</p>
          <p class="mt-1 text-xl font-bold ${c.warn ? 'text-red-600' : 'text-gray-800'}">${c.value}</p>
        </div>
      `,
      )
      .join('');

    // 入金済みで発送していない注文。特定商取引法に基づく表示で「◯営業日以内に発送」と
    // 約束しているため、滞ると法令上の問題になる。注文一覧を毎日開かなくても
    // ここで気づけるようにする。
    const shipment = document.getElementById('shipment-notice');
    const awaiting = stats.awaitingShipment ?? { count: 0 };
    if (awaiting.count > 0) {
      const days = awaiting.oldestPaidAt ? Math.floor((Date.now() - new Date(awaiting.oldestPaidAt).getTime()) / 86400000) : 0;
      const oldest = awaiting.oldestPaidAt
        ? `いちばん古いものは ${escapeHtml(awaiting.oldestOrderNo)}（入金から${days}日）です。`
        : '';
      shipment.innerHTML =
        `<p class="font-medium">発送待ちの注文が ${awaiting.count} 件あります</p>` +
        `<p class="mt-1">${oldest}<a href="orders.html?status=PAID" class="underline">発送待ちの注文を見る</a></p>`;
      shipment.classList.remove('hidden');
    } else {
      shipment.classList.add('hidden');
    }

    // 販売中の商品がすべて送料無料の基準以上だと、送料は全額が店主の負担になる。
    // 金額の計算自体は正しく行われるため気づきにくいので、ここで知らせる。
    const notice = document.getElementById('shipping-notice');
    if (stats.alwaysFreeShipping) {
      notice.innerHTML =
        `<p class="font-medium">いまは、どの商品を1点買っても送料無料になります</p>` +
        `<p class="mt-1">送料無料の基準が${formatPrice(stats.freeShippingThreshold)}で、いちばん安い商品が${formatPrice(stats.cheapestProductPrice)}のためです。` +
        `送料は全額がお店の負担になります。基準額を変えるには <code>backend/src/config/shipping.ts</code> と ` +
        `<code>frontend/assets/js/shipping.js</code> の <code>FREE_SHIPPING_THRESHOLD</code> を直してください（両方を同じ値にすること）。</p>`;
      notice.classList.remove('hidden');
    } else {
      notice.classList.add('hidden');
    }

    document.getElementById('status-counts').innerHTML = stats.ordersByStatus
      .map((s) => `<span class="rounded bg-gray-100 px-3 py-1 text-sm">${orderStatusLabel[s.status]}: ${s.count}</span>`)
      .join('');

    document.getElementById('recent-orders').innerHTML = stats.recentOrders
      .map(
        (o) => `
        <tr class="border-t">
          <td class="py-2"><a href="order-detail.html?id=${encodeURIComponent(o.id)}" class="text-brand-500 hover:underline">${escapeHtml(o.orderNo)}</a></td>
          <td>${escapeHtml(o.user?.name ?? '')}</td>
          <td>${formatPrice(o.totalAmount)}</td>
          <td class="text-gray-400">${formatDateTime(o.createdAt)}</td>
        </tr>
      `,
      )
      .join('');
  });
}
