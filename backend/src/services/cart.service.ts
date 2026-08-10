import { prisma } from '../config/prisma';
import { ApiError } from '../utils/apiError';

export async function getOrCreateCart(userId: string) {
  let cart = await prisma.cart.findUnique({
    where: { userId },
    include: { items: { include: { product: true }, orderBy: { createdAt: 'asc' } } },
  });
  if (!cart) {
    cart = await prisma.cart.create({
      data: { userId },
      include: { items: { include: { product: true }, orderBy: { createdAt: 'asc' } } },
    });
  }
  return cart;
}

export function summarizeCart(cart: Awaited<ReturnType<typeof getOrCreateCart>>) {
  const items = cart.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    quantity: item.quantity,
    product: item.product,
    subtotal: Number(item.product.price) * item.quantity,
    stockWarning: item.quantity > item.product.stock,
    unavailable: item.product.status !== 'ON_SALE',
  }));
  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalAmount = items.reduce((sum, i) => sum + i.subtotal, 0);
  // 販売終了・在庫不足の商品が1点でも含まれる場合、チェックアウト画面側で
  // ユーザーに解消(削除)を促すために立てるフラグ
  const hasUnavailableItems = items.some((i) => i.unavailable || i.stockWarning);
  return { id: cart.id, items, totalQuantity, totalAmount, hasUnavailableItems };
}

export async function addItem(userId: string, productId: string, quantity: number) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.status !== 'ON_SALE') {
    throw ApiError.notFound('商品が見つかりません');
  }
  const cart = await getOrCreateCart(userId);
  await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    update: { quantity: { increment: quantity } },
    create: { cartId: cart.id, productId, quantity },
  });
  return summarizeCart(await getOrCreateCart(userId));
}

export async function updateItem(userId: string, productId: string, quantity: number) {
  const cart = await getOrCreateCart(userId);
  const item = cart.items.find((i) => i.productId === productId);
  if (!item) throw ApiError.notFound('カートに商品がありません');
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
  return summarizeCart(await getOrCreateCart(userId));
}

export async function removeItem(userId: string, productId: string) {
  const cart = await getOrCreateCart(userId);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
  return summarizeCart(await getOrCreateCart(userId));
}

export async function clearCart(userId: string) {
  const cart = await getOrCreateCart(userId);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
}
