import { prisma } from '../config/prisma';
import { env } from '../config/env';

/**
 * 支払われないまま放置された注文を取り消し、確保していた在庫を売り場へ戻す。
 *
 * 注文が成立した時点で在庫を減らしているため、決済ページで離脱されただけの注文を
 * そのままにしておくと、その商品は在庫があるのに買えない状態が続く。
 * 一点物を扱う店では「一度カゴ落ちされたら二度と売れない」ことになる。
 *
 * 代金引換は商品と引き換えに支払う約束なので、支払い待ちのままでも正常な状態。
 * ここで取り消してはならない。
 */
export async function releaseAbandonedOrders(now = new Date()): Promise<number> {
  const deadline = new Date(now.getTime() - env.paymentHoldMinutes * 60 * 1000);

  const abandoned = await prisma.order.findMany({
    where: {
      status: 'PENDING_PAYMENT',
      createdAt: { lt: deadline },
      paymentMethod: { not: 'COD' },
    },
    select: { id: true, orderNo: true },
  });
  if (abandoned.length === 0) return 0;

  let released = 0;
  for (const order of abandoned) {
    try {
      await prisma.$transaction(async (tx) => {
        // 取り消せたリクエストだけが在庫を戻す。ちょうど入金が確定した注文は
        // ここで status が変わっているため対象から外れ、在庫は戻らない。
        const cancelled = await tx.order.updateMany({
          where: { id: order.id, status: 'PENDING_PAYMENT' },
          data: { status: 'CANCELLED', cancelledAt: now },
        });
        if (cancelled.count === 0) return;

        const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
        for (const item of items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity }, salesCount: { decrement: item.quantity } },
          });
        }
        released += 1;
      });
    } catch (err) {
      // 1件の失敗で残りの注文を放置しないよう、記録して次へ進む
      console.error(`[cleanup] 注文 ${order.orderNo} の在庫返却に失敗しました`, err);
    }
  }

  if (released > 0) {
    console.log(`[cleanup] 支払いのなかった注文 ${released} 件を取り消し、在庫を戻しました`);
  }
  return released;
}

/**
 * 定期実行を開始する。個人運営で常時稼働するサーバー1台を想定しているため、
 * 外部のジョブ基盤を用意せずプロセス内のタイマーで回す。
 */
export function startOrderCleanup(intervalMinutes = 5): NodeJS.Timeout {
  const run = () => {
    releaseAbandonedOrders().catch((err) => console.error('[cleanup] 実行に失敗しました', err));
  };
  run(); // 起動直後に一度実行し、停止中に溜まった分を片付ける
  const timer = setInterval(run, intervalMinutes * 60 * 1000);
  timer.unref(); // 終了時にこのタイマーがプロセスを引き止めないようにする
  return timer;
}
