import type { OrderStatus } from '../../generated/prisma/client.js';

/** Who performs a transition (docs/01-biznes-qoidalar.md §3.3). */
export type OrderActor = 'CUSTOMER' | 'EXECUTOR' | 'SYSTEM';

export type OrderAction =
  'ACCEPT' | 'DECLINE' | 'DEPART' | 'ARRIVE' | 'START' | 'FINISH' | 'CANCEL' | 'EXPIRE';

interface Rule {
  actor: OrderActor;
  from: readonly OrderStatus[];
  to: OrderStatus;
}

/**
 * Transitions of stage 2 (up to DONE_BY_EXECUTOR). Payment confirmation, settlement and
 * disputes are added with stages 3-4.
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
};

export function canTransition(action: OrderAction, actor: OrderActor, from: OrderStatus): boolean {
  const rule = ORDER_RULES[action];
  return rule.actor === actor && rule.from.includes(from);
}

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
