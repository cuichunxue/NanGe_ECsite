import { Auth } from './auth.js';

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
