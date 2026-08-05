import { drawLabel } from './draw-label';

describe('drawLabel', () => {
  it('uses the compact Nicaragua label for daily and lottery draws', () => {
    expect(drawLabel({ drawType: 'DAILY', scheduledAt: '2026-08-02T17:00:00Z' }))
      .toBe('LOTO - 02/08/26 - 11AM');
    expect(drawLabel({ drawType: 'NATIONAL_LOTTERY', scheduledAt: '2026-08-03T00:00:00Z' }))
      .toBe('Lotería - 02/08/26 - 6PM');
  });
});
