import { z } from 'zod';
import { CARRIER_KEYS } from '../config/carrier';

export const checkoutSchema = z.object({
  body: z.object({
    addressId: z.string().uuid(),
    // CREDIT_CARD / PAYPAY はKOMOJUの決済ページへ遷移する。COD(代金引換)は現地払い。
    paymentMethod: z.enum(['CREDIT_CARD', 'PAYPAY', 'COD']).default('CREDIT_CARD'),
    remark: z.string().max(200).optional(),
  }),
});

export const listOrdersQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z
      .enum(['PENDING_PAYMENT', 'PAID', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED'])
      .optional(),
  }),
});

export const updateOrderStatusSchema = z.object({
  body: z.object({
    status: z.enum(['PAID', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED']),
    // 発送時のみ使う。追跡に対応しない発送方法（定形外郵便など）もあるため任意。
    carrier: z.enum(CARRIER_KEYS as [string, ...string[]]).optional(),
    trackingNumber: z.string().trim().max(64).optional(),
  }),
  params: z.object({ id: z.string().uuid() }),
});
