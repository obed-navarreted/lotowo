import { Injectable } from '@angular/core';
import {
  CommissionPayroll,
  DrawNumberReport,
  DrawSettlementReport,
  SellerCommissionEntry,
  SellerCommissionReport,
} from '../models/api.models';
import { groupCommissionsByDay } from '../../shared/commission-days';
import { drawLabel } from '../../shared/draw-label';

/** La planilla usa casi todo el ancho A4 para caber en la menor cantidad de hojas posible. */
const PAYROLL_LEFT = 10;
const PAYROLL_RIGHT = 200;

interface DrawPdfContext {
  scopeLabel: string;
  dateLabel: string;
}

export interface PayrollPdfOptions {
  includeProfit: boolean;
  /** Sin el detalle por sorteo la planilla cabe en cerca de un tercio de las hojas. */
  includeDraws: boolean;
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

  /**
   * Planilla de pago. Cada vendedor ocupa sus propias hojas y la siguiente empieza en página
   * nueva: quien firma no debe leer lo que se le paga a otro, ni con qué porcentaje. Por eso
   * el resumen de todos vive en su propia portada, que solo conserva el administrador.
   */
  async exportCommissions(payroll: CommissionPayroll, options: PayrollPdfOptions): Promise<void> {
    const document = await this.createDocument('Planilla de comisiones');
    const period = `${this.date(payroll.from)} al ${this.date(payroll.to)}`;
    const shared = payroll.sellers.length > 1;
    if (shared) this.payrollCover(document, period, payroll, options.includeProfit);
    payroll.sellers.forEach((seller, index) => {
      if (shared || index > 0) document.addPage();
      this.sellerPayrollBlock(document, this.sellerPageTop(document, period, seller), seller, options);
    });
    const single = shared ? 'todos' : this.safeFile(payroll.sellers[0].sellerName);
    document.save(`suerte-comisiones-${single}-${payroll.from}-${payroll.to}.pdf`);
  }

  private payrollCover(
    document: import('jspdf').jsPDF,
    period: string,
    payroll: CommissionPayroll,
    includeProfit: boolean,
  ): void {
    this.payrollBrand(document, 'PLANILLA DE COMISIONES', period);
    const totals: Array<[string, string]> = [
      ['Vendido', this.amount(payroll.grossSales)],
      ['Premio total pagado', this.amount(payroll.prizesDue)],
      ['Comisión', this.amount(payroll.commissionAmount)],
    ];
    if (includeProfit) totals.push(['Utilidad neta', this.amount(payroll.netAfterCommission)]);
    let y = this.summary(document, 30, totals);
    y += 9;
    this.sectionTitle(document, `Vendedores por pagar (${payroll.sellers.length})`, y);
    y += 6;
    for (const seller of payroll.sellers) {
      y = this.ensureSpace(document, y, 6, 'Vendedores por pagar');
      document.setFont('helvetica', 'normal');
      document.setFontSize(7.5);
      document.setTextColor(45, 45, 45);
      document.text(this.clean(seller.sellerName), PAYROLL_LEFT, y);
      document.text(this.amount(seller.commissionAmount), PAYROLL_RIGHT, y, { align: 'right' });
      y += 4.6;
    }
    document.setFont('helvetica', 'italic');
    document.setFontSize(6.8);
    document.setTextColor(120, 120, 120);
    document.text(
      'Hoja de control: cada vendedor firma únicamente su propia hoja.',
      PAYROLL_LEFT,
      y + 3,
    );
  }

  private sellerPageTop(
    document: import('jspdf').jsPDF,
    period: string,
    seller: SellerCommissionReport,
  ): number {
    this.payrollBrand(document, this.clean(seller.sellerName).toUpperCase(), period);
    this.payrollRule(document, 18);
    return 24;
  }

  private payrollBrand(document: import('jspdf').jsPDF, eyebrow: string, period: string): void {
    document.setFont('helvetica', 'bold');
    document.setTextColor(25, 25, 25);
    document.setFontSize(13);
    document.text('suerte', PAYROLL_LEFT, 14);
    document.setFontSize(8);
    document.setTextColor(100, 80, 195);
    document.text(eyebrow, PAYROLL_LEFT + 22, 14, { maxWidth: 120 });
    document.setFont('helvetica', 'normal');
    document.setFontSize(8);
    document.setTextColor(90, 90, 90);
    document.text(period, PAYROLL_RIGHT, 14, { align: 'right' });
  }

