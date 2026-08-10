import { z } from 'zod';

export const checkoutSchema = z.object({
  body: z.object({
    addressId: z.string().uuid(),
    paymentMethod: z.enum(['MOCK_CARD', 'MOCK_WALLET', 'COD']).default('MOCK_CARD'),
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
  }),
  params: z.object({ id: z.string().uuid() }),
});
