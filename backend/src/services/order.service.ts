import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/apiError';
import { generateOrderNo } from '../utils/orderNo';
import { getOrCreateCart } from './cart.service';
import { calculateShippingFee } from '../config/shipping';

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

  return order;
}

export async function payOrder(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) throw ApiError.notFound('注文が見つかりません');

  // モック決済: 常に成功として扱う（実決済ゲートウェイに差し替え可能なインターフェース）。
  // 状態の確認と更新を1つの条件付き更新に閉じ込め、二重クリックや通信リトライで
  // 決済処理が複数回走らないようにする（実決済に差し替えた際の多重課金を防ぐ）。
  const paid = await prisma.order.updateMany({
    where: { id: orderId, status: 'PENDING_PAYMENT' },
    data: { status: 'PAID', paidAt: new Date() },
  });
  if (paid.count === 0) {
    throw ApiError.conflict('この注文は支払い待ち状態ではありません', 'INVALID_ORDER_STATUS');
  }
  return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
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
  PENDING_PAYMENT: ['CANCELLED'],
};

export async function adminUpdateStatus(orderId: string, nextStatus: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw ApiError.notFound('注文が見つかりません');
  const allowed = ADMIN_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw ApiError.conflict(`「${order.status}」から「${nextStatus}」への変更はできません`, 'INVALID_TRANSITION');
  }
  const timestampField =
    nextStatus === 'SHIPPED' ? 'shippedAt' : nextStatus === 'COMPLETED' ? 'completedAt' : nextStatus === 'CANCELLED' ? 'cancelledAt' : undefined;

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
  return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}
