import { initLayout } from '../layout.js';
import { requireAuth } from '../guards.js';
import { orderApi } from '../api.js';
import { formatDateTime, formatPrice, orderStatusColor, orderStatusLabel, escapeHtml } from '../format.js';
import { renderPagination } from '../components.js';

if (requireAuth('')) {
  initLayout({ base: '' });

  const statusTabs = [
    { value: '', label: 'すべて' },
    { value: 'PENDING_PAYMENT', label: '支払い待ち' },
    { value: 'PAID', label: '支払い済み' },
    { value: 'SHIPPED', label: '発送済み' },
    { value: 'COMPLETED', label: '受取完了' },
    { value: 'CANCELLED', label: 'キャンセル' },
  ];

  let status = '';
  let page = 1;

  function renderTabs() {
    document.getElementById('status-tabs').innerHTML = statusTabs
      .map(
        (t) => `
        <button data-status="${t.value}" class="shrink-0 rounded-full px-4 py-1.5 text-sm ${status === t.value ? 'bg-brand-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}">${t.label}</button>
      `,
      )
      .join('');
    document.querySelectorAll('[data-status]').forEach((btn) => {
      btn.addEventListener('click', () => {
        status = btn.dataset.status;
        page = 1;
        renderTabs();
        load();
      });
    });
  }

  function load() {
    orderApi.list({ page, pageSize: 10, status: status || undefined }).then((res) => {
      const emptyMsg = document.getElementById('empty-msg');
      const listEl = document.getElementById('order-list');
      if (res.data.length === 0) {
        emptyMsg.classList.remove('hidden');
        listEl.innerHTML = '';
      } else {
        emptyMsg.classList.add('hidden');
        listEl.innerHTML = res.data
          .map(
            (order) => `
            <a href="order-detail.html?id=${encodeURIComponent(order.id)}" class="card block p-4 hover:shadow-md">
              <div class="mb-2 flex items-center justify-between text-sm">
                <span class="text-gray-500">注文番号: ${escapeHtml(order.orderNo)}</span>
                <span class="rounded px-2 py-0.5 text-xs ${orderStatusColor[order.status]}">${orderStatusLabel[order.status]}</span>
              </div>
              <div class="flex gap-2 overflow-x-auto">
                ${order.items.map((item) => `<img src="${escapeHtml(item.productImage ?? '')}" class="h-16 w-16 shrink-0 rounded object-cover" />`).join('')}
              </div>
              <div class="mt-2 flex items-center justify-between text-sm">
                <span class="text-gray-400">${formatDateTime(order.createdAt)}</span>
                <span class="font-bold text-brand-500">${formatPrice(order.totalAmount)}</span>
              </div>
            </a>
          `,
          )
          .join('');
      }
      renderPagination(document.getElementById('pagination'), res.pagination.page, res.pagination.totalPages, (p) => {
        page = p;
        load();
      });
    });
  }

  renderTabs();
  load();
}
