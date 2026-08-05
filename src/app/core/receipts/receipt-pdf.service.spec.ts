import { describe, expect, it, vi } from 'vitest';
import { Ticket, TicketPrint } from '../models/api.models';
import { ReceiptPdfService } from './receipt-pdf.service';

const pdf = vi.hoisted(() => ({
  options: undefined as unknown,
  texts: [] as string[],
  savedAs: '',
}));

vi.mock('jspdf', () => ({
  jsPDF: class {
    constructor(options: unknown) {
      pdf.options = options;
      pdf.texts = [];
      pdf.savedAs = '';
    }

    setProperties(): void {}
    setFont(): void {}
    setFontSize(): void {}
    setTextColor(): void {}
    setFillColor(): void {}
    circle(): void {}
    setDrawColor(): void {}
    setLineWidth(): void {}
    line(): void {}
    setLineDashPattern(): void {}

    text(value: string | string[]): void {
      pdf.texts.push(...(Array.isArray(value) ? value : [value]));
    }

    splitTextToSize(value: string): string[] {
      return [value];
    }

    save(filename: string): void {
      pdf.savedAs = filename;
    }
  },
}));

describe('ReceiptPdfService', () => {
  const ticket: Ticket = {
    id: 'b87af6a4-8809-4121-a74f-5aec590b26de',
    receiptNumber: 42,
    rootTicketId: 'b87af6a4-8809-4121-a74f-5aec590b26de',
    previousTicketId: null,
    sellerId: 'seller-id',
    sellerName: 'Luz Torres',
    routeId: 'route-id',
    routeCode: 'TIC-01',
    routeName: 'Ticuantepe',
    drawId: 'draw-id',
    drawType: 'DAILY',
    drawName: '11 AM',
    drawScheduledAt: '2026-08-02T11:00:00-06:00',
    salesCloseAt: '2026-08-02T11:00:00-06:00',
    winningNumber: null,
    revision: 1,
    status: 'ACTIVE',
    totalAmount: 7,
    totalPotentialPayout: 490,
    createdAt: '2026-08-02T09:00:00-06:00',
    updatedAt: '2026-08-02T09:00:00-06:00',
    deletedAt: null,
    deletedBy: null,
    deletedByName: null,
    deletionReason: null,
    printCount: 0,
    lastPrintedAt: null,
    items: [
      {
        id: 'item-1',
        number: '03',
        stake: 2,
        payoutMultiplier: 70,
        potentialPayout: 140,
      },
      {
        id: 'item-2',
        number: '11',
        stake: 5,
        payoutMultiplier: 70,
        potentialPayout: 350,
      },
    ],
  };

  const originalPrint: TicketPrint = {
    id: 'print-id',
    ticketId: ticket.id,
    rootTicketId: ticket.rootTicketId,
    printNumber: 1,
    printType: 'PRINT',
    printedBy: 'seller-id',
    printedByName: 'Luz Torres',
    printedAt: '2026-08-02T09:01:00-06:00',
  };

  it('generates a compact 58 mm commercial receipt with traceability', async () => {
    await new ReceiptPdfService().download(ticket, originalPrint);

    expect(pdf.options).toMatchObject({ format: [58, 103] });
    expect(pdf.texts).not.toContain('IMPRESIÓN ORIGINAL');
    expect(pdf.texts).toContain('RECIBO DE VENTA  ·  #42');
    expect(pdf.texts).not.toContain('VERSIÓN 1');
    expect(pdf.texts).toContain('TOTAL CÓRDOBAS');
    expect(pdf.texts).toContain('7');
    expect(pdf.texts.every((text) => !text.includes('C$'))).toBe(true);
    expect(pdf.texts).toContain('TIC-01');
    expect(pdf.texts).not.toContain('IMPRESIÓN 1');
    expect(pdf.texts).not.toContain('RIFAS · NICARAGUA');
    expect(pdf.texts).not.toContain('Control: 5AEC590B26DE');
    expect(pdf.texts).not.toContain('¡BUENA SUERTE!');
    expect(pdf.texts.every((text) => !text.includes('.00'))).toBe(true);
    expect(pdf.savedAs).toBe('suerte-recibo-42-impresion.pdf');
  });

  it('marks subsequent copies as reprints', async () => {
    await new ReceiptPdfService().download(ticket, {
      ...originalPrint,
      printNumber: 3,
      printType: 'REPRINT',
    });

    expect(pdf.texts).toContain('REIMPRESIÓN No. 3');
    expect(pdf.texts.filter((text) => text.includes('REIMPRESIÓN'))).toEqual(['REIMPRESIÓN No. 3']);
    expect(pdf.savedAs).toBe('suerte-recibo-42-reimpresion-3.pdf');
  });

  it('only identifies a version when the receipt was actually edited', async () => {
    await new ReceiptPdfService().download({ ...ticket, revision: 2 }, originalPrint);

    expect(pdf.texts).toContain('VERSIÓN 2');
  });

  it('includes the optional customer in the commercial receipt', async () => {
    await new ReceiptPdfService().download(
      { ...ticket, customerName: 'Cliente Uno' },
      originalPrint,
    );

    expect(pdf.texts).toContain('CLIENTE');
    expect(pdf.texts).toContain('Cliente Uno');
    expect(pdf.options).toMatchObject({ format: [58, 108] });
  });
});
