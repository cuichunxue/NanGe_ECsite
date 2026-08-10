import { initLayout } from '../layout.js';
import { Auth } from '../auth.js';
import { cartApi, productApi, wishlistApi, getErrorMessage } from '../api.js';
import { calcDiscountPercent, formatDateTime, formatPrice, LOW_STOCK_THRESHOLD, escapeHtml } from '../format.js';
import { starRatingHtml, renderProductGrid } from '../components.js';
import { addRecentlyViewed } from '../recentlyViewed.js';
import { NO_IMAGE_PLACEHOLDER } from '../placeholder.js';

initLayout({ base: '' });

const params = new URLSearchParams(location.search);
const id = params.get('id');

let product = null;
let quantity = 1;
let activeImage = 0;

function renderImages() {
  document.getElementById('main-image').src = product.images[activeImage] || NO_IMAGE_PLACEHOLDER;
  document.getElementById('main-image').alt = product.name;
  const thumbs = document.getElementById('thumbnails');
  if (product.images.length > 1) {
    thumbs.innerHTML = product.images
      .map(
        (img, idx) => `
        <button data-idx="${idx}" class="h-16 w-16 overflow-hidden rounded border-2 ${idx === activeImage ? 'border-brand-500' : 'border-transparent'}">
          <img src="${escapeHtml(img)}" class="h-full w-full object-cover" />
        </button>
      `,
      )
      .join('');
    thumbs.querySelectorAll('button[data-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeImage = Number(btn.dataset.idx);
        renderImages();
      });
    });
  } else {
    thumbs.innerHTML = '';
  }
}

function showMessage(text) {
  const el = document.getElementById('message');
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2000);
}

function renderQuantity() {
  document.getElementById('qty-value').textContent = String(quantity);
}

function render() {
  document.getElementById('loading-msg').classList.add('hidden');
  document.getElementById('detail').classList.remove('hidden');

  renderImages();
  document.getElementById('product-name').textContent = product.name;
  document.getElementById('star-rating').innerHTML = starRatingHtml(Number(product.ratingAvg), product.ratingCount);
  document.getElementById('price').textContent = formatPrice(product.price);

  const discountPercent = calcDiscountPercent(product.price, product.originalPrice);
  if (product.originalPrice) {
    const originalEl = document.getElementById('original-price');
    originalEl.textContent = formatPrice(product.originalPrice);
    originalEl.classList.remove('hidden');
  }
  if (discountPercent !== null) {
    const badge = document.getElementById('discount-badge');
    badge.textContent = `${discountPercent}%OFF`;
    badge.classList.remove('hidden');
    if (product.originalPrice) {
      const savings = document.getElementById('discount-savings');
      savings.textContent = `${formatPrice(Number(product.originalPrice) - Number(product.price))}お得です`;
      savings.classList.remove('hidden');
    }
  }

  document.getElementById('description').textContent = product.description;
  document.getElementById('meta-line').textContent = `ブランド: ${product.brand ?? '—'} / SKU: ${product.sku} / 在庫: ${product.stock > 0 ? `${product.stock}点` : '在庫切れ'}`;
  if (product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD) {
    document.getElementById('low-stock-badge').classList.remove('hidden');
  }

  renderQuantity();

  if (product.stock === 0) {
    document.getElementById('add-cart-btn').disabled = true;
    document.getElementById('buy-now-btn').disabled = true;
  }
}

document.getElementById('qty-minus').addEventListener('click', () => {
  quantity = Math.max(1, quantity - 1);
  renderQuantity();
});
document.getElementById('qty-plus').addEventListener('click', () => {
  quantity = Math.min(product.stock, quantity + 1);
  renderQuantity();
});

document.getElementById('add-cart-btn').addEventListener('click', async () => {
  if (!Auth.getUser()) return void (location.href = 'login.html');
  try {
    await cartApi.addItem(product.id, quantity);
    showMessage('カートに追加しました');
  } catch (err) {
    showMessage(getErrorMessage(err));
  }
});

document.getElementById('buy-now-btn').addEventListener('click', async () => {
  if (!Auth.getUser()) return void (location.href = 'login.html');
  await cartApi.addItem(product.id, quantity);
  location.href = 'checkout.html';
});

document.getElementById('wishlist-btn').addEventListener('click', async () => {
  if (!Auth.getUser()) return void (location.href = 'login.html');
  await wishlistApi.add(product.id);
  showMessage('お気に入りに追加しました');
});

function renderReviews(reviews) {
  document.getElementById('review-heading').textContent = `レビュー (${reviews.length}件)`;
  if (reviews.length === 0) {
    document.getElementById('no-review-msg').classList.remove('hidden');
    return;
  }
  document.getElementById('review-list').innerHTML = reviews
    .map(
      (r) => `
      <div class="card p-4">
        <div class="mb-1 flex items-center justify-between">
          <span class="flex items-center gap-2">
            <span class="text-sm font-medium">${escapeHtml(r.user?.name)}</span>
            <span class="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">✓ 購入者</span>
          </span>
          <span class="text-xs text-gray-400">${formatDateTime(r.createdAt)}</span>
        </div>
        ${starRatingHtml(r.rating)}
        <p class="mt-2 text-sm text-gray-700">${escapeHtml(r.content)}</p>
      </div>
    `,
    )
    .join('');
}

if (id) {
  productApi.get(id).then((res) => {
    product = res.data;
    render();
  });
  productApi.reviews(id).then((res) => renderReviews(res.data));
  productApi.related(id).then((res) => {
    if (res.data.length === 0) return;
    document.getElementById('related-section').classList.remove('hidden');
    renderProductGrid(document.getElementById('related-grid'), res.data, 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4');
  });
  addRecentlyViewed(id);
}
