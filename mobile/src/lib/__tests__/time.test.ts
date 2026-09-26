import {
  ago,
  clock,
  dayLabel,
  dayOffset,
  endSlots,
  kmValue,
  listTime,
  minutesLabel,
  startSlots,
  tashkentDateTime,
} from '../time';

const now = new Date('2026-09-26T08:00:00Z'); // 13:00 in Tashkent

describe('Tashkent time helpers', () => {
  it('uses the Tashkent calendar day', () => {
    expect(dayOffset(new Date('2026-09-26T18:59:00Z'), now)).toBe(0); // 23:59 local
    expect(dayOffset(new Date('2026-09-26T19:00:00Z'), now)).toBe(1); // 00:00 next day
    expect(clock(new Date('2026-09-26T05:41:00Z'))).toBe('10:41');
  });

  it('labels days and list times like BY1', () => {
    expect(dayLabel(new Date('2026-09-27T05:00:00Z'), now)).toEqual({ key: 'common.tomorrow' });
    expect(dayLabel(new Date('2026-09-25T05:00:00Z'), now)).toEqual({ key: 'common.yesterday' });
    expect(dayLabel(new Date('2026-09-21T05:00:00Z'), now)).toEqual({ date: '21.09' });
    expect(listTime(new Date('2026-09-26T08:40:00Z'), now)).toEqual({ time: '13:40' });
  });

  it('says how long ago a job was posted', () => {
    expect(ago(new Date(now.getTime() - 20_000), now)).toEqual({ key: 'common.justNow' });
    expect(ago(new Date(now.getTime() - 2 * 60_000), now)).toEqual({
      key: 'common.minutesAgo',
      n: 2,
    });
    expect(ago(new Date(now.getTime() - 3 * 3_600_000), now)).toEqual({
      key: 'common.hoursAgo',
      n: 3,
    });
  });

  it('builds absolute times from a Tashkent day and minutes', () => {
    expect(tashkentDateTime(0, 10 * 60 + 30, now).toISOString()).toBe('2026-09-26T05:30:00.000Z');
    expect(tashkentDateTime(1, 0, now).toISOString()).toBe('2026-09-26T19:00:00.000Z');
  });

  it('rounds distances to 0.1 km', () => {
    expect(kmValue(1234)).toBe('1.2');
    expect(kmValue(50)).toBe('0.1');
  });
});

describe('time sheet slots', () => {
  it('offers today only the half hours still ahead', () => {
    expect(startSlots(0, now)[0]).toBe(13 * 60 + 30); // 13:00 now → 13:30
    expect(startSlots(0, new Date('2026-09-26T08:10:00Z'))[0]).toBe(13 * 60 + 30);
    expect(startSlots(1, now)[0]).toBe(0);
    expect(startSlots(1, now).at(-1)).toBe(23 * 60);
  });

  it('offers end times after the start', () => {
    expect(endSlots(22 * 60)).toEqual([22 * 60 + 30, 23 * 60, 23 * 60 + 30]);
    expect(endSlots(23 * 60 + 30)).toEqual([]);
    expect(minutesLabel(10 * 60 + 30)).toBe('10:30');
  });
});
