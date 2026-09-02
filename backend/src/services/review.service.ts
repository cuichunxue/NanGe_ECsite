import { prisma } from '../config/prisma';
import { ApiError } from '../utils/apiError';

export async function createReview(
  userId: string,
  input: { productId: string; orderId: string; rating: number; content: string; images: string[] },
) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId }, include: { items: true } });
  if (!order || order.userId !== userId) {
    throw ApiError.notFound('注文が見つかりません');
  }
  if (order.status !== 'COMPLETED') {
    throw ApiError.conflict('受取完了後の商品のみレビュー可能です', 'ORDER_NOT_COMPLETED');
  }
  const purchased = order.items.some((item) => item.productId === input.productId);
  if (!purchased) {
    throw ApiError.badRequest('この注文にはこの商品が含まれていません', 'PRODUCT_NOT_IN_ORDER');
  }
  const existing = await prisma.review.findFirst({ where: { userId, orderId: input.orderId, productId: input.productId } });
  if (existing) {
    throw ApiError.conflict('この商品は既にレビュー済みです', 'REVIEW_EXISTS');
  }

  return prisma.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        productId: input.productId,
        userId,
        orderId: input.orderId,
        rating: input.rating,
        content: input.content,
        images: input.images,
      },
    });

    const agg = await tx.review.aggregate({
      where: { productId: input.productId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await tx.product.update({
      where: { id: input.productId },
      data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count.rating },
    });

    return review;
  });
}

export async function deleteReview(reviewId: string) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw ApiError.notFound('レビューが見つかりません');

  return prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id: reviewId } });
    const agg = await tx.review.aggregate({
      where: { productId: review.productId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await tx.product.update({
      where: { id: review.productId },
      data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count.rating },
    });
  });
}
