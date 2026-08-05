import { Injectable } from '@angular/core';
import { drawLabel } from '../../shared/draw-label';
import { Ticket, TicketPrint } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class ReceiptPdfService {
  async download(ticket: Ticket, print: TicketPrint): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const isReprint = print.printType === 'REPRINT';
    const showRevision = ticket.revision > 1;
    const pageHeight =
      88 + ticket.items.length * 7.5 + (isReprint ? 5 : 0) + (showRevision ? 4 : 0);
    const document = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [58, pageHeight],
      compress: true,
    });
    const width = 58;
    const left = 4;
    const right = 54;
    const center = width / 2;
    let y = 7;

    document.setProperties({
      title: 'Recibo Suerte #' + ticket.receiptNumber,
      subject: isReprint ? 'Reimpresión' : 'Impresión original',
      author: 'Suerte',
      creator: 'Suerte',
    });

    this.brand(document, center, y);
    y += 11;
    this.dashedLine(document, left, right, y);
    y += 5;
    if (isReprint) {
      document.setFont('helvetica', 'bold');
      document.setFontSize(7);
      document.setTextColor(20, 20, 20);
      document.text(`REIMPRESIÓN No. ${print.printNumber}`, center, y, { align: 'center' });
      y += 5;
    }
    document.setFont('helvetica', 'bold');
    document.setTextColor(20, 20, 20);
    document.setFontSize(9);
    document.text('RECIBO DE VENTA  ·  #' + ticket.receiptNumber, center, y, { align: 'center' });
    y += 6;
    if (showRevision) {
      document.setFont('helvetica', 'normal');
      document.setFontSize(6.5);
      document.setTextColor(85, 85, 85);
      document.text(`VERSIÓN ${ticket.revision}`, center, y, { align: 'center' });
      y += 4;
    }

    this.solidLine(document, left, right, y);
    y += 5;
    y = this.detailRow(document, 'SORTEO', this.draw(ticket), left, right, y, true);
    y += 1;

    this.solidLine(document, left, right, y);
    y += 5;
    document.setFont('helvetica', 'bold');
    document.setFontSize(6.5);
    document.setTextColor(35, 35, 35);
    document.text('NÚMERO', left, y);
    document.text('JUGADA', 34, y, { align: 'right' });
    document.text('PREMIO', right, y, { align: 'right' });
    y += 3;
    this.solidLine(document, left, right, y, 205);
    y += 4.5;

    for (const item of ticket.items) {
      document.setFont('helvetica', 'bold');
      document.setFontSize(9.5);
      document.setTextColor(18, 18, 18);
      document.text(item.number, left, y);
      document.setFontSize(8);
      document.text(this.amount(item.stake), 34, y, { align: 'right' });
      document.text(this.amount(item.potentialPayout), right, y, { align: 'right' });
      y += 7.5;
    }

    this.solidLine(document, left, right, y);
    y += 7;
    document.setFont('helvetica', 'bold');
    document.setFontSize(9);
    document.setTextColor(15, 15, 15);
    document.text('TOTAL CÓRDOBAS', left, y);
    document.setFontSize(15);
    document.text(this.amount(ticket.totalAmount), right, y, { align: 'right' });
    y += 5;
    this.solidLine(document, left, right, y);
    y += 7;

    document.setFont('helvetica', 'normal');
    document.setFontSize(6.5);
    document.setTextColor(75, 75, 75);
    document.text(this.dateTime(print.printedAt), center, y, { align: 'center' });
    y += 3.5;
    document.text(this.clean(print.printedByName), center, y, { align: 'center' });
    y += 3.5;
    document.text(this.clean(ticket.routeCode), center, y, { align: 'center' });

    const suffix = isReprint ? 'reimpresion-' + print.printNumber : 'impresion';
    document.save('suerte-recibo-' + ticket.receiptNumber + '-' + suffix + '.pdf');
  }

  private brand(document: import('jspdf').jsPDF, center: number, y: number): void {
    document.setFillColor(20, 20, 20);
    document.circle(center - 8.5, y, 1.8, 'F');
    document.setFillColor(20, 20, 20);
    document.circle(center - 4.8, y + 2.8, 1.8, 'F');
    document.setFillColor(20, 20, 20);
    document.circle(center - 12.2, y + 2.8, 1.8, 'F');
    document.setFillColor(20, 20, 20);
    document.circle(center - 8.5, y + 5.6, 1.8, 'F');
    document.setFont('helvetica', 'bold');
    document.setTextColor(18, 18, 18);
    document.setFontSize(15);
    document.text('suerte', center - 1, y + 4.5);
  }

  private detailRow(
    document: import('jspdf').jsPDF,
    label: string,
    value: string,
    left: number,
    right: number,
    y: number,
    emphasize = false,
  ): number {
    document.setFont('helvetica', 'normal');
    document.setFontSize(6.2);
    document.setTextColor(95, 95, 95);
    document.text(label, left, y);
    document.setFont('helvetica', emphasize ? 'bold' : 'normal');
    document.setFontSize(emphasize ? 7.4 : 6.8);
    document.setTextColor(25, 25, 25);
    document.text(value, right, y, { align: 'right', maxWidth: 38 });
    return y + 4.5;
  }

  private draw(ticket: Ticket): string {
    return this.clean(
      drawLabel({ drawType: ticket.drawType, scheduledAt: ticket.drawScheduledAt }),
    );
  }

  private solidLine(
    document: import('jspdf').jsPDF,
    left: number,
    right: number,
    y: number,
    gray = 45,
  ): void {
    document.setDrawColor(gray, gray, gray);
    document.setLineWidth(0.18);
    document.line(left, y, right, y);
  }

  private dashedLine(
    document: import('jspdf').jsPDF,
    left: number,
    right: number,
    y: number,
  ): void {
    document.setDrawColor(130, 130, 130);
    document.setLineWidth(0.15);
    document.setLineDashPattern([1, 1], 0);
    document.line(left, y, right, y);
    document.setLineDashPattern([], 0);
  }

  private amount(value: number): string {
    return new Intl.NumberFormat('es-NI', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  private dateTime(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Managua',
    }).format(new Date(value));
  }

  private clean(value: string): string {
    return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  }
}
