import type { Prisma } from '../../generated/prisma/client.js';
import { HOLDING_STATUSES } from './order-state.js';

export const orderInclude = {
  category: { select: { id: true, slug: true, names: true, icon: true, color: true } },
  customer: {
    select: {
      id: true,
      phone: true,
      identity: { select: { firstName: true, lastName: true } },
      _count: { select: { customerOrders: true } },
    },
  },
  executor: {
    select: { id: true, phone: true, identity: { select: { firstName: true, lastName: true } } },
  },
} satisfies Prisma.OrderInclude;

export type OrderWithParties = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export type Viewer = { userId: string };

export interface OrderView {
  id: string;
  number: number;
  status: string;
  category: { id: string; slug: string; names: unknown; icon: string; color: string };
  title: string;
  description: string;
  photos: string[];
  address: {
    text: string;
    lat: number;
    lng: number;
    entrance: string | null;
    floor: string | null;
    apartment: string | null;
    landmark: string | null;
  };
  time_from: string;
  time_to: string;
  price: string;
  payment_method: string;
  customer: {
    id: string;
    first_name: string;
    last_initial: string;
    orders_count: number;
    phone: string | null;
  };
  executor: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  /** Service fee reserved at acceptance and its rate snapshot; shown to the executor only (BJ2). */
  fee: { fee: string; fee_demo: string; fee_real: string; fee_bps: number | null } | null;
  timeline: {
    created_at: string;
    accepted_at: string | null;
    departed_at: string | null;
    arrived_at: string | null;
    started_at: string | null;
    finished_at: string | null;
    /** Cash / Xolis: the customer's "To'ladim" (§5.1). */
    customer_paid_at: string | null;
    /** Cash / Xolis: the executor's "Pulni qabul qildim". */
    executor_received_at: string | null;
    paid_at: string | null;
    disputed_at: string | null;
    cancelled_at: string | null;
  };
  /** Who opened the dispute ("Pul kelmadi" / "Muammo bor"). */
  dispute: { by_me: boolean } | null;
  cancel: { reason: string | null; by_me: boolean; by_system: boolean } | null;
  finish_photos: string[];
  /** BY9: the pro's Paynet Xolis QR, offered instead of cash when they use Xolis. */
  xolis_qr: string | null;
  distance_m: number | null;
  viewer_role: 'CUSTOMER' | 'EXECUTOR' | 'OTHER';
}

const iso = (date: Date | null) => (date ? date.toISOString() : null);

/**
 * Builds the API view of an order for a given viewer (docs/01-biznes-qoidalar.md §3.4):
 * the address is public for published jobs, phone numbers only between the two parties
 * after acceptance, the fee split only for the executor.
 */
export function toOrderView(
  order: OrderWithParties,
  viewer: Viewer,
  extras: {
    photoUrls: string[];
    finishPhotoUrls: string[];
    distanceM?: number | null;
    xolisQr?: string | null;
  },
): OrderView {
  const isCustomer = order.customerId === viewer.userId;
  const isExecutor = order.executorId !== null && order.executorId === viewer.userId;
  const engaged = HOLDING_STATUSES.includes(order.status);

  const customerName = order.customer.identity;
  const executorName = order.executor?.identity;

  return {
    id: order.id,
    number: order.number,
    status: order.status,
    category: order.category,
    title: order.title,
    description: order.description,
    photos: extras.photoUrls,
    address: {
      text: order.addressText,
      lat: order.lat,
      lng: order.lng,
      entrance: order.entrance,
      floor: order.floor,
      apartment: order.apartment,
      landmark: order.landmark,
    },
    time_from: order.timeFrom.toISOString(),
    time_to: order.timeTo.toISOString(),
    price: order.price.toString(),
    payment_method: order.paymentMethod,
    customer: {
      id: order.customer.id,
      first_name: customerName?.firstName ?? '',
      last_initial: customerName?.lastName.slice(0, 1) ?? '',
      orders_count: order.customer._count.customerOrders,
      phone: isExecutor && engaged ? order.customer.phone : null,
    },
    executor:
      order.executor && (isCustomer || isExecutor)
        ? {
            id: order.executor.id,
            first_name: executorName?.firstName ?? '',
            last_name: executorName?.lastName ?? '',
            phone: isCustomer && engaged ? order.executor.phone : null,
          }
        : null,
    fee:
      isExecutor && order.fee !== null
        ? {
            fee: order.fee.toString(),
            fee_demo: (order.feeDemo ?? 0n).toString(),
            fee_real: (order.feeReal ?? 0n).toString(),
            fee_bps: order.feeBpsSnapshot,
          }
        : null,
    timeline: {
      created_at: order.createdAt.toISOString(),
      accepted_at: iso(order.acceptedAt),
      departed_at: iso(order.departedAt),
      arrived_at: iso(order.arrivedAt),
      started_at: iso(order.startedAt),
      finished_at: iso(order.finishedAt),
      customer_paid_at: iso(order.customerPaidAt),
      executor_received_at: iso(order.executorReceivedAt),
      paid_at: iso(order.paidAt),
      disputed_at: iso(order.disputedAt),
      cancelled_at: iso(order.cancelledAt),
    },
    dispute: order.disputedAt ? { by_me: order.disputedBy === viewer.userId } : null,
    cancel:
      order.status === 'CANCELLED'
        ? {
            reason: order.cancelReason,
            by_me: order.cancelledBy === viewer.userId,
            by_system: order.cancelledBy === null,
          }
        : null,
    finish_photos: extras.finishPhotoUrls,
    xolis_qr: extras.xolisQr ?? null,
    distance_m: extras.distanceM ?? null,
    viewer_role: isCustomer ? 'CUSTOMER' : isExecutor ? 'EXECUTOR' : 'OTHER',
  };
}
