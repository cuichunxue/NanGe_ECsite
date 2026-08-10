import { initLayout, initAdminLayout } from '../layout.js';
import { requireAdmin } from '../guards.js';
import { adminApi } from '../api.js';
import { formatDateTime, escapeHtml } from '../format.js';
import { renderPagination } from '../components.js';

if (requireAdmin('../')) {
  initLayout({ base: '../' });
  initAdminLayout('users.html');

  let page = 1;
  let keyword = '';

  function load() {
    adminApi.users({ page, pageSize: 20, keyword: keyword || undefined }).then((res) => {
      document.getElementById('user-rows').innerHTML = res.data
        .map(
          (u) => `
          <tr class="border-t" data-user-id="${u.id}">
            <td class="p-3">${escapeHtml(u.name)}</td>
            <td class="p-3">${escapeHtml(u.email)}</td>
            <td class="p-3">${u.role === 'ADMIN' ? '管理者' : '会員'}</td>
            <td class="p-3"><span class="rounded px-2 py-0.5 text-xs ${u.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${u.status === 'ACTIVE' ? '有効' : '停止中'}</span></td>
            <td class="p-3 text-gray-400">${formatDateTime(u.createdAt)}</td>
            <td class="p-3">${u.role !== 'ADMIN' ? `<button data-action="toggle" class="text-brand-500 hover:underline">${u.status === 'ACTIVE' ? '凍結する' : '解除する'}</button>` : ''}</td>
          </tr>
        `,
        )
        .join('');

      document.querySelectorAll('[data-user-id]').forEach((row) => {
        const u = res.data.find((item) => item.id === row.dataset.userId);
        row.querySelector('[data-action="toggle"]')?.addEventListener('click', async () => {
          await adminApi.setUserStatus(u.id, u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');
          load();
        });
      });

      renderPagination(document.getElementById('pagination'), res.pagination.page, res.pagination.totalPages, (p) => {
        page = p;
        load();
      });
    });
  }

  document.getElementById('search-btn').addEventListener('click', () => {
    keyword = document.getElementById('keyword').value;
    page = 1;
    load();
  });

  load();
}
