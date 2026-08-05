import { Injectable } from '@angular/core';
import {
  DrawNumberReport,
  DrawSettlementReport,
  SellerCommissionReport,
} from '../models/api.models';
import { drawLabel } from '../../shared/draw-label';

interface DrawPdfContext {
  scopeLabel: string;
  dateLabel: string;
}

@Injectable({ providedIn: 'root' })
export class OperationalReportPdfService {
  async exportDraw(
    report: DrawNumberReport,
    settlement: DrawSettlementReport | null,
    context: DrawPdfContext,
  ): Promise<void> {
    if (settlement) {
      await this.exportWinnerDetail(settlement, context.scopeLabel);
      return;
    }
    const document = await this.createDocument('Reporte de sorteo');
    let y = this.heading(
      document,
      'REPORTE DE SORTEO',
      drawLabel(report),
      `${context.dateLabel} · ${context.scopeLabel}`,
    );
    y = this.summary(document, y, [
      ['Vendido', this.amount(report.grossSales)],
      ['Premios', this.amount(report.prizesPaid)],
      ['Balance', this.amount(report.netResult)],
      ['Boletos', String(report.ticketCount)],
    ]);
    y += 7;
    this.sectionTitle(document, 'Detalle por número', y);
    y += 7;
    this.tableHeader(document, y, [
      ['Número', 15],
      ['Boletos', 38],
      ['Vendido', 75],
      ['Premio potencial', 112],
      ['Premio ganador', 159],
    ]);
    y += 6;
    for (const item of report.numbers.filter((number) => number.salesAmount > 0)) {
      y = this.ensureSpace(document, y, 7, 'Detalle por número');
      document.setFont('helvetica', item.number === report.winningNumber ? 'bold' : 'normal');
      document.setFontSize(8.5);
      document.setTextColor(30, 30, 30);
      document.text(item.number, 15, y);
      document.text(String(item.ticketCount), 38, y);
      document.text(this.amount(item.salesAmount), 75, y);
      document.text(this.amount(item.potentialPayout), 112, y);
      document.text(this.amount(item.prizesPaid), 159, y);
      this.line(document, y + 2.5, 225);
      y += 7;
    }
    document.save(`suerte-sorteo-${this.fileDate(report.scheduledAt)}.pdf`);
  }

  async exportWinnerDetail(
    report: DrawSettlementReport,
    scopeLabel = 'Todos los vendedores',
  ): Promise<void> {
    const document = await this.createDocument('Detalle de ganadores');
    const label = drawLabel(report);
    let y = this.heading(
      document,
      'DETALLE DE GANADORES',
      label,
      `Ganador ${report.winningNumber} · ${scopeLabel}`,
    );
    y = this.summary(document, y, [
      ['Vendido', this.amount(report.grossSales)],
      ['Premios', this.amount(report.prizesDue)],
      ['Utilidad', this.amount(report.netResult)],
      ['Premiados', String(report.winningTicketCount)],
    ]);
    const sellers = [...report.sellers].sort(
      (left, right) =>
        left.routeName.localeCompare(right.routeName, 'es') ||
        left.sellerName.localeCompare(right.sellerName, 'es'),
    );
    const routes = new Map<string, typeof sellers>();
    for (const seller of sellers) {
      const current = routes.get(seller.routeName) ?? [];
      current.push(seller);
      routes.set(seller.routeName, current);
    }
    for (const [route, routeSellers] of routes) {
      y = this.ensureSpace(document, y + 8, 18, `Ruta ${route}`);
      this.sectionTitle(document, `Ruta · ${route}`, y);
      y += 7;
      for (const seller of routeSellers) {
        y = this.ensureSpace(document, y, 18, `Ruta ${route}`);
        const movement = seller.netResult < 0 ? 'Negocio entrega' : 'Vendedor entrega';
        document.setFont('helvetica', 'bold');
        document.setFontSize(10);
        document.setTextColor(25, 25, 25);
        document.text(this.clean(seller.sellerName), 15, y);
        document.setFont('helvetica', 'normal');
        document.setFontSize(8);
        document.setTextColor(80, 80, 80);
        document.text(
          `Ventas ${this.amount(seller.grossSales)}  ·  Premios ${this.amount(seller.prizesDue)}`,
          15,
          y + 5,
        );
        document.setFont('helvetica', 'bold');
        document.setTextColor(seller.netResult < 0 ? 165 : 36, seller.netResult < 0 ? 65 : 105, 65);
        document.text(`${movement}: ${this.amount(Math.abs(seller.netResult))}`, 195, y + 2, {
          align: 'right',
        });
        y += 11;
        const tickets = report.winningTickets
          .filter((ticket) => ticket.sellerId === seller.sellerId)
          .sort((left, right) => left.receiptNumber - right.receiptNumber);
        if (!tickets.length) {
          document.setFont('helvetica', 'italic');
          document.setFontSize(8);
          document.setTextColor(115, 115, 115);
          document.text('Sin recibos premiados.', 19, y);
          y += 6;
        } else {
          for (const ticket of tickets) {
            y = this.ensureSpace(document, y, 8, `${seller.sellerName} · recibos premiados`);
            document.setFont('helvetica', 'normal');
            document.setFontSize(8);
            document.setTextColor(50, 50, 50);
            const customer = ticket.customerName ? ` · ${this.clean(ticket.customerName)}` : '';
            document.text(`#${ticket.receiptNumber}${customer}`, 19, y, { maxWidth: 93 });
            document.text(`Jugada ${this.amount(ticket.winningStake)}`, 121, y);
            document.setFont('helvetica', 'bold');
            document.text(`Premio ${this.amount(ticket.prizeDue)}`, 195, y, { align: 'right' });
            y += 6;
          }
        }
        this.line(document, y, 225);
        y += 3;
      }
    }
    document.save(`suerte-ganadores-${this.fileDate(report.scheduledAt)}.pdf`);
  }

