import { describe, expect, it } from 'vitest';
import { UtilitySellerSummary } from '../core/models/api.models';
import { groupUtilitiesByDay } from './utility-days';

describe('groupUtilitiesByDay', () => {
  it('groups draws by Nicaragua business day and keeps newest days first', () => {
    const seller: UtilitySellerSummary = {
      sellerId: 'seller-1',
      sellerName: 'Ana Pérez',
      ticketCount: 3,
      grossSales: 300,
      prizesPaid: 80,
      commissionAmount: 30,
      netBeforeCommission: 220,
      netAfterCommission: 190,
      pendingResults: 0,
      commissionProvisional: false,
      entries: [
        draw('draw-1', '2026-08-08T17:00:00Z', 100, 80, 10),
        draw('draw-2', '2026-08-09T21:00:00Z', 200, 0, 20),
      ],
    };

    const days = groupUtilitiesByDay(seller);

    expect(days.map((day) => day.date)).toEqual(['2026-08-09', '2026-08-08']);
    expect(days[0]).toMatchObject({
      ticketCount: 1,
      grossSales: 200,
      commissionAmount: 20,
      netBeforeCommission: 200,
      netAfterCommission: 180,
    });
  });

  it('accepts the previous API response while a rolling deployment completes', () => {
    const seller = { entries: undefined } as unknown as UtilitySellerSummary;

    expect(groupUtilitiesByDay(seller)).toEqual([]);
  });
});

function draw(id: string, scheduledAt: string, sales: number, prizes: number, commission: number) {
  return {
    drawId: id,
    drawType: 'DAILY' as const,
    scheduledAt,
    winningNumber: prizes ? '03' : null,
    ticketCount: 1,
    grossSales: sales,
    prizesPaid: prizes,
    commissionRate: 10,
    commissionAmount: commission,
    netBeforeCommission: sales - prizes,
    netAfterCommission: sales - prizes - commission,
    pendingResult: false,
    commissionProvisional: false,
  };
}
