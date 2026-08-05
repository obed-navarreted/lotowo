import { describe, expect, it, vi } from 'vitest';
import { OperationalReportPdfService } from './operational-report-pdf.service';

const pdf = vi.hoisted(() => ({ texts: [] as string[], savedAs: '' }));

vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor() {
      pdf.texts = [];
      pdf.savedAs = '';
    }
    setProperties(): void {}
    setFont(): void {}
    setFontSize(): void {}
    setTextColor(): void {}
    setFillColor(): void {}
    setDrawColor(): void {}
    setLineWidth(): void {}
    line(): void {}
    rect(): void {}
    addPage(): void {}
    text(value: string | string[]): void {
      pdf.texts.push(...(Array.isArray(value) ? value : [value]));
    }
    save(value: string): void {
      pdf.savedAs = value;
    }
  },
}));

describe('OperationalReportPdfService', () => {
  it('builds the winner A4 detail grouped in route and seller order with customer receipts', async () => {
    await new OperationalReportPdfService().exportWinnerDetail({
      drawId: 'draw-id',
      drawType: 'DAILY',
      scheduledAt: '2026-08-05T21:00:00-06:00',
      winningNumber: '36',
      status: 'SETTLED',
      ticketCount: 3,
      winningTicketCount: 1,
      grossSales: 275,
      winningStakes: 50,
      prizesDue: 3850,
      netResult: -3575,
      sellers: [
        {
          sellerId: 'b',
          sellerName: 'Zoe',
          routeId: 'r',
          routeName: 'Centro',
          ticketCount: 1,
          winningTicketCount: 0,
          grossSales: 50,
          winningStakes: 0,
          prizesDue: 0,
          netResult: 50,
          commissionRate: 10,
          commissionAccrued: 5,
        },
        {
          sellerId: 'a',
          sellerName: 'Ana',
          routeId: 'r',
          routeName: 'Centro',
          ticketCount: 2,
          winningTicketCount: 1,
          grossSales: 225,
          winningStakes: 50,
          prizesDue: 3850,
          netResult: -3625,
          commissionRate: 10,
          commissionAccrued: 22.5,
        },
      ],
      winningTickets: [
        {
          ticketId: 'ticket',
          receiptNumber: 16,
          revision: 1,
          sellerId: 'a',
          sellerName: 'Ana',
          routeId: 'r',
          routeName: 'Centro',
          customerName: 'María',
          totalAmount: 50,
          winningStake: 50,
          prizeDue: 3850,
          createdAt: '2026-08-05T20:00:00-06:00',
        },
      ],
    });

    expect(pdf.texts).toContain('DETALLE DE GANADORES');
    expect(pdf.texts).toContain('Ruta · Centro'.toUpperCase());
    expect(pdf.texts.indexOf('Ana')).toBeLessThan(pdf.texts.indexOf('Zoe'));
    expect(pdf.texts).toContain('#16 · María');
    expect(pdf.savedAs).toBe('suerte-ganadores-05-08-26.pdf');
  });

  it('can export commissions without exposing the utility', async () => {
    await new OperationalReportPdfService().exportCommissions(
      {
        sellerId: 'seller',
        sellerName: 'Ana López',
        from: '2026-08-01',
        to: '2026-08-05',
        grossSales: 1000,
        prizesDue: 200,
        commissionAmount: 100,
        netBeforeCommission: 800,
        netAfterCommission: 700,
        entries: [
          {
            drawId: 'draw',
            drawType: 'DAILY',
            scheduledAt: '2026-08-05T17:00:00Z',
            winningNumber: '11',
            grossSales: 1000,
            prizesDue: 200,
            commissionRate: 10,
            commissionAmount: 100,
            netBeforeCommission: 800,
            netAfterCommission: 700,
          },
        ],
      },
      false,
    );

    expect(pdf.texts).toContain('REPORTE DE COMISIONES');
    expect(pdf.texts).not.toContain('UTILIDAD NETA');
    expect(pdf.savedAs).toBe('suerte-comisiones-ana-lopez-sin-utilidad.pdf');
  });
});
