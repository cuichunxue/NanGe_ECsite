import { initLayout } from '../layout.js';
import { categoryApi, productApi } from '../api.js';
import { renderProductGrid, renderPagination } from '../components.js';
import { escapeHtml } from '../format.js';

const params = new URLSearchParams(location.search);

function getState() {
  return {
    keyword: params.get('keyword') ?? '',
    categoryId: params.get('categoryId') ?? '',
    sort: params.get('sort') ?? 'newest',
    page: Number(params.get('page') ?? '1'),
    minPrice: params.get('minPrice') ?? '',
    maxPrice: params.get('maxPrice') ?? '',
  };
}

let state = getState();
initLayout({ base: '', keyword: state.keyword });

document.getElementById('min-price').value = state.minPrice;
document.getElementById('max-price').value = state.maxPrice;
document.getElementById('sort-select').value = state.sort;

function updateParam(key, value) {
  const next = new URLSearchParams(location.search);
  if (value) next.set(key, value);
  else next.delete(key);
  if (key !== 'page') next.delete('page');
  location.search = next.toString();
}

document.getElementById('sort-select').addEventListener('change', (e) => updateParam('sort', e.target.value));

// 価格帯は入力途中でページ遷移するとフォーカスが外れて連続入力できないため、
// URLはhistory.replaceStateで更新しつつ、一覧はページ内で再取得する。
let priceDebounce;
function onPriceChange() {
  clearTimeout(priceDebounce);
  priceDebounce = setTimeout(() => {
    state.minPrice = document.getElementById('min-price').value;
    state.maxPrice = document.getElementById('max-price').value;
    state.page = 1;

    const next = new URLSearchParams(location.search);
    if (state.minPrice) next.set('minPrice', state.minPrice);
    else next.delete('minPrice');
    if (state.maxPrice) next.set('maxPrice', state.maxPrice);
    else next.delete('maxPrice');
    next.delete('page');
    const qs = next.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);

    load();
  }, 400);
}
document.getElementById('min-price').addEventListener('input', onPriceChange);
document.getElementById('max-price').addEventListener('input', onPriceChange);

categoryApi.list().then((res) => {
  const el = document.getElementById('category-filter');
  const items = [
    `<li><button data-category="" class="w-full rounded px-2 py-1 text-left ${!state.categoryId ? 'bg-brand-50 text-brand-600' : 'hover:bg-gray-50'}">すべて</button></li>`,
    ...res.data.map(
      (c) =>
        `<li><button data-category="${c.id}" class="w-full rounded px-2 py-1 text-left ${state.categoryId === c.id ? 'bg-brand-50 text-brand-600' : 'hover:bg-gray-50'}">${escapeHtml(c.name)}</button></li>`,
    ),
  ];
  el.innerHTML = items.join('');
  el.querySelectorAll('button[data-category]').forEach((btn) => {
    btn.addEventListener('click', () => updateParam('categoryId', btn.dataset.category));
  });
});

function load() {
  const loadingMsg = document.getElementById('loading-msg');
  const emptyMsg = document.getElementById('empty-msg');
  const grid = document.getElementById('product-grid');
  loadingMsg.classList.remove('hidden');
  emptyMsg.classList.add('hidden');
  grid.innerHTML = '';

  productApi
    .list({
      keyword: state.keyword || undefined,
      categoryId: state.categoryId || undefined,
      sort: state.sort,
      page: state.page,
      pageSize: 20,
      minPrice: state.minPrice ? Number(state.minPrice) : undefined,
      maxPrice: state.maxPrice ? Number(state.maxPrice) : undefined,
    })
    .then((res) => {
      document.getElementById('result-summary').textContent = `${state.keyword ? `「${state.keyword}」の検索結果: ` : ''}${res.pagination.total}件`;
      if (res.data.length === 0) {
        emptyMsg.classList.remove('hidden');
      } else {
        renderProductGrid(grid, res.data, 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4');
      }
      renderPagination(document.getElementById('pagination'), res.pagination.page, res.pagination.totalPages, (p) => updateParam('page', String(p)));
    })
    .finally(() => loadingMsg.classList.add('hidden'));
}

load();
