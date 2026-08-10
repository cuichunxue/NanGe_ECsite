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
