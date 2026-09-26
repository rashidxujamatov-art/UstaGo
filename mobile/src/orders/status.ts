import type { Order, OrderStatus, PaymentMethod } from '../api/types';
import type { ColorToken } from '../theme/tokens';

/**
 * Order status rules the screens need. They mirror backend/src/modules/orders/order-state.ts
 * (docs/01-biznes-qoidalar.md §3); the backend still checks every action.
 */

/** BY1 "Faol". */
export const ACTIVE_STATUSES: readonly OrderStatus[] = [
  'PUBLISHED',
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'DONE_BY_EXECUTOR',
  'COMPLETED',
  'DISPUTED',
];

/** BY1 "Yakunlangan". */
export const FINISHED_STATUSES: readonly OrderStatus[] = ['PAID', 'CANCELLED'];

/** The customer may cancel until the pro arrives (§3.3). */
export function canCancel(status: OrderStatus): boolean {
  return status === 'PUBLISHED' || status === 'ACCEPTED' || status === 'EN_ROUTE';
}

/** The executor may give the job back before arriving (§3.3). */
export function canDecline(status: OrderStatus): boolean {
  return status === 'ACCEPTED' || status === 'EN_ROUTE';
}

/** BY4 is open from acceptance until the job is closed. */
export function isChatOpen(status: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(status) && status !== 'PUBLISHED';
}

/** Button the executor sees next on an active job. */
export type ExecutorStep = 'depart' | 'arrive' | 'start' | 'finish';

export function nextExecutorStep(status: OrderStatus): ExecutorStep | null {
  switch (status) {
    case 'ACCEPTED':
      return 'depart';
    case 'EN_ROUTE':
      return 'arrive';
    case 'ARRIVED':
      return 'start';
    case 'IN_PROGRESS':
      return 'finish';
    default:
      return null;
  }
}

/** Color of the status text in lists (BY1): searching, in work, done, cancelled. */
export function statusColor(status: OrderStatus): ColorToken {
  switch (status) {
    case 'PUBLISHED':
      return 'orange';
    case 'PAID':
      return 'green';
    case 'CANCELLED':
    case 'DISPUTED':
      return 'red';
    default:
      return 'brandText';
  }
}

/** BJ1 filter groups: cash-like methods are settled between the two people (§5.1). */
export function paymentKind(method: PaymentMethod): 'cash' | 'online' {
  return method === 'CASH' || method === 'XOLIS_QR' ? 'cash' : 'online';
}

/** BY9: the customer of a cash / Xolis job can press "To'ladim". */
export function awaitsCustomerPaid(order: Pick<Order, 'status' | 'payment_method'>): boolean {
  return order.status === 'DONE_BY_EXECUTOR' && paymentKind(order.payment_method) === 'cash';
}

/** BJ13: the executor of a cash / Xolis job can press "Pulni qabul qildim" (§5.1). */
export function awaitsExecutorReceived(order: Pick<Order, 'status' | 'payment_method'>): boolean {
  return (
    (order.status === 'DONE_BY_EXECUTOR' || order.status === 'COMPLETED') &&
    paymentKind(order.payment_method) === 'cash'
  );
}

/** "Muammo bor" / "Pul kelmadi" open a dispute once the work is reported done. */
export function canDispute(status: OrderStatus): boolean {
  return status === 'DONE_BY_EXECUTOR' || status === 'COMPLETED';
}

/** How long a job carries the "Yangi" chip on BJ1. A display choice, not a business rule. */
const NEW_JOB_MS = 10 * 60 * 1000;

export function isNewJob(createdAt: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(createdAt).getTime() < NEW_JOB_MS;
}

export type TimelineKey =
  | 'created'
  | 'accepted'
  | 'departed'
  | 'arrived'
  | 'started'
  | 'finished'
  | 'payment'
  | 'cancelled'
  | 'disputed';

export interface TimelineStep {
  key: TimelineKey;
  at: string | null;
  state: 'done' | 'current' | 'todo';
}

/**
 * BY3 "Buyurtma holati": reached steps are done, the latest one is current while the job
 * goes on, the rest are still to come. A cancelled order ends with the cancellation.
 */
export function timelineSteps(order: Pick<Order, 'status' | 'timeline'>): TimelineStep[] {
  const { timeline } = order;
  const stamped: { key: TimelineKey; at: string | null }[] = [
    { key: 'created', at: timeline.created_at },
    { key: 'accepted', at: timeline.accepted_at },
    { key: 'departed', at: timeline.departed_at },
    { key: 'arrived', at: timeline.arrived_at },
    { key: 'started', at: timeline.started_at },
    { key: 'finished', at: timeline.finished_at },
  ];

  if (order.status === 'CANCELLED' || order.status === 'DISPUTED') {
    const end: TimelineStep =
      order.status === 'CANCELLED'
        ? { key: 'cancelled', at: timeline.cancelled_at, state: 'current' }
        : { key: 'disputed', at: timeline.disputed_at, state: 'current' };
    return [
      ...stamped.filter((step) => step.at).map((step) => ({ ...step, state: 'done' as const })),
      end,
    ];
  }

  const paid = order.status === 'PAID';
  const steps = [...stamped, { key: 'payment' as const, at: timeline.paid_at }];
  const lastReached = paid ? steps.length - 1 : stamped.findLastIndex((step) => step.at);
  return steps.map((step, index) => ({
    ...step,
    state:
      index < lastReached || (paid && index === lastReached)
        ? 'done'
        : index === lastReached
          ? 'current'
          : 'todo',
  }));
}
