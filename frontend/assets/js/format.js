// 在庫がこの数以下になったら購入ページに「残りわずか」表示を出す（0は在庫切れ表示と別扱い）
export const LOW_STOCK_THRESHOLD = 5;

export function formatPrice(value) {
  const n = typeof value === 'string' ? Number(value) : value;
  return `¥${n.toLocaleString('ja-JP')}`;
}

// 割引率(%)を計算する。元値が無い/元値以上の場合はnull（アンカリング表示は根拠がある時のみ行う）
export function calcDiscountPercent(price, originalPrice) {
  if (originalPrice == null) return null;
  const p = typeof price === 'string' ? Number(price) : price;
  const op = typeof originalPrice === 'string' ? Number(originalPrice) : originalPrice;
  if (!(op > p) || op <= 0) return null;
  return Math.round(((op - p) / op) * 100);
}

export function formatDateTime(value) {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export const orderStatusLabel = {
  PENDING_PAYMENT: '支払い待ち',
  PAID: '支払い済み',
  SHIPPED: '発送済み',
  COMPLETED: '受取完了',
  CANCELLED: 'キャンセル済み',
  REFUNDED: '返金済み',
};

export const orderStatusColor = {
  PENDING_PAYMENT: 'bg-amber-100 text-amber-700',
  PAID: 'bg-blue-100 text-blue-700',
  SHIPPED: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
  REFUNDED: 'bg-red-100 text-red-700',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

// ログイン後リダイレクト先を検証する。オープンリダイレクトやjavascript:実行を防ぐため、
// 同一サイト内の相対パスのみ許可し、それ以外は index.html に落とす。
export function safeRedirect(raw, fallback = 'index.html') {
  if (!raw) return fallback;
  let target;
  try {
    target = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  target = target.trim();
  if (!target) return fallback;
  // スキーム付き(javascript:, http: 等)・プロトコル相対(//)・絶対パス(/, \)を拒否
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return fallback;
  if (/^[/\\]/.test(target)) return fallback;
  return target;
}
