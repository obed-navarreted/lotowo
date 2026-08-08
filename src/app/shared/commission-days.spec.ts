import { SellerCommissionReport } from '../core/models/api.models';
import { groupCommissionsByDay } from './commission-days';

function entry(drawId: string, scheduledAt: string, gross: number, prizes: number, commission: number) {
  return {
    drawId,
    drawType: 'DAILY' as const,
    scheduledAt,
    winningNumber: '11',
    grossSales: gross,
    prizesDue: prizes,
    commissionRate: 10,
    commissionAmount: commission,
    netBeforeCommission: gross - prizes,
    netAfterCommission: gross - prizes - commission,
  };
}

describe('groupCommissionsByDay', () => {
  it('groups a 9 PM draw into its own business day and adds the daily subtotals', () => {
    // 03:00Z del 7 de agosto son las 21:00 del 6 de agosto en Managua.
    const report = {
      entries: [
        entry('night', '2026-08-07T03:00:00Z', 500, 0, 50),
        entry('morning', '2026-08-06T17:00:00Z', 300, 800, 30),
        entry('previous', '2026-08-05T17:00:00Z', 100, 0, 10),
      ],
    } as SellerCommissionReport;

    const days = groupCommissionsByDay(report);

    expect(days.map((day) => day.date)).toEqual(['2026-08-06', '2026-08-05']);
    expect(days[0].entries.map((item) => item.drawId)).toEqual(['night', 'morning']);
    expect(days[0].grossSales).toBe(800);
    expect(days[0].prizesDue).toBe(800);
    expect(days[0].commissionAmount).toBe(80);
    expect(days[0].netAfterCommission).toBe(-80);
    expect(days[1].grossSales).toBe(100);
  });

  it('returns no days when the report has no closures', () => {
    expect(groupCommissionsByDay({ entries: [] } as unknown as SellerCommissionReport)).toEqual([]);
  });
});