  private sellerPayrollBlock(
    document: import('jspdf').jsPDF,
    top: number,
    seller: SellerCommissionReport,
    options: PayrollPdfOptions,
  ): number {
    const { includeProfit, includeDraws } = options;
    const days = groupCommissionsByDay(seller);
    const columns = this.payrollColumns(includeProfit);
    // Si el bloque desborda, la hoja siguiente sigue siendo de este vendedor y de nadie más.
    const continuation = `${this.clean(seller.sellerName)} (continuación)`;
    let y = this.ensureSpace(document, top, 22, continuation);

    document.setFillColor(243, 242, 240);
    document.rect(PAYROLL_LEFT - 2, y - 3.6, PAYROLL_RIGHT - PAYROLL_LEFT + 4, 6, 'F');
    document.setFont('helvetica', 'bold');
    document.setFontSize(8);
    document.setTextColor(25, 25, 25);
    document.text(this.clean(seller.sellerName), PAYROLL_LEFT, y);
    document.setFont('helvetica', 'normal');
    document.setFontSize(6.5);
    document.setTextColor(95, 95, 95);
    for (const [label, x] of columns) document.text(label.toUpperCase(), x, y, { align: 'right' });
    y += 5;

    for (const day of days) {
      y = this.ensureSpace(document, y, 6, continuation);
      const values = [day.grossSales, day.prizesDue, day.commissionAmount];
      if (includeProfit) values.push(day.netAfterCommission);
      document.setFont('helvetica', 'bold');
      document.setFontSize(7);
      document.setTextColor(35, 35, 35);
      document.text(this.date(day.date), PAYROLL_LEFT, y);
      values.forEach((value, index) =>
        document.text(this.amount(value), columns[index][1], y, { align: 'right' }),
      );
      y += 4.2;
      if (!includeDraws) continue;
      for (const entry of day.entries) {
        y = this.ensureSpace(document, y, 6, continuation);
        const detail = [entry.grossSales, entry.prizesDue, entry.commissionAmount];
        if (includeProfit) detail.push(entry.netAfterCommission);
        document.setFont('helvetica', 'normal');
        document.setFontSize(6.5);
        document.setTextColor(105, 105, 105);
        // La fecha ya la lleva la fila del día: repetirla sólo gastaría renglón.
        document.text(
          `${this.drawTime(entry)} · ganador ${entry.winningNumber} · ${this.amount(entry.commissionRate)}%`,
          PAYROLL_LEFT + 4,
          y,
        );
        detail.forEach((value, index) =>
          document.text(this.amount(value), columns[index][1], y, { align: 'right' }),
        );
        y += 3.8;
      }
      y += 0.6;
    }

    return this.signatureReceipt(document, y, seller, continuation);
  }

  private signatureReceipt(
    document: import('jspdf').jsPDF,
    top: number,
    seller: SellerCommissionReport,
    continuation: string,
  ): number {
    // Recibo en una sola línea: firmar no debe costar un tercio de la hoja.
    let y = this.ensureSpace(document, top, 10, continuation);
    y += 4;
    document.setFont('helvetica', 'bold');
    document.setFontSize(6.8);
    document.setTextColor(35, 35, 35);
    document.text(
      `Recibí conforme C$ ${this.amount(seller.commissionAmount)} por comisión del período.`,
      PAYROLL_LEFT,
      y,
    );
    const slots: Array<[string, number, number]> = [
      ['Firma', 76, 46],
      ['Cédula', 132, 28],
      ['Fecha', 170, 30],
    ];
    document.setDrawColor(130, 130, 130);
    document.setLineWidth(0.2);
    document.setFont('helvetica', 'normal');
    document.setFontSize(6.5);
    document.setTextColor(110, 110, 110);
    for (const [label, x, width] of slots) {
      document.text(label, x, y);
      document.line(x + 10, y + 0.6, x + 10 + width, y + 0.6);
    }
    y += 3.5;
    this.payrollRule(document, y);
    return y + 5;
  }

  private payrollColumns(includeProfit: boolean): Array<[string, number]> {
    return includeProfit
      ? [
          ['Vendido', 128],
          ['Premio pagado', 152],
          ['Comisión', 176],
          ['Utilidad', PAYROLL_RIGHT],
        ]
      : [
          ['Vendido', 148],
          ['Premio pagado', 175],
          ['Comisión', PAYROLL_RIGHT],
        ];
  }

  private drawTime(entry: SellerCommissionEntry): string {
    const time = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: true,
      timeZone: 'America/Managua',
    })
      .format(new Date(entry.scheduledAt))
      .replace(/\s/g, '');
    return entry.drawType === 'DAILY' ? time : `Lotería ${time}`;
  }

  private payrollRule(document: import('jspdf').jsPDF, y: number): void {
    document.setDrawColor(205, 205, 205);
    document.setLineWidth(0.2);
    document.line(PAYROLL_LEFT, y, PAYROLL_RIGHT, y);
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
