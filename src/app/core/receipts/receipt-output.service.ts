import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LotoApiService } from '../api/loto-api.service';
import { Ticket, TicketPrint } from '../models/api.models';
import { PrinterService } from '../printer/printer.service';
import { ReceiptPdfService } from './receipt-pdf.service';

@Injectable({ providedIn: 'root' })
export class ReceiptOutputService {
  constructor(
    private readonly api: LotoApiService,
    private readonly printer: PrinterService,
    private readonly pdf: ReceiptPdfService,
  ) {}

  async print(ticket: Ticket, automatic = false): Promise<TicketPrint | null> {
    const settings = this.printer.settings();
    if (automatic && (!settings.enabled || !settings.automaticPrinting || !settings.deviceId)) {
      return null;
    }
    const print = await firstValueFrom(this.api.registerTicketPrint(ticket.id));
    if (settings.enabled && settings.deviceId && this.printer.isNativeAndroid) {
      await this.printer.enqueue({
        id: print.id,
        ticket,
        print,
        createdAt: new Date().toISOString(),
      });
    } else {
      if (automatic) return null;
      await this.pdf.download(ticket, print);
    }
    return print;
  }
}
