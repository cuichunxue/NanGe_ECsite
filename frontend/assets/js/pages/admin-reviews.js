import { initLayout, initAdminLayout } from '../layout.js';
import { requireAdmin } from '../guards.js';
import { reviewApi } from '../api.js';
import { formatDateTime, escapeHtml } from '../format.js';
import { starRatingHtml } from '../components.js';
import { notify } from '../notify.js';

if (requireAdmin('../')) {
  initLayout({ base: '../' });
  initAdminLayout('reviews.html');

  function load() {
    reviewApi.adminList().then((res) => {
      const reviews = res.data;
      document.getElementById('empty-msg').classList.toggle('hidden', reviews.length > 0);
      document.getElementById('review-list').innerHTML = reviews
        .map(
          (r) => `
          <div class="card flex items-start justify-between p-4" data-review-id="${r.id}">
            <div>
              <p class="text-sm font-medium">${escapeHtml(r.product?.name ?? '')} — ${escapeHtml(r.user?.name ?? '')}</p>
              ${starRatingHtml(r.rating)}
              <p class="mt-1 text-sm text-gray-600">${escapeHtml(r.content)}</p>
              <p class="mt-1 text-xs text-gray-400">${formatDateTime(r.createdAt)}</p>
            </div>
            <button data-action="delete" class="shrink-0 text-sm text-red-500 hover:underline">削除</button>
          </div>
        `,
        )
        .join('');
      document.querySelectorAll('[data-review-id]').forEach((row) => {
        row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
          if (!confirm('このレビューを削除しますか？')) return;
          try {
        await reviewApi.remove(row.dataset.reviewId);
      } catch (err) {
        notify(getErrorMessage(err, 'レビューを削除できませんでした'));
        return;
      }
          load();
        });
      });
    });
  }

  load();
}
