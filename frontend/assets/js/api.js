import { API_BASE_URL } from './config.js';
import { Auth } from './auth.js';

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function getErrorMessage(err, fallback = 'エラーが発生しました') {
  if (err instanceof ApiError) return err.message || fallback;
  return fallback;
}

function buildUrl(path, params) {
  let url = `${API_BASE_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
    });
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  return url;
}

let refreshPromise = null;

async function refreshAccessToken() {
  const refreshToken = Auth.getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error('refresh failed');
    const { accessToken, refreshToken: newRefreshToken, user } = body.data;
    Auth.setAuth(user, accessToken, newRefreshToken);
    return accessToken;
  } catch {
    Auth.clear();
    return null;
  }
}

async function request(method, path, { params, body, retry = false } = {}) {
  const url = buildUrl(path, params);
  const headers = { 'Content-Type': 'application/json' };
  const token = Auth.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !retry && !path.includes('/auth/')) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const newToken = await refreshPromise;
    if (newToken) {
      return request(method, path, { params, body, retry: true });
    }
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok || (payload && payload.success === false)) {
    const code = payload?.error?.code ?? 'UNKNOWN';
    const message = payload?.error?.message ?? 'エラーが発生しました';
    // アカウントが停止されると、以降どの操作も同じ理由で失敗し続ける。
    // ログイン状態のまま置いておくと、画面上は使えるように見えて何をしても
    // エラーになるため、保存していたログイン情報を消してログイン画面へ送る。
    if (code === 'ACCOUNT_SUSPENDED') {
      Auth.clear();
      const base = location.pathname.includes('/admin/') ? '../' : '';
      location.replace(`${base}login.html?reason=suspended`);
    }
    throw new ApiError(code, message);
  }

  return payload;
}

const get = (path, opts) => request('GET', path, opts);
const post = (path, body, opts) => request('POST', path, { ...opts, body });
const patch = (path, body, opts) => request('PATCH', path, { ...opts, body });
const del = (path, opts) => request('DELETE', path, opts);

// --- Auth ---
export const authApi = {
  register: (payload) => post('/auth/register', payload),
  login: (payload) => post('/auth/login', payload),
  logout: (refreshToken) => post('/auth/logout', { refreshToken }),
  me: () => get('/auth/me'),
  updateProfile: (payload) => patch('/auth/me', payload),
  changePassword: (payload) => post('/auth/change-password', payload),
  forgotPassword: (email) => post('/auth/forgot-password', { email }),
  resetPassword: (payload) => post('/auth/reset-password', payload),
};

// --- Categories ---
export const categoryApi = {
  list: () => get('/categories'),
  create: (payload) => post('/categories', payload),
  update: (id, payload) => patch(`/categories/${id}`, payload),
  remove: (id) => del(`/categories/${id}`),
};

// --- Products ---
export const productApi = {
  list: (query) => get('/products', { params: query }),
  byIds: (ids) => get('/products/by-ids', { params: { ids: ids.join(',') } }),
  get: (id) => get(`/products/${id}`),
  reviews: (id) => get(`/products/${id}/reviews`),
  related: (id) => get(`/products/${id}/related`),
  create: (payload) => post('/products', payload),
  update: (id, payload) => patch(`/products/${id}`, payload),
  adjustStock: (id, delta) => post(`/products/${id}/stock-adjust`, { delta }),
  remove: (id) => del(`/products/${id}`),
};

// --- Cart ---
export const cartApi = {
  get: () => get('/cart'),
  addItem: (productId, quantity) => post('/cart/items', { productId, quantity }),
  updateItem: (productId, quantity) => patch(`/cart/items/${productId}`, { quantity }),
  removeItem: (productId) => del(`/cart/items/${productId}`),
};

// --- Addresses ---
export const addressApi = {
  list: () => get('/addresses'),
  create: (payload) => post('/addresses', payload),
  update: (id, payload) => patch(`/addresses/${id}`, payload),
  remove: (id) => del(`/addresses/${id}`),
};

// --- Orders ---
export const orderApi = {
  checkout: (payload) => post('/orders', payload),
  list: (params) => get('/orders', { params }),
  get: (id) => get(`/orders/${id}`),
  createPaymentSession: (id) => post(`/orders/${id}/payment-session`),
  invoice: (id) => get(`/orders/${id}/invoice`),
  cancel: (id) => post(`/orders/${id}/cancel`),
  confirmReceipt: (id) => post(`/orders/${id}/confirm-receipt`),
};

// --- Reviews ---
export const reviewApi = {
  create: (payload) => post('/reviews', payload),
  mine: () => get('/reviews/mine'),
  remove: (id) => del(`/reviews/${id}`),
  adminList: () => get('/reviews'),
};

// --- Wishlist ---
export const wishlistApi = {
  list: () => get('/wishlist'),
  add: (productId) => post('/wishlist', { productId }),
  remove: (productId) => del(`/wishlist/${productId}`),
};

// --- Admin ---
/**
 * 画像の送信。FormDataを使うので、JSON用のラッパーではなく個別に組み立てる
 * （Content-Typeはブラウザに境界文字ごと決めさせる必要があるため指定しない）。
 */
async function postFile(path, file) {
  const form = new FormData();
  form.append('file', file);
  const token = Auth.getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.success === false) {
    throw new ApiError(payload?.error?.code ?? 'UNKNOWN', payload?.error?.message ?? 'アップロードに失敗しました');
  }
  return payload;
}

export const adminApi = {
  uploadImage: (file) => postFile('/admin/uploads', file),
  dashboard: () => get('/admin/dashboard'),
  users: (params) => get('/admin/users', { params }),
  setUserStatus: (id, status) => patch(`/admin/users/${id}/status`, { status }),
  orders: (params) => get('/admin/orders', { params }),
  order: (id) => get(`/admin/orders/${id}`),
  // 発送(SHIPPED)にするときだけ、配送業者と追跡番号を一緒に記録できる
  setOrderStatus: (id, status, shipment = {}) => patch(`/admin/orders/${id}/status`, { status, ...shipment }),
};
