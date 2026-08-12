import { Router, raw } from 'express';
import { prisma } from '../config/prisma';
import { catchAsync } from '../utils/catchAsync';
import * as komoju from '../services/komoju.service';
import * as orderService from '../services/order.service';
import { notifyOwnerPaymentNeedsAttention } from '../services/orderNotification.service';

const router = Router();

/**
 * KOMOJUからの決済通知の受け口。
 *
 * このサイトで「入金があった」と判断できる唯一の経路。購入者のブラウザからの
 * 申告では支払い済みにしない（お金を払わずに発送させられてしまうため）。
 *
 * 署名は生のバイト列に対するHMACなので、JSONを解析する前の本文が必要になる。
 * そのため express.json() ではなく express.raw() でこのルートだけ受ける。
 */
router.post(
  '/komoju',
  raw({ type: '*/*', limit: '1mb' }),
  catchAsync(async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const signature = req.header('X-Komoju-Signature');

    if (!komoju.verifyWebhookSignature(rawBody, signature)) {
      console.warn('[komoju] 署名が一致しない通知を拒否しました');
      return res.status(401).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'signature mismatch' } });
    }

    let event: komoju.KomojuEvent;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'invalid json' } });
    }

    const payment = event.data;
    const order = await findOrderForPayment(payment);
    if (!order) {
      // 対象が見つからない通知を失敗として返すとKOMOJU側で再送が続くため、
      // 受領済みとして返したうえでログに残す。
      console.warn(`[komoju] 該当する注文が見つかりません type=${event.type} payment=${payment?.id}`);
      return res.json({ success: true, data: { handled: false } });
    }

    switch (event.type) {
      case 'payment.captured': {
        // 決済会社が受け取った金額と注文額が食い違う通知は反映しない
        const expected = Number(order.totalAmount);
        const received = Number(payment.total ?? payment.amount);
        if (received !== expected) {
          console.error(`[komoju] 金額不一致のため反映しません 注文=${order.orderNo} 期待=${expected} 受領=${received}`);
          return res.json({ success: true, data: { handled: false } });
        }
        const applied = await orderService.markOrderPaid(order.id, payment.id);
        if (applied) {
          console.log(`[komoju] 入金確定 注文=${order.orderNo}`);
        } else if (order.status === 'CANCELLED') {
          // 取り消し済みの注文に入金が届いた場合、商品を確保していないのにお金だけ
          // 受け取った状態になる。放置すると購入者との間で問題になるため、
          // 店主に返金の要否を知らせる。
          console.error(`[komoju] 取り消し済みの注文に入金がありました 注文=${order.orderNo} 決済=${payment.id}`);
          notifyOwnerPaymentNeedsAttention(order.id, payment.id);
        } else {
          console.log(`[komoju] 入金確定（反映済みのため無視） 注文=${order.orderNo}`);
        }
        break;
      }
      case 'payment.refunded': {
        await orderService.markOrderRefunded(order.id);
        console.log(`[komoju] 返金確定 注文=${order.orderNo}`);
        break;
      }
      case 'payment.failed':
      case 'payment.expired':
      case 'payment.cancelled': {
        // 支払い待ちのまま据え置く。購入者は同じ注文からやり直せる。
        console.log(`[komoju] 決済が成立しませんでした type=${event.type} 注文=${order.orderNo}`);
        break;
      }
      default:
        console.log(`[komoju] 未対応のイベントを受信しました type=${event.type} 注文=${order.orderNo}`);
    }

    return res.json({ success: true, data: { handled: true } });
  }),
);

/** 通知に含まれるセッションID・決済ID・metadata の順に注文を探す */
async function findOrderForPayment(payment: komoju.KomojuEvent['data'] | undefined) {
  if (!payment) return null;
  if (payment.session) {
    const bySession = await prisma.order.findUnique({ where: { paymentSessionId: payment.session } });
    if (bySession) return bySession;
  }
  if (payment.id) {
    const byPayment = await prisma.order.findUnique({ where: { paymentId: payment.id } });
    if (byPayment) return byPayment;
  }
  const orderId = payment.metadata?.order_id;
  if (orderId) return prisma.order.findUnique({ where: { id: orderId } });
  return null;
}

export default router;
