// 操作の結果を利用者に必ず伝えるための共通表示。
//
// カートに入れる・住所を保存する・削除するといった操作は、失敗しても画面が
// 変わらないため、何も出さないと「押したのに反応しない」状態になる。
// 購入者はレジで止まり、店主は何が起きたのか分からないまま操作を繰り返す。
// 専用のエラー欄がある画面はそちらを使い、無い操作はここで知らせる。

let container = null;

function ensureContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  // 画面下部に出す。スマホでは指の届く位置、PCでも視線の邪魔になりにくい。
  container.className = 'fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4';
  // 通知そのものを押せてしまうと背後の操作を妨げるため、枠は素通しにする
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);
  return container;
}

/**
 * 画面下部に短いお知らせを出す。
 * @param {string} message 利用者に見せる文章
 * @param {'error'|'success'} type 失敗か成功か
 */
export function notify(message, type = 'error') {
  if (!message) return;
  const el = document.createElement('div');
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const color = type === 'error' ? 'bg-red-600' : 'bg-gray-800';
  el.className = `${color} max-w-md rounded px-4 py-2 text-sm text-white shadow-lg`;
  el.style.pointerEvents = 'auto';
  el.textContent = message;
  ensureContainer().appendChild(el);

  // 失敗の知らせは読む時間が要るので長めに出す
  const ms = type === 'error' ? 6000 : 3000;
  setTimeout(() => el.remove(), ms);
}