  async exportCommissions(report: SellerCommissionReport, includeProfit: boolean): Promise<void> {
    const document = await this.createDocument('Reporte de comisiones');
    let y = this.heading(
      document,
      'REPORTE DE COMISIONES',
      this.clean(report.sellerName),
      `${this.date(report.from)} al ${this.date(report.to)}`,
    );
    const totals: Array<[string, string]> = [
      ['Vendido', this.amount(report.grossSales)],
      ['Premios', this.amount(report.prizesDue)],
      ['Comisión', this.amount(report.commissionAmount)],
    ];
    if (includeProfit) totals.push(['Utilidad neta', this.amount(report.netAfterCommission)]);
    y = this.summary(document, y, totals);
    y += 7;
    this.sectionTitle(document, 'Detalle por sorteo', y);
    y += 7;
    const columns: Array<[string, number]> = [
      ['Fecha', 15],
      ['Sorteo', 40],
      ['Vendido', 91],
      ['Premios', 119],
      ['Comisión', 147],
    ];
    if (includeProfit) columns.push(['Utilidad', 178]);
    this.tableHeader(document, y, columns);
    y += 6;
    for (const entry of report.entries) {
      y = this.ensureSpace(document, y, 8, 'Detalle por sorteo');
      document.setFont('helvetica', 'normal');
      document.setFontSize(7.8);
      document.setTextColor(35, 35, 35);
      document.text(this.dateTimeDate(entry.scheduledAt), 15, y);
      document.text(drawLabel(entry), 40, y, { maxWidth: 47 });
      document.text(this.amount(entry.grossSales), 91, y);
      document.text(this.amount(entry.prizesDue), 119, y);
      document.text(
        `${this.amount(entry.commissionAmount)} (${this.amount(entry.commissionRate)}%)`,
        147,
        y,
      );
      if (includeProfit) document.text(this.amount(entry.netAfterCommission), 178, y);
      this.line(document, y + 2.8, 228);
      y += 8;
    }
    const suffix = includeProfit ? 'con-utilidad' : 'sin-utilidad';
    document.save(`suerte-comisiones-${this.safeFile(report.sellerName)}-${suffix}.pdf`);
  }

  private async createDocument(title: string): Promise<import('jspdf').jsPDF> {
    const { jsPDF } = await import('jspdf');
    const document = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });
    document.setProperties({ title, author: 'Suerte', creator: 'Suerte' });
    return document;
  }

  private heading(
    document: import('jspdf').jsPDF,
    eyebrow: string,
    title: string,
    subtitle: string,
  ): number {
    document.setFont('helvetica', 'bold');
    document.setTextColor(25, 25, 25);
    document.setFontSize(17);
    document.text('suerte', 15, 18);
    document.setFontSize(8);
    document.setTextColor(100, 80, 195);
    document.text(eyebrow, 15, 27);
    document.setFontSize(15);
    document.setTextColor(25, 25, 25);
    document.text(this.clean(title), 15, 35);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8.5);
    document.setTextColor(90, 90, 90);
    document.text(this.clean(subtitle), 15, 41);
    this.line(document, 46, 90);
    return 53;
  }

  private summary(
    document: import('jspdf').jsPDF,
    y: number,
    values: Array<[string, string]>,
  ): number {
    const width = 180 / values.length;
    values.forEach(([label, value], index) => {
      const x = 15 + index * width;
      document.setFont('helvetica', 'normal');
      document.setFontSize(7.5);
      document.setTextColor(100, 100, 100);
      document.text(label.toUpperCase(), x, y);
      document.setFont('helvetica', 'bold');
      document.setFontSize(12);
      document.setTextColor(25, 25, 25);
      document.text(value, x, y + 6);
    });
    return y + 11;
  }

  private sectionTitle(document: import('jspdf').jsPDF, title: string, y: number): void {
    document.setFont('helvetica', 'bold');
    document.setFontSize(9);
    document.setTextColor(55, 55, 55);
    document.text(this.clean(title).toUpperCase(), 15, y);
  }

  private tableHeader(
    document: import('jspdf').jsPDF,
    y: number,
    columns: Array<[string, number]>,
  ): void {
    document.setFillColor(245, 244, 242);
    document.rect(13, y - 4, 184, 7, 'F');
    document.setFont('helvetica', 'bold');
    document.setFontSize(7);
    document.setTextColor(85, 85, 85);
    for (const [label, x] of columns) document.text(label.toUpperCase(), x, y);
  }

  private ensureSpace(
    document: import('jspdf').jsPDF,
    y: number,
    required: number,
    continuation: string,
  ): number {
    if (y + required <= 282) return y;
    document.addPage();
    document.setFont('helvetica', 'bold');
    document.setFontSize(9);
    document.setTextColor(80, 80, 80);
    document.text(this.clean(continuation), 15, 18);
    this.line(document, 22, 200);
    return 29;
  }

  private line(document: import('jspdf').jsPDF, y: number, gray: number): void {
    document.setDrawColor(gray, gray, gray);
    document.setLineWidth(0.15);
    document.line(15, y, 195, y);
  }

  private amount(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  private date(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(`${value}T12:00:00-06:00`));
  }

  private dateTimeDate(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      timeZone: 'America/Managua',
    }).format(new Date(value));
  }

  private fileDate(value: string): string {
    return this.dateTimeDate(value).replaceAll('/', '-');
  }

  private safeFile(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }

  private clean(value: string): string {
    return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  }
}
