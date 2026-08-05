import { newestDayFirst, newestDrawFirst } from './result-order';

describe('result history ordering', () => {
  it('orders draws from newest to oldest without mutating their timestamps', () => {
    const draws = [
      { scheduledAt: '2026-08-01T17:00:00Z' },
      { scheduledAt: '2026-08-02T21:00:00Z' },
      { scheduledAt: '2026-08-02T17:00:00Z' },
    ];

    expect([...draws].sort(newestDrawFirst).map((draw) => draw.scheduledAt)).toEqual([
      '2026-08-02T21:00:00Z',
      '2026-08-02T17:00:00Z',
      '2026-08-01T17:00:00Z',
    ]);
  });

  it('orders business days from newest to oldest', () => {
    const days = [{ date: '2026-07-31' }, { date: '2026-08-02' }, { date: '2026-08-01' }];

    expect([...days].sort(newestDayFirst).map((day) => day.date)).toEqual([
      '2026-08-02',
      '2026-08-01',
      '2026-07-31',
    ]);
  });
});
