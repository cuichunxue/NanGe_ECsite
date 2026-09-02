import { Auth } from './auth.js';

/**
 * ログイン画面へ送る。今いるページを `from` として渡すことで、ログイン後に
 * 元のページへ戻せるようにする（見ていた商品を見失わせない）。
 */
export function goToLogin(base = '') {
  const from = encodeURIComponent(location.pathname.split('/').pop() + location.search);
  location.href = `${base}login.html?from=${from}`;
}

export function requireAuth(base = '') {
  if (!Auth.getUser()) {
    const from = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    location.replace(`${base}login.html?from=${from}`);
    return false;
  }
  return true;
}

export function requireAdmin(base = '') {
  const user = Auth.getUser();
  if (!user) {
    location.replace(`${base}login.html`);
    return false;
  }
  if (user.role !== 'ADMIN') {
    location.replace(`${base}index.html`);
    return false;
  }
  return true;
}
