import { z } from 'zod';

const addressBody = z.object({
  recipient: z.string().min(1).max(50),
  phone: z.string().min(1).max(20),
  province: z.string().min(1).max(50),
  city: z.string().min(1).max(50),
  district: z.string().min(1).max(50),
  detail: z.string().min(1).max(200),
  postalCode: z.string().max(20).optional(),
  isDefault: z.boolean().optional(),
});

export const createAddressSchema = z.object({ body: addressBody });
export const updateAddressSchema = z.object({
  body: addressBody.partial(),
  params: z.object({ id: z.string().uuid() }),
});
