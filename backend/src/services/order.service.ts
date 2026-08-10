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
  if (order.status !== 'PENDING_PAYMENT') {
    throw ApiError.conflict('この注文は支払い待ち状態ではありません', 'INVALID_ORDER_STATUS');
  }
  // モック決済: 常に成功として扱う（実決済ゲートウェイに差し替え可能なインターフェース）
  return prisma.order.update({ where: { id: orderId }, data: { status: 'PAID', paidAt: new Date() } });
}

export async function cancelOrder(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.userId !== userId) throw ApiError.notFound('注文が見つかりません');
  if (order.status !== 'PENDING_PAYMENT') {
    throw ApiError.conflict('支払い待ちの注文のみキャンセルできます', 'INVALID_ORDER_STATUS');
  }
  return prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity }, salesCount: { decrement: item.quantity } },
      });
    }
    return tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
  });
}

export async function confirmReceipt(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) throw ApiError.notFound('注文が見つかりません');
  if (order.status !== 'SHIPPED') {
    throw ApiError.conflict('発送済みの注文のみ受取確認できます', 'INVALID_ORDER_STATUS');
  }
  return prisma.order.update({ where: { id: orderId }, data: { status: 'COMPLETED', completedAt: new Date() } });
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

  return prisma.order.update({
    where: { id: orderId },
    data: {
      status: nextStatus as never,
      ...(timestampField ? { [timestampField]: new Date() } : {}),
    },
  });
}
