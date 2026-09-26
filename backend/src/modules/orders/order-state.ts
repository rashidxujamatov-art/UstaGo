import type { OrderStatus, PaymentMethod } from '../../generated/prisma/client.js';

/** Who performs a transition (docs/01-biznes-qoidalar.md §3.3). */
export type OrderActor = 'CUSTOMER' | 'EXECUTOR' | 'SYSTEM';

export type OrderAction =
  | 'ACCEPT'
  | 'DECLINE'
  | 'DEPART'
  | 'ARRIVE'
  | 'START'
  | 'FINISH'
  | 'CANCEL'
  | 'EXPIRE'
  | 'CUSTOMER_PAID'
  | 'PAYMENT_RECEIVED'
  | 'ONLINE_PAID'
  | 'DISPUTE';

interface Rule {
  actor: OrderActor | readonly OrderActor[];
  from: readonly OrderStatus[];
  to: OrderStatus;
}

/**
 * Order transitions. Admin decisions on disputes (DISPUTED → PAID / CANCELLED) come with
 * the admin screens of stage 7.
 */
export const ORDER_RULES: Record<OrderAction, Rule> = {
  ACCEPT: { actor: 'EXECUTOR', from: ['PUBLISHED'], to: 'ACCEPTED' },
  DECLINE: { actor: 'EXECUTOR', from: ['ACCEPTED', 'EN_ROUTE'], to: 'PUBLISHED' },
  DEPART: { actor: 'EXECUTOR', from: ['ACCEPTED'], to: 'EN_ROUTE' },
  ARRIVE: { actor: 'EXECUTOR', from: ['EN_ROUTE'], to: 'ARRIVED' },
  START: { actor: 'EXECUTOR', from: ['ARRIVED'], to: 'IN_PROGRESS' },
  FINISH: { actor: 'EXECUTOR', from: ['IN_PROGRESS'], to: 'DONE_BY_EXECUTOR' },
  CANCEL: { actor: 'CUSTOMER', from: ['PUBLISHED', 'ACCEPTED', 'EN_ROUTE'], to: 'CANCELLED' },
  EXPIRE: { actor: 'SYSTEM', from: ['PUBLISHED'], to: 'CANCELLED' },
  // Cash and Xolis: "To'ladim", then "Pulni qabul qildim" (§5.1). The executor may confirm
  // without waiting for the customer.
  CUSTOMER_PAID: { actor: 'CUSTOMER', from: ['DONE_BY_EXECUTOR'], to: 'COMPLETED' },
  PAYMENT_RECEIVED: { actor: 'EXECUTOR', from: ['DONE_BY_EXECUTOR', 'COMPLETED'], to: 'PAID' },
  // Online methods: the provider callback or the balance payment (stage 4).
  ONLINE_PAID: { actor: 'SYSTEM', from: ['DONE_BY_EXECUTOR', 'COMPLETED'], to: 'PAID' },
  // "Pul kelmadi" (executor) / "Muammo bor" (customer).
  DISPUTE: {
    actor: ['CUSTOMER', 'EXECUTOR'],
    from: ['DONE_BY_EXECUTOR', 'COMPLETED'],
    to: 'DISPUTED',
  },
};

export function canTransition(action: OrderAction, actor: OrderActor, from: OrderStatus): boolean {
  const rule = ORDER_RULES[action];
  const actors: readonly OrderActor[] = typeof rule.actor === 'string' ? [rule.actor] : rule.actor;
  return actors.includes(actor) && rule.from.includes(from);
}

/** Paid outside GTM and confirmed by both parties (§5.1). */
export const PARTY_CONFIRMED_METHODS: readonly PaymentMethod[] = ['CASH', 'XOLIS_QR'];

/** A customer must give a reason when a pro already took the job (§3.3). */
export function cancelNeedsReason(from: OrderStatus): boolean {
  return from === 'ACCEPTED' || from === 'EN_ROUTE';
}

/** Statuses in which a job holds the executor's service fee. */
export const HOLDING_STATUSES: readonly OrderStatus[] = [
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'DONE_BY_EXECUTOR',
  'COMPLETED',
  'DISPUTED',
];

/** The chat (BY4) is open between acceptance and the end of the job. */
export const CHAT_OPEN_STATUSES: readonly OrderStatus[] = [
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'DONE_BY_EXECUTOR',
  'COMPLETED',
  'DISPUTED',
];

/** Filters of the customer's order list (BY1). */
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
export const FINISHED_STATUSES: readonly OrderStatus[] = ['PAID', 'CANCELLED'];
