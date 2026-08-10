import { initLayout, initAdminLayout } from '../layout.js';
import { requireAdmin } from '../guards.js';
import { categoryApi, getErrorMessage } from '../api.js';
import { escapeHtml } from '../format.js';

if (requireAdmin('../')) {
  initLayout({ base: '../' });
  initAdminLayout('categories.html');

  function load() {
    categoryApi.list().then((res) => {
      document.getElementById('category-list').innerHTML = res.data
        .map(
          (c) => `
          <div class="flex items-center justify-between p-3" data-category-id="${c.id}">
            <span>${escapeHtml(c.name)}</span>
            <button data-action="delete" class="text-sm text-red-500 hover:underline">削除</button>
          </div>
        `,
        )
        .join('');
      document.querySelectorAll('[data-category-id]').forEach((row) => {
        row.querySelector('[data-action="delete"]').addEventListener('click', () => handleDelete(row.dataset.categoryId));
      });
    });
  }

  document.getElementById('add-btn').addEventListener('click', async () => {
    const errorMsg = document.getElementById('error-msg');
    errorMsg.classList.add('hidden');
    try {
      await categoryApi.create({
        name: document.getElementById('new-name').value,
      });
      document.getElementById('new-name').value = '';
      load();
    } catch (err) {
      errorMsg.textContent = getErrorMessage(err);
      errorMsg.classList.remove('hidden');
    }
  });

  async function handleDelete(id) {
    if (!confirm('このカテゴリを削除しますか？')) return;
    const errorMsg = document.getElementById('error-msg');
    errorMsg.classList.add('hidden');
    try {
      await categoryApi.remove(id);
      load();
    } catch (err) {
      errorMsg.textContent = getErrorMessage(err);
      errorMsg.classList.remove('hidden');
    }
  }

  load();
}
