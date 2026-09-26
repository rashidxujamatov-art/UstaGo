import { canTransition, cancelNeedsReason, ORDER_RULES } from './order-state.js';

describe('order state machine (docs/01-biznes-qoidalar.md §3.3)', () => {
  it('lets only the executor move the job forward, one step at a time', () => {
    expect(canTransition('ACCEPT', 'EXECUTOR', 'PUBLISHED')).toBe(true);
    expect(canTransition('DEPART', 'EXECUTOR', 'ACCEPTED')).toBe(true);
    expect(canTransition('ARRIVE', 'EXECUTOR', 'EN_ROUTE')).toBe(true);
    expect(canTransition('START', 'EXECUTOR', 'ARRIVED')).toBe(true);
    expect(canTransition('FINISH', 'EXECUTOR', 'IN_PROGRESS')).toBe(true);

    expect(canTransition('ACCEPT', 'CUSTOMER', 'PUBLISHED')).toBe(false);
    expect(canTransition('START', 'EXECUTOR', 'EN_ROUTE')).toBe(false);
    expect(canTransition('FINISH', 'EXECUTOR', 'ARRIVED')).toBe(false);
  });

  it('lets the executor withdraw only before arriving; the job reopens', () => {
    expect(ORDER_RULES.DECLINE.to).toBe('PUBLISHED');
    expect(canTransition('DECLINE', 'EXECUTOR', 'ACCEPTED')).toBe(true);
    expect(canTransition('DECLINE', 'EXECUTOR', 'EN_ROUTE')).toBe(true);
    expect(canTransition('DECLINE', 'EXECUTOR', 'ARRIVED')).toBe(false);
  });

  it('lets the customer cancel until the pro arrives, with a reason once taken', () => {
    expect(canTransition('CANCEL', 'CUSTOMER', 'PUBLISHED')).toBe(true);
    expect(canTransition('CANCEL', 'CUSTOMER', 'EN_ROUTE')).toBe(true);
    expect(canTransition('CANCEL', 'CUSTOMER', 'ARRIVED')).toBe(false);
    expect(canTransition('CANCEL', 'CUSTOMER', 'DONE_BY_EXECUTOR')).toBe(false);

    expect(cancelNeedsReason('PUBLISHED')).toBe(false);
    expect(cancelNeedsReason('ACCEPTED')).toBe(true);
    expect(cancelNeedsReason('EN_ROUTE')).toBe(true);
  });

  it('expires only unclaimed jobs, by the system', () => {
    expect(canTransition('EXPIRE', 'SYSTEM', 'PUBLISHED')).toBe(true);
    expect(canTransition('EXPIRE', 'SYSTEM', 'ACCEPTED')).toBe(false);
    expect(canTransition('EXPIRE', 'CUSTOMER', 'PUBLISHED')).toBe(false);
  });
});
