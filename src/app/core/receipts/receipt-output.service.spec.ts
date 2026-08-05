import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Ticket, TicketPrint } from '../models/api.models';
import { ReceiptOutputService } from './receipt-output.service';

const print = { id: 'p1', printNumber: 1, printType: 'PRINT' } as TicketPrint;
const ticket = { id: 't1' } as Ticket;

describe('ReceiptOutputService', () => {
  it('does not register an automatic print when it is disabled', async () => {
    const api = { registerTicketPrint: vi.fn(() => of(print)) };
    const printer = {
      settings: () => ({ enabled: false, automaticPrinting: true, deviceId: null }),
      isNativeAndroid: true,
      enqueue: vi.fn(),
    };
    const service = new ReceiptOutputService(
      api as never,
      printer as never,
      { download: vi.fn() } as never,
    );

    expect(await service.print(ticket, true)).toBeNull();
    expect(api.registerTicketPrint).not.toHaveBeenCalled();
  });

  it('queues ESC/POS output on Android and never opens the PDF', async () => {
    const api = { registerTicketPrint: vi.fn(() => of(print)) };
    const printer = {
      settings: () => ({ enabled: true, automaticPrinting: true, deviceId: 'AA:BB' }),
      isNativeAndroid: true,
      enqueue: vi.fn().mockResolvedValue(undefined),
    };
    const pdf = { download: vi.fn() };
    const service = new ReceiptOutputService(api as never, printer as never, pdf as never);

    expect(await service.print(ticket, true)).toBe(print);
    expect(printer.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', ticket, print }),
    );
    expect(pdf.download).not.toHaveBeenCalled();
  });

  it('preserves PDF output for manual printing in the web app', async () => {
    const api = { registerTicketPrint: vi.fn(() => of(print)) };
    const printer = {
      settings: () => ({ enabled: false, automaticPrinting: false, deviceId: null }),
      isNativeAndroid: false,
      enqueue: vi.fn(),
    };
    const pdf = { download: vi.fn().mockResolvedValue(undefined) };
    const service = new ReceiptOutputService(api as never, printer as never, pdf as never);

    expect(await service.print(ticket)).toBe(print);
    expect(pdf.download).toHaveBeenCalledWith(ticket, print);
  });
});
