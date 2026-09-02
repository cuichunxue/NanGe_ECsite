import { initLayout, initAdminLayout } from '../layout.js';
import { requireAdmin } from '../guards.js';
import { adminApi } from '../api.js';
import { formatDateTime, formatPrice, orderStatusColor, orderStatusLabel, escapeHtml } from '../format.js';
import { renderPagination } from '../components.js';

if (requireAdmin('../')) {
  initLayout({ base: '../' });
  initAdminLayout('orders.html');

  let status = '';
  let page = 1;

  function load() {
    adminApi.orders({ page, pageSize: 20, status: status || undefined }).then((res) => {
      document.getElementById('order-rows').innerHTML = res.data
        .map(
          (o) => `
          <tr class="border-t">
            <td class="p-3">
              <a href="order-detail.html?id=${encodeURIComponent(o.id)}" class="break-all font-medium text-brand-500 hover:underline">${escapeHtml(o.orderNo)}</a>
              <span class="mt-1 block sm:hidden"><span class="rounded px-2 py-0.5 text-xs ${orderStatusColor[o.status]}">${orderStatusLabel[o.status]}</span></span>
            </td>
            <td class="p-3">${escapeHtml(o.user?.name ?? '')}</td>
            <td class="p-3 whitespace-nowrap">${formatPrice(o.totalAmount)}</td>
            <td class="hidden p-3 sm:table-cell"><span class="rounded px-2 py-0.5 text-xs ${orderStatusColor[o.status]}">${orderStatusLabel[o.status]}</span></td>
            <td class="hidden p-3 text-gray-400 md:table-cell">${formatDateTime(o.createdAt)}</td>
          </tr>
        `,
        )
        .join('');
      renderPagination(document.getElementById('pagination'), res.pagination.page, res.pagination.totalPages, (p) => {
        page = p;
        load();
      });
    });
  }

  document.getElementById('status-select').addEventListener('change', (e) => {
    status = e.target.value;
    page = 1;
    load();
  });

  load();
}
