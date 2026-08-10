import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/apiError';
import { generateOrderNo } from '../utils/orderNo';
import { getOrCreateCart } from './cart.service';
import { calculateShippingFee } from '../config/shipping';
import { notifyOrderPlaced, notifyOrderShipped, notifyOwnerOrderPaid } from './orderNotification.service';
import * as komoju from './komoju.service';
import { env } from '../config/env';

interface CheckoutInput {
  userId: string;
  addressId: string;
  paymentMethod: string;
  remark?: string;
}

export async function checkout(input: CheckoutInput) {
  const { userId, addressId, paymentMethod, remark } = input;

  const address = await prisma.address.findUnique({ where: { id: addressId } });
  if (!address || address.userId !== userId) {
    throw ApiError.notFound('配送先住所が見つかりません');
  }

  const cart = await getOrCreateCart(userId);
  if (cart.items.length === 0) {
    throw ApiError.badRequest('カートが空です', 'EMPTY_CART');
  }

  // ここでの検証は早期にエラーメッセージを返すための事前チェックであり、確定処理ではない。
  // 確定判断は必ずトランザクション内でロック取得後に読み直したデータに対して行う（下記参照）。
  for (const item of cart.items) {
    if (item.product.status !== 'ON_SALE') {
      throw ApiError.conflict(`「${item.product.name}」は現在購入できません`, 'PRODUCT_UNAVAILABLE');
    }
    if (item.quantity > item.product.stock) {
      throw ApiError.conflict(`「${item.product.name}」の在庫が不足しています`, 'INSUFFICIENT_STOCK');
    }
  }

  const order = await prisma.$transaction(async (tx) => {
    // カート行をロックし、同一カートに対する同時チェックアウト（二重クリック等）が
    // 直列化されるようにする。先勝ちのトランザクションがカートを空にするため、
    // 後続のトランザクションはロック解放後に「カートが空」として弾かれる。
    await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${cart.id} FOR UPDATE`;

    const freshItems = await tx.cartItem.findMany({
      where: { cartId: cart.id },
      include: { product: true },
    });
    if (freshItems.length === 0) {
      throw ApiError.badRequest('カートが空です（既に注文が完了している可能性があります）', 'EMPTY_CART');
    }

    for (const item of freshItems) {
      if (item.product.status !== 'ON_SALE') {
        throw ApiError.conflict(`「${item.product.name}」は現在購入できません`, 'PRODUCT_UNAVAILABLE');
      }
      const updated = await tx.product.updateMany({
        where: { id: item.productId, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity }, salesCount: { increment: item.quantity } },
      });
      if (updated.count === 0) {
        throw ApiError.conflict(`「${item.product.name}」の在庫が不足しています`, 'INSUFFICIENT_STOCK');
      }
    }

    const subtotal = freshItems.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);

    const shippingFee = calculateShippingFee(subtotal);
    const totalAmount = Math.max(0, subtotal + shippingFee);

    const createdOrder = await tx.order.create({
      data: {
        orderNo: generateOrderNo(),
        userId,
        addressId,
        addressSnapshot: address as unknown as Prisma.InputJsonValue,
        subtotal,
        shippingFee,
        totalAmount,
        paymentMethod,
        remark,
        items: {
          create: freshItems.map((item) => ({
            productId: item.productId,
            productName: item.product.name,
            productImage: item.product.images[0],
            price: item.product.price,
            quantity: item.quantity,
          })),
        },
      },
      include: { items: true },
    });

    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return createdOrder;
  });

  // 通知はここまでの処理が確定してから行う。送信可否は注文の成否に影響させない。
  notifyOrderPlaced(order.id);

  return order;
}

/**
 * 決済ページ（KOMOJUのセッション）を用意し、購入者を送り出すURLを返す。
 *
 * ここでは注文を支払い済みにしない。ブラウザからの要求で支払い済みにできてしまうと、
 * 実際には入金がないまま商品を発送することになるため、支払いの確定は
 * KOMOJUからのWebhook（署名付き）だけが行う。
 */
export async function createPaymentSession(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: { select: { email: true } } },
  });
  if (!order || order.userId !== userId) throw ApiError.notFound('注文が見つかりません');
  if (order.status !== 'PENDING_PAYMENT') {
    throw ApiError.conflict('この注文は支払い待ち状態ではありません', 'INVALID_ORDER_STATUS');
  }
  const method = order.paymentMethod;
  if (method !== 'CREDIT_CARD' && method !== 'PAYPAY') {
    throw ApiError.badRequest('この注文はオンライン決済の対象ではありません', 'NOT_ONLINE_PAYMENT');
  }

  const session = await komoju.createPaymentSession({
    amount: Number(order.totalAmount),
    method,
    email: order.user.email,
    returnUrl: `${env.siteUrl}/order-detail.html?id=${order.id}`,
    orderId: order.id,
    orderNo: order.orderNo,
    userId,
    lineItems: order.items.map((i) => ({
      name: i.productName,
      amount: Number(i.price),
      quantity: i.quantity,
    })),
  });

  // Webhookで届く決済通知をこの注文に結び付けるための控え
  await prisma.order.update({ where: { id: orderId }, data: { paymentSessionId: session.id } });
  return { paymentUrl: session.session_url };
}

/**
 * 入金を確定して注文を支払い済みにする。Webhookからのみ呼ばれる。
 * 同じ通知が複数回届いても二重に処理されないよう、条件付き更新で確定させる。
 */
export async function markOrderPaid(orderId: string, paymentId: string) {
  const paid = await prisma.order.updateMany({
    where: { id: orderId, status: 'PENDING_PAYMENT' },
    data: { status: 'PAID', paidAt: new Date(), paymentId },
  });
  if (paid.count === 0) return false;
  notifyOwnerOrderPaid(orderId);
  return true;
}

/**
 * 返金の完了を記録する。Webhookからのみ呼ばれる。
 * 店主が管理画面で返金操作をした時点ではKOMOJUへ依頼するだけで、
 * 実際に返金が成立したことはこの通知で確定させる。
 */
export async function markOrderRefunded(orderId: string) {
  const updated = await prisma.order.updateMany({
    where: { id: orderId, status: { in: ['PAID', 'SHIPPED', 'COMPLETED'] } },
    data: { status: 'REFUNDED', refundedAt: new Date() },
  });
  return updated.count > 0;
}

export async function cancelOrder(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.userId !== userId) throw ApiError.notFound('注文が見つかりません');

  return prisma.$transaction(async (tx) => {
    // 先に状態遷移を条件付きで確定させ、競合に勝ったリクエストだけが在庫を戻す。
    // 順序を逆にすると、連打時に同じ注文分の在庫が何度も加算され、
    // 実際には存在しない在庫を店主が売ってしまう。
    const cancelled = await tx.order.updateMany({
      where: { id: orderId, status: 'PENDING_PAYMENT' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    if (cancelled.count === 0) {
      throw ApiError.conflict('支払い待ちの注文のみキャンセルできます', 'INVALID_ORDER_STATUS');
    }
    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity }, salesCount: { decrement: item.quantity } },
      });
    }
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  });
}

export async function confirmReceipt(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) throw ApiError.notFound('注文が見つかりません');

  const completed = await prisma.order.updateMany({
    where: { id: orderId, status: 'SHIPPED' },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  if (completed.count === 0) {
    throw ApiError.conflict('発送済みの注文のみ受取確認できます', 'INVALID_ORDER_STATUS');
  }
  return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}

const ADMIN_TRANSITIONS: Record<string, string[]> = {
  PAID: ['SHIPPED', 'REFUNDED'],
  SHIPPED: ['COMPLETED', 'REFUNDED'],
  // 代金引換は商品と引き換えに支払われるため、支払い待ちのまま発送する。
  // オンライン決済の注文は入金前に発送させない（下の isCashOnDelivery で判定）。
  PENDING_PAYMENT: ['CANCELLED', 'SHIPPED'],
};

const isCashOnDelivery = (order: { paymentMethod: string | null }) => order.paymentMethod === 'COD';

export async function adminUpdateStatus(orderId: string, nextStatus: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw ApiError.notFound('注文が見つかりません');
  const allowed = ADMIN_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw ApiError.conflict(`「${order.status}」から「${nextStatus}」への変更はできません`, 'INVALID_TRANSITION');
  }
  if (order.status === 'PENDING_PAYMENT' && nextStatus === 'SHIPPED' && !isCashOnDelivery(order)) {
    throw ApiError.conflict('入金が確認できていないため発送できません', 'PAYMENT_NOT_CONFIRMED');
  }

  // 返金は先に決済会社へ依頼する。依頼が通らないうちに「返金済み」と表示すると、
  // 実際にはお金が戻っていないのに戻ったことになってしまう。
  // 実際の反映はKOMOJUからの payment.refunded 通知で確定させる。
  if (nextStatus === 'REFUNDED' && order.paymentId && komoju.isKomojuConfigured()) {
    await komoju.refundPayment(order.paymentId, `注文 ${order.orderNo} の返金`);
  }

  const timestampField =
    nextStatus === 'SHIPPED'
      ? 'shippedAt'
      : nextStatus === 'COMPLETED'
        ? 'completedAt'
        : nextStatus === 'CANCELLED'
          ? 'cancelledAt'
          : nextStatus === 'REFUNDED'
            ? 'refundedAt'
            : undefined;

  // 遷移元のステータスを更新条件に含める。判定に使った状態が更新までの間に
  // 購入者側の操作（受取確認・キャンセル）で変わっていた場合は、
  // 古い前提のまま上書きせず、画面の再読み込みを促す。
  const updated = await prisma.order.updateMany({
    where: { id: orderId, status: order.status },
    data: {
      status: nextStatus as never,
      ...(timestampField ? { [timestampField]: new Date() } : {}),
    },
  });
  if (updated.count === 0) {
    throw ApiError.conflict('注文の状態が変更されました。画面を再読み込みしてください', 'INVALID_TRANSITION');
  }
  if (nextStatus === 'SHIPPED') notifyOrderShipped(orderId);
  return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}
