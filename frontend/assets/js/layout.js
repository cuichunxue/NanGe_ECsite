import { Auth } from './auth.js';
import { cartApi } from './api.js';
import { escapeHtml } from './format.js';

function currentPage() {
  return location.pathname.split('/').pop() + location.search;
}

function renderHeader(base, keyword) {
  const el = document.getElementById('site-header');
  if (!el) return;
  const user = Auth.getUser();

  el.innerHTML = `
    <header class="sticky top-0 z-30 bg-white shadow-sm">
      <div class="mx-auto max-w-7xl px-4 py-3">
        <div class="flex items-center gap-4">
          <a href="${base}index.html" class="shrink-0 text-2xl font-extrabold text-brand-500">Solo<span class="text-gray-800">Shop</span></a>
          <div class="hidden max-w-xl flex-1 sm:block">
            <form data-role="search-form-desktop" class="flex w-full">
              <input data-role="search-input-desktop" value="${escapeHtml(keyword ?? '')}" placeholder="商品名・ブランドで検索" class="w-full min-w-0 rounded-l border border-brand-500 px-3 py-2 text-sm focus:outline-none" />
              <button type="submit" class="shrink-0 rounded-r bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">検索</button>
            </form>
          </div>
          <nav class="ml-auto flex items-center gap-4 text-sm">
            <a href="${base}wishlist.html" class="hidden text-gray-600 hover:text-brand-500 sm:inline">お気に入り</a>
            <a href="${base}cart.html" class="relative text-gray-600 hover:text-brand-500">
              カート
              <span data-role="cart-count" class="absolute -right-3 -top-2 hidden h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] text-white"></span>
            </a>
            ${
              user
                ? `<div class="relative">
                    <button data-role="user-menu-btn" aria-expanded="false" aria-haspopup="true" class="text-gray-700 hover:text-brand-500">${escapeHtml(user.name)} 様</button>
                    <div data-role="user-menu" class="absolute right-0 top-full hidden w-40 rounded border bg-white py-1 shadow-lg">
                      <a href="${base}mypage.html" class="block px-4 py-2 hover:bg-gray-50">マイページ</a>
                      <a href="${base}orders.html" class="block px-4 py-2 hover:bg-gray-50">注文履歴</a>
                      ${user.role === 'ADMIN' ? `<a href="${base}admin/index.html" class="block px-4 py-2 hover:bg-gray-50">管理画面</a>` : ''}
                      <button data-role="logout-btn" class="block w-full px-4 py-2 text-left text-red-600 hover:bg-gray-50">ログアウト</button>
                    </div>
                  </div>`
                : `<a href="${base}login.html" class="btn-primary">ログイン</a>`
            }
          </nav>
        </div>
        <div class="mt-2 sm:hidden">
          <form data-role="search-form-mobile" class="flex w-full">
            <input data-role="search-input-mobile" value="${escapeHtml(keyword ?? '')}" placeholder="商品名・ブランドで検索" class="w-full min-w-0 rounded-l border border-brand-500 px-3 py-2 text-sm focus:outline-none" />
            <button type="submit" class="shrink-0 rounded-r bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">検索</button>
          </form>
        </div>
      </div>
    </header>
  `;

  ['desktop', 'mobile'].forEach((variant) => {
    const form = el.querySelector(`[data-role="search-form-${variant}"]`);
    const input = el.querySelector(`[data-role="search-input-${variant}"]`);
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      location.href = `${base}products.html?keyword=${encodeURIComponent(input.value)}`;
    });
  });

  // メニューはホバーではなくクリック/タップで開閉する。ホバーだけだとタッチ端末で
  // 開けず、店主がスマホから管理画面に入れなくなる。
  const menuBtn = el.querySelector('[data-role="user-menu-btn"]');
  const menu = el.querySelector('[data-role="user-menu"]');
  if (menuBtn && menu) {
    const setOpen = (open) => {
      menu.classList.toggle('hidden', !open);
      menuBtn.setAttribute('aria-expanded', String(open));
    };
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(menu.classList.contains('hidden'));
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false);
    });
  }

  el.querySelector('[data-role="logout-btn"]')?.addEventListener('click', () => {
    Auth.clear();
    location.href = `${base}index.html`;
  });

  if (user) refreshCartCount();
}

/**
 * ヘッダーのカート個数バッジを最新にする。
 * 商品をカートに入れた直後にも呼ぶことで、「入ったのかどうか分からない」状態を防ぐ。
 */
export function refreshCartCount() {
  const badge = document.querySelector('[data-role="cart-count"]');
  if (!badge || !Auth.getUser()) return;
  cartApi
    .get()
    .then((res) => {
      const count = res.data.totalQuantity;
      badge.textContent = String(count);
      badge.classList.toggle('hidden', count === 0);
      badge.classList.toggle('flex', count > 0);
    })
    .catch(() => {});
}

function renderFooter(base) {
  const el = document.getElementById('site-footer');
  if (!el) return;
  el.innerHTML = `
    <footer class="mt-16 border-t bg-white py-8 text-center text-sm text-gray-500">
      <p>Solo Shop — 個人で運営する小さなオンラインショップです</p>
      <nav class="mt-3 flex justify-center gap-4 text-xs">
        <a href="${base}legal.html" class="hover:text-brand-500 hover:underline">特定商取引法に基づく表示</a>
      </nav>
      <p class="mt-3">© ${new Date().getFullYear()} Solo Shop. All rights reserved.</p>
    </footer>
  `;
}

export function initLayout({ base = '', keyword = '' } = {}) {
  renderHeader(base, keyword);
  renderFooter(base);
}

const adminNavItems = [
  { file: 'index.html', label: 'ダッシュボード' },
  { file: 'products.html', label: '商品管理' },
  { file: 'categories.html', label: 'カテゴリ管理' },
  { file: 'orders.html', label: '注文管理' },
  { file: 'users.html', label: '会員管理' },
  { file: 'reviews.html', label: 'レビュー管理' },
];

export function initAdminLayout(activeFile) {
  const el = document.getElementById('admin-sidebar');
  if (!el) return;
  // 狭い画面では横に並ぶタブ、広い画面では従来どおり縦のサイドバーにする。
  // 店主はスマホから注文確認・発送を行うことが多いため、縦積みのまま幅を固定すると
  // 本文が潰れて操作できなくなる。
  el.innerHTML = `
    <div class="card p-2">
      <p class="hidden px-3 py-2 text-xs font-semibold text-gray-400 lg:block">管理者メニュー</p>
      <nav class="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0 lg:overflow-visible">
        ${adminNavItems
          .map(
            (item) => `
          <a href="${item.file}" class="whitespace-nowrap rounded px-3 py-2 text-sm ${
            item.file === activeFile ? 'bg-brand-50 font-medium text-brand-600' : 'text-gray-600 hover:bg-gray-50'
          }">${item.label}</a>
        `,
          )
          .join('')}
      </nav>
    </div>
  `;
}

export { currentPage };
