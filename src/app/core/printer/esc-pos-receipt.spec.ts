import { describe, expect, it } from 'vitest';
import { Ticket, TicketPrint } from '../models/api.models';
import { buildEscPosReceipt } from './esc-pos-receipt';

const ticket: Ticket = {
  id: 'ticket-9',
  receiptNumber: 9,
  rootTicketId: 'ticket-9',
  previousTicketId: null,
  sellerId: 'seller-1',
  sellerName: 'Luz Torres',
  routeId: 'route-1',
  routeCode: 'TICUANTEPE',
  routeName: 'Ticuantepe',
  drawId: 'draw-1',
  drawType: 'DAILY',
  drawName: 'Sorteo diario',
  drawScheduledAt: '2026-08-02T15:00:00-06:00',
  salesCloseAt: '2026-08-02T15:00:00-06:00',
  winningNumber: null,
  revision: 1,
  status: 'ACTIVE',
  totalAmount: 105,
  totalPotentialPayout: 7350,
  createdAt: '2026-08-02T14:38:00-06:00',
  updatedAt: '2026-08-02T14:38:00-06:00',
  deletedAt: null,
  deletedBy: null,
  deletedByName: null,
  deletionReason: null,
  printCount: 0,
  lastPrintedAt: null,
  items: [
    { id: 'item-1', number: '10', stake: 100, payoutMultiplier: 70, potentialPayout: 7000 },
    { id: 'item-2', number: '14', stake: 5, payoutMultiplier: 70, potentialPayout: 350 },
  ],
};

const original: TicketPrint = {
  id: 'print-1',
  ticketId: ticket.id,
  rootTicketId: ticket.rootTicketId,
  printNumber: 1,
  printType: 'PRINT',
  printedBy: ticket.sellerId,
  printedByName: ticket.sellerName,
  printedAt: '2026-08-02T14:38:00-06:00',
};

describe('buildEscPosReceipt', () => {
  it('creates a compact commercial 58 mm receipt without currency prefixes or version', () => {
    const text = printable(buildEscPosReceipt(ticket, original));
    expect(text).toContain('SUERTE');
    expect(text).toContain('RECIBO DE VENTA');
    expect(text).toContain('#9');
    expect(text).toContain('LOTO - 02/08/26 - 3PM');
    expect(text).toContain('TOTAL');
    expect(text).toContain('CORDOBAS');
    expect(text).toContain('TICUANTEPE');
    expect(text).not.toContain('C$');
    expect(text).not.toContain('VERSION');
    expect(text).not.toContain('REIMPRESION');
    expect(text).not.toContain('.00');
    expect(text).not.toContain('BUENA SUERTE');
    expect(text).not.toContain('Conserve este recibo');
  });

  it('marks later outputs as reprints', () => {
    const text = printable(
      buildEscPosReceipt(ticket, {
        ...original,
        id: 'print-2',
        printNumber: 2,
        printType: 'REPRINT',
      }),
    );
    expect(text).toContain('REIMPRESION 1');
  });

  it('prints the optional customer without depending on Unicode support', () => {
    const text = printable(
      buildEscPosReceipt({ ...ticket, customerName: 'José Pérez' }, original),
    );
    expect(text).toContain('CLIENTE');
    expect(text).toContain('Jose Perez');
  });
});

function printable(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes).replace(/[\x00-\x09\x0b-\x1f]/g, '');
}
