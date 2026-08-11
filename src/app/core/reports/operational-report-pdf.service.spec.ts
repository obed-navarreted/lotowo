import { describe, expect, it, vi } from 'vitest';
import { OperationalReportPdfService } from './operational-report-pdf.service';

const pdf = vi.hoisted(() => ({
  texts: [] as string[],
  savedAs: '',
  pages: 1,
  orientation: '',
}));

vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor(options?: { orientation?: string }) {
      pdf.texts = [];
      pdf.savedAs = '';
      pdf.pages = 1;
      pdf.orientation = options?.orientation ?? '';
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
    addPage(): void {
      pdf.pages += 1;
    }
    text(value: string | string[]): void {
      pdf.texts.push(...(Array.isArray(value) ? value : [value]));
    }
    save(value: string): void {
      pdf.savedAs = value;
    }
  },
}));

describe('OperationalReportPdfService', () => {
  it('creates the weekend follow-up sheet in landscape with sellers in alphabetical order', async () => {
    await new OperationalReportPdfService().exportFollowUpSheet({
      date: '2026-08-08',
      routeId: 'route-id',
      routeCode: 'R-06',
      routeName: 'Ruta seis',
      sellers: [
        { id: 'z', fullName: 'Zoe Ruiz' },
        { id: 'a', fullName: 'Ana López' },
        { id: 'b', fullName: 'Beatriz Cruz' },
        { id: 'c', fullName: 'Carla Díaz' },
        { id: 'd', fullName: 'Diana Solís' },
        { id: 'e', fullName: 'Elena Pérez' },
        { id: 'f', fullName: 'Fátima Mena' },
        { id: 'g', fullName: 'Gloria Ríos' },
        { id: 'h', fullName: 'Helena Paz' },
      ],
    });

    expect(pdf.orientation).toBe('landscape');
    expect(pdf.texts).toContain('SEGUIMIENTO · RUTA R-06');
    expect(pdf.texts).toContain('FECHA: 08/08/26');
    expect(pdf.texts).toContain('11:00 a. m.');
    expect(pdf.texts).not.toContain('12:00 p. m.');
    expect(pdf.texts).toContain('6:00 p. m.');
    expect(pdf.texts.indexOf('Ana López')).toBeLessThan(pdf.texts.indexOf('Zoe Ruiz'));
    expect(pdf.pages).toBe(2);
    expect(pdf.savedAs).toBe('suerte-seguimiento-r-06-2026-08-08.pdf');
  });

  it('exports a styled utility report with historical commission and sellers in alphabetical order', async () => {
    const seller = (sellerId: string, sellerName: string) => ({
      sellerId,
      sellerName,
      ticketCount: 3,
      grossSales: 500,
      prizesPaid: 100,
      commissionAmount: 50,
      netBeforeCommission: 400,
      netAfterCommission: 350,
      pendingResults: 0,
      commissionProvisional: false,
      entries: [
        {
          drawId: `draw-${sellerId}`,
          drawType: 'DAILY' as const,
          scheduledAt: '2026-08-08T15:00:00-06:00',
          winningNumber: '11',
          ticketCount: 3,
          grossSales: 500,
          prizesPaid: 100,
          commissionRate: 10,
          commissionAmount: 50,
          netBeforeCommission: 400,
          netAfterCommission: 350,
          pendingResult: false,
          commissionProvisional: false,
        },
      ],
    });
    await new OperationalReportPdfService().exportUtilities(
      {
        from: '2026-08-02',
        to: '2026-08-08',
        ticketCount: 6,
        grossSales: 1000,
        prizesPaid: 200,
        commissionAmount: 100,
        netResult: 800,
        netAfterCommission: 700,
        pendingResults: 0,
        commissionProvisional: false,
        sellers: [seller('z', 'Zoe'), seller('a', 'Ana')],
      },
      { includeCommissions: true, includeDraws: true },
    );

    expect(pdf.texts).toContain('REPORTE DE UTILIDADES');
    expect(pdf.texts).toContain('COMISIÓN HISTÓRICA APLICADA');
    expect(pdf.texts).toContain('Recibí conforme 50 por comisión del período.');
    expect(pdf.texts).toContain('Firma');
    expect(pdf.texts.indexOf('Ana')).toBeLessThan(pdf.texts.indexOf('Zoe'));
    expect(pdf.savedAs).toBe('suerte-utilidades-2026-08-02-2026-08-08.pdf');
  });

  it('exports utilities without subtracting or displaying seller commissions when excluded', async () => {
    await new OperationalReportPdfService().exportUtilities(
      {
        from: '2026-08-02',
        to: '2026-08-08',
        ticketCount: 3,
        grossSales: 1000,
        prizesPaid: 200,
        commissionAmount: 100,
        netResult: 800,
        netAfterCommission: 700,
        pendingResults: 0,
        commissionProvisional: false,
        sellers: [
          {
            sellerId: 'seller',
            sellerName: 'Ana',
            ticketCount: 3,
            grossSales: 1000,
            prizesPaid: 200,
            commissionAmount: 100,
            netBeforeCommission: 800,
            netAfterCommission: 700,
            pendingResults: 0,
            commissionProvisional: false,
            entries: [],
          },
        ],
      },
      { includeCommissions: false, includeDraws: true },
    );

    expect(pdf.texts).toContain('COMISIONES EXCLUIDAS');
    expect(pdf.texts).toContain('RESULTADO SIN COMISIÓN');
    expect(pdf.texts).toContain('Resultado sin comisión = ventas - premios pagados.');
    expect(pdf.texts).not.toContain('COMISIÓN');
    expect(pdf.texts).not.toContain('Firma');
  });

  it('exports a narrow mobile utility report that is readable without zooming', async () => {
    await new OperationalReportPdfService().exportUtilitiesMobile(
      {
        from: '2026-08-10',
        to: '2026-08-10',
        ticketCount: 2,
        grossSales: 300,
        prizesPaid: 100,
        commissionAmount: 30,
        netResult: 200,
        netAfterCommission: 170,
        pendingResults: 0,
        commissionProvisional: false,
        sellers: [
          {
            sellerId: 'seller',
            sellerName: 'Ana Pérez',
            ticketCount: 2,
            grossSales: 300,
            prizesPaid: 100,
            commissionAmount: 30,
            netBeforeCommission: 200,
            netAfterCommission: 170,
            pendingResults: 0,
            commissionProvisional: false,
            entries: [
              {
                drawId: 'draw',
                drawType: 'DAILY',
                scheduledAt: '2026-08-10T11:00:00-06:00',
                winningNumber: '03',
                ticketCount: 2,
                grossSales: 300,
                prizesPaid: 100,
                commissionRate: 10,
                commissionAmount: 30,
                netBeforeCommission: 200,
                netAfterCommission: 170,
                pendingResult: false,
                commissionProvisional: false,
              },
            ],
          },
        ],
      },
      { includeCommissions: false, includeDraws: true },
    );

    expect(pdf.texts).toContain('UTILIDADES');
    expect(pdf.texts).toContain('Comisiones excluidas');
    expect(pdf.texts).toContain('11AM');
    expect(pdf.texts).toContain('Ana Pérez');
    expect(pdf.texts).not.toContain('Firma');
    expect(pdf.savedAs).toBe('suerte-utilidades-movil-2026-08-10-2026-08-10.pdf');
  });

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

  it('lays out one signed block per seller and keeps the utility out when asked', async () => {
    const entry = {
      drawId: 'draw',
      drawType: 'DAILY' as const,
      scheduledAt: '2026-08-05T17:00:00Z',
      winningNumber: '11',
      grossSales: 1000,
      prizesDue: 200,
      commissionRate: 10,
      commissionAmount: 100,
      netBeforeCommission: 800,
      netAfterCommission: 700,
    };
    const seller = (sellerId: string, sellerName: string) => ({
      sellerId,
      sellerName,
      from: '2026-08-01',
      to: '2026-08-05',
      grossSales: 1000,
      prizesDue: 200,
      commissionAmount: 100,
      netBeforeCommission: 800,
      netAfterCommission: 700,
      entries: [entry],
    });

    await new OperationalReportPdfService().exportCommissions(
      {
        from: '2026-08-01',
        to: '2026-08-05',
        grossSales: 2000,
        prizesDue: 400,
        commissionAmount: 200,
        netBeforeCommission: 1600,
        netAfterCommission: 1400,
        sellers: [seller('one', 'Ana López'), seller('two', 'Telma Ruiz')],
      },
      { includeProfit: false, includeDraws: true },
    );

    expect(pdf.texts).toContain('PLANILLA DE COMISIONES');
    expect(pdf.texts).toContain('PREMIO TOTAL PAGADO');
    // Portada de control más una hoja por vendedor: nadie firma en la hoja de otro.
    expect(pdf.pages).toBe(3);
    expect(pdf.texts).toContain('Ana López');
    expect(pdf.texts).toContain('Telma Ruiz');
    // Un recibo firmable por vendedor, no uno solo al final del documento.
    expect(pdf.texts.filter((text) => text.startsWith('Recibí conforme'))).toEqual([
      'Recibí conforme C$ 100 por comisión del período.',
      'Recibí conforme C$ 100 por comisión del período.',
    ]);
    expect(pdf.texts.filter((text) => text === 'Firma')).toHaveLength(2);
    expect(pdf.texts).not.toContain('UTILIDAD');
    expect(pdf.savedAs).toBe('suerte-comisiones-todos-2026-08-01-2026-08-05.pdf');
  });
});
