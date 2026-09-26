import type { Order } from '../../api/types';
import {
  awaitsCustomerPaid,
  awaitsExecutorReceived,
  canCancel,
  canDecline,
  canDispute,
  isChatOpen,
  isNewJob,
  nextExecutorStep,
  paymentKind,
  statusColor,
  timelineSteps,
} from '../status';

const timeline: Order['timeline'] = {
  created_at: '2026-09-26T04:40:00Z',
  accepted_at: null,
  departed_at: null,
  arrived_at: null,
  started_at: null,
  finished_at: null,
  customer_paid_at: null,
  executor_received_at: null,
  paid_at: null,
  disputed_at: null,
  cancelled_at: null,
};

describe('order status rules (docs/01 §3.3)', () => {
  it('lets the customer cancel until the pro arrives', () => {
    expect(canCancel('PUBLISHED')).toBe(true);
    expect(canCancel('EN_ROUTE')).toBe(true);
    expect(canCancel('ARRIVED')).toBe(false);
  });

  it('lets the executor withdraw only before arriving', () => {
    expect(canDecline('ACCEPTED')).toBe(true);
    expect(canDecline('IN_PROGRESS')).toBe(false);
  });

  it('opens the chat after acceptance only', () => {
    expect(isChatOpen('PUBLISHED')).toBe(false);
    expect(isChatOpen('ACCEPTED')).toBe(true);
    expect(isChatOpen('PAID')).toBe(false);
  });

  it('walks the executor through depart, arrive, start, finish', () => {
    expect(nextExecutorStep('ACCEPTED')).toBe('depart');
    expect(nextExecutorStep('EN_ROUTE')).toBe('arrive');
    expect(nextExecutorStep('ARRIVED')).toBe('start');
    expect(nextExecutorStep('IN_PROGRESS')).toBe('finish');
    expect(nextExecutorStep('DONE_BY_EXECUTOR')).toBeNull();
  });

  it('colors statuses like BY1', () => {
    expect(statusColor('PUBLISHED')).toBe('orange');
    expect(statusColor('DONE_BY_EXECUTOR')).toBe('brandText');
    expect(statusColor('PAID')).toBe('green');
    expect(statusColor('CANCELLED')).toBe('red');
  });

  it('groups payment methods for the BJ1 filter', () => {
    expect(paymentKind('CASH')).toBe('cash');
    expect(paymentKind('XOLIS_QR')).toBe('cash');
    expect(paymentKind('PAYME')).toBe('online');
  });

  it('asks for the two confirmations only on cash and Xolis jobs (§5.1)', () => {
    expect(awaitsCustomerPaid({ status: 'DONE_BY_EXECUTOR', payment_method: 'CASH' })).toBe(true);
    expect(awaitsCustomerPaid({ status: 'COMPLETED', payment_method: 'CASH' })).toBe(false);
    expect(awaitsCustomerPaid({ status: 'DONE_BY_EXECUTOR', payment_method: 'CLICK' })).toBe(false);

    expect(awaitsExecutorReceived({ status: 'DONE_BY_EXECUTOR', payment_method: 'XOLIS_QR' })).toBe(
      true,
    );
    expect(awaitsExecutorReceived({ status: 'COMPLETED', payment_method: 'CASH' })).toBe(true);
    expect(awaitsExecutorReceived({ status: 'PAID', payment_method: 'CASH' })).toBe(false);

    expect(canDispute('COMPLETED')).toBe(true);
    expect(canDispute('IN_PROGRESS')).toBe(false);
  });

  it('marks jobs posted in the last minutes as new', () => {
    const now = new Date('2026-09-26T08:00:00Z');
    expect(isNewJob('2026-09-26T07:58:00Z', now)).toBe(true);
    expect(isNewJob('2026-09-26T07:30:00Z', now)).toBe(false);
  });
});

describe('timelineSteps (BY3)', () => {
  const states = (order: Pick<Order, 'status' | 'timeline'>) =>
    timelineSteps(order).map((step) => `${step.key}:${step.state}`);

  it('shows the latest reached step as current', () => {
    expect(
      states({
        status: 'DONE_BY_EXECUTOR',
        timeline: {
          ...timeline,
          accepted_at: '2026-09-26T04:52:00Z',
          departed_at: '2026-09-26T05:00:00Z',
          arrived_at: '2026-09-26T05:41:00Z',
          started_at: '2026-09-26T05:45:00Z',
          finished_at: '2026-09-26T08:40:00Z',
        },
      }),
    ).toEqual([
      'created:done',
      'accepted:done',
      'departed:done',
      'arrived:done',
      'started:done',
      'finished:current',
      'payment:todo',
    ]);
  });

  it('starts with the published step', () => {
    expect(states({ status: 'PUBLISHED', timeline })[0]).toBe('created:current');
  });

  it('ends a cancelled order with the cancellation', () => {
    expect(
      states({
        status: 'CANCELLED',
        timeline: { ...timeline, cancelled_at: '2026-09-26T05:00:00Z' },
      }),
    ).toEqual(['created:done', 'cancelled:current']);
  });

  it('marks everything done once paid', () => {
    const done = timelineSteps({
      status: 'PAID',
      timeline: { ...timeline, accepted_at: '2026-09-26T04:52:00Z' },
    });
    expect(done.at(-1)).toEqual({ key: 'payment', at: null, state: 'done' });
  });

  it('shows when the payment was confirmed', () => {
    const paidAt = '2026-09-26T09:00:00Z';
    const steps = timelineSteps({ status: 'PAID', timeline: { ...timeline, paid_at: paidAt } });
    expect(steps.at(-1)).toEqual({ key: 'payment', at: paidAt, state: 'done' });
  });

  it('ends a disputed order with the dispute', () => {
    expect(
      states({
        status: 'DISPUTED',
        timeline: {
          ...timeline,
          finished_at: '2026-09-26T08:40:00Z',
          disputed_at: '2026-09-26T09:00:00Z',
        },
      }),
    ).toEqual(['created:done', 'finished:done', 'disputed:current']);
  });
});
