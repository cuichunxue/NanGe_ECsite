import { calcDiscountPercent, formatPrice, LOW_STOCK_THRESHOLD, escapeHtml } from './format.js';
import { FREE_SHIPPING_THRESHOLD } from './shipping.js';

export function starRatingHtml(value, count) {
  const rounded = Math.round(value * 2) / 2;
  let stars = '';
  for (let i = 0; i < 5; i += 1) {
    const filled = i + 1 <= rounded;
    const half = !filled && i + 0.5 === rounded;
    stars += `<span>${filled ? '★' : half ? '⯨' : '☆'}</span>`;
  }
  const countHtml = typeof count === 'number' ? `<span class="text-xs text-gray-500">(${count})</span>` : '';
  return `<div class="flex items-center gap-1 text-amber-500"><span aria-hidden>${stars}</span>${countHtml}</div>`;
}

export function productCardHtml(product) {
  const discountPercent = calcDiscountPercent(product.price, product.originalPrice);
  const image = product.images?.[0] ?? 'https://placehold.co/400x400?text=No+Image';
  const badge =
    discountPercent !== null
      ? `<span class="absolute left-2 top-2 z-10 rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">-${discountPercent}%</span>`
      : '';
  let stockHtml = '';
  if (product.stock === 0) {
    stockHtml = '<span class="text-xs text-gray-400">在庫切れ</span>';
  } else if (product.stock <= LOW_STOCK_THRESHOLD) {
    stockHtml = `<span class="w-fit rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">残りわずか（あと${product.stock}点）</span>`;
  }
  const originalPriceHtml = product.originalPrice
    ? `<span class="text-xs text-gray-400 line-through">${formatPrice(product.originalPrice)}</span>`
    : '';

  return `
    <a href="product-detail.html?id=${encodeURIComponent(product.id)}" class="card group relative flex flex-col overflow-hidden transition hover:shadow-md">
      ${badge}
      <div class="aspect-square w-full overflow-hidden bg-gray-100">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" class="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
      </div>
      <div class="flex flex-1 flex-col gap-1 p-3">
        <h3 class="line-clamp-2 text-sm text-gray-800">${escapeHtml(product.name)}</h3>
        ${starRatingHtml(Number(product.ratingAvg), product.ratingCount)}
        <div class="mt-auto flex items-baseline gap-2">
          <span class="text-lg font-bold text-brand-500">${formatPrice(product.price)}</span>
          ${originalPriceHtml}
        </div>
        ${stockHtml}
      </div>
    </a>
  `;
}

export function renderProductGrid(container, products, cols = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5') {
  container.className = `grid gap-4 ${cols}`;
  container.innerHTML = products.map(productCardHtml).join('');
}

export function renderPagination(container, page, totalPages, onChange) {
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2,
  );

  let html = `<button class="btn-secondary" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>前へ</button>`;
  pages.forEach((p, idx) => {
    if (idx > 0 && pages[idx - 1] !== p - 1) {
      html += '<span class="px-1 text-gray-400">…</span>';
    }
    html += `<button data-page="${p}" class="h-9 w-9 rounded text-sm ${p === page ? 'bg-brand-500 text-white' : 'hover:bg-gray-100'}">${p}</button>`;
  });
  html += `<button class="btn-secondary" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>次へ</button>`;

  container.className = 'flex items-center justify-center gap-1 py-6';
  container.innerHTML = html;
  container.querySelectorAll('button[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = Number(btn.dataset.page);
      if (p >= 1 && p <= totalPages && p !== page) onChange(p);
    });
  });
}

export function renderFreeShippingProgress(container, subtotal) {
  const remaining = FREE_SHIPPING_THRESHOLD - subtotal;
  const progress = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));
  const message =
    remaining > 0
      ? `<p class="mb-2 text-sm text-brand-700">あと<span class="font-bold">${formatPrice(remaining)}</span>のご購入で送料無料になります</p>`
      : '<p class="mb-2 text-sm font-medium text-brand-700">🎉 送料無料の対象です</p>';
  container.innerHTML = `
    <div class="rounded border border-brand-100 bg-brand-50 p-3">
      ${message}
      <div class="h-2 w-full overflow-hidden rounded-full bg-white">
        <div class="h-full rounded-full bg-brand-500 transition-all" style="width:${progress}%"></div>
      </div>
    </div>
  `;
}
