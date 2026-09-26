import { z } from 'zod';

/** Whole so'm as a decimal string of tiyin ("50000000" = 500 000 so'm). */
const priceTiyin = z
  .string()
  .regex(/^[1-9]\d{0,14}00$/, 'price must be whole so‘m, in tiyin')
  .transform((value) => BigInt(value));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .optional();

export const createOrderSchema = z.object({
  category_id: z.uuid(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).default(''),
  photo_keys: z.array(z.string().max(300)).max(20).default([]),
  address: z.object({
    text: z.string().trim().min(3).max(300),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    entrance: optionalText(20),
    floor: optionalText(20),
    apartment: optionalText(20),
    landmark: optionalText(200),
  }),
  time_from: z.iso.datetime({ offset: true }),
  time_to: z.iso.datetime({ offset: true }),
  price: priceTiyin,
  payment_method: z.enum(['BALANCE', 'CLICK', 'PAYME', 'CARD', 'CASH', 'XOLIS_QR']),
});
export type CreateOrderInput = z.output<typeof createOrderSchema>;

export const listOrdersSchema = z.object({
  scope: z.enum(['all', 'active', 'finished']).default('all'),
});

export const cancelOrderSchema = z
  .object({
    reason: z
      .enum(['NOT_NEEDED', 'FOUND_OTHER', 'EXECUTOR_LATE', 'NO_AGREEMENT', 'OTHER'])
      .optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.reason !== 'OTHER' || Boolean(value.note), {
    path: ['note'],
    message: 'a note is required for OTHER',
  });
export type CancelOrderInput = z.output<typeof cancelOrderSchema>;

export const feedSchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  /** "5 km gacha" (BJ1): only jobs within feed_nearby_radius_m. */
  nearby: z.enum(['true', 'false']).optional(),
  /** "Naqd" or "Karta / QR" (BJ1). */
  payment: z.enum(['cash', 'online']).optional(),
  category_id: z.uuid().optional(),
});
export type FeedQuery = z.output<typeof feedSchema>;

export const jobsSchema = z.object({
  scope: z.enum(['active', 'history']).default('active'),
});

export const finishSchema = z.object({
  photo_keys: z.array(z.string().max(300)).max(20).default([]),
});
