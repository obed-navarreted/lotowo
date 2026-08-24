import { Injectable } from '@angular/core';
import {
  BusinessFinanceSummary,
  BusinessFinanceDetails,
  CommissionPayroll,
  DrawNumberReport,
  DrawSettlementReport,
  FollowUpSheet,
  SellerCommissionEntry,
  SellerCommissionReport,
  UtilityDrawSummary,
  UtilitySellerSummary,
  UtilitySummary,
} from '../models/api.models';
import { groupCommissionsByDay } from '../../shared/commission-days';
import { drawLabel } from '../../shared/draw-label';
import { followUpDrawTimes, followUpTurns } from '../../shared/follow-up-sheet';
import { groupUtilitiesByDay } from '../../shared/utility-days';
import { PdfFileService } from './pdf-file.service';

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

export interface UtilityPdfOptions {
  includeCommissions: boolean;
  includeDraws: boolean;
  includeMovements?: boolean;
  scopeLabel?: string;
  businessSummary?: BusinessFinanceSummary | null;
  businessDetails?: BusinessFinanceDetails | null;
}

@Injectable({ providedIn: 'root' })
export class OperationalReportPdfService {
  constructor(private readonly pdfFiles: PdfFileService = new PdfFileService()) {}

  async exportFollowUpSheet(sheet: FollowUpSheet): Promise<void> {
    const document = await this.createLandscapeDocument('Hoja de seguimiento');
    const turns = followUpTurns(sheet.date);
    const sellers = [...sheet.sellers].sort((left, right) =>
      left.fullName.localeCompare(right.fullName, 'es'),
    );
    const sellersPerPage = turns.length === 3 ? 8 : 12;
    const pages = Math.ceil(sellers.length / sellersPerPage);
    for (let page = 0; page < pages; page += 1) {
      if (page > 0) document.addPage();
      const first = page * sellersPerPage;
      this.followUpPage(
        document,
        sheet,
        sellers.slice(first, first + sellersPerPage),
        turns,
        first,
        page + 1,
        pages,
      );
    }
    await this.pdfFiles.save(
      document,
      `suerte-seguimiento-${this.safeFile(sheet.routeCode)}-${sheet.date}.pdf`,
    );
  }

  async exportUtilities(
    report: UtilitySummary,
    options: UtilityPdfOptions = { includeCommissions: false, includeDraws: true },
  ): Promise<void> {
    const includeCommissions = options.includeCommissions;
    const result = includeCommissions ? report.netAfterCommission : report.netResult;
    const document = await this.createDocument('Reporte de utilidades');
    let y = this.a4UtilityHeader(document, report, options.scopeLabel);
    const totals: Array<[string, number]> = [
      ['Vendido', report.grossSales],
      ['Premios', report.prizesPaid],
    ];
    if (includeCommissions) totals.push(['Comisión', report.commissionAmount]);
    totals.push(['Resultado', result]);
    y = this.a4UtilitySummary(document, y, 'RESULTADO DEL PERÍODO', totals);
    if (options.businessSummary) {
      const finance = options.businessSummary;
      const adjustments: Array<[string, number]> = [];
      if (!finance.routeId) {
        adjustments.push(
          ['Montadas', -finance.externalStake],
          ['Premios externos', finance.externalPrizes],
        );
      }
      if (options.includeMovements) {
        adjustments.push(
          ['Otros ingresos', finance.extraIncome],
          ['Otros gastos', -finance.expenses],
        );
      }
      adjustments.push(['Resultado neto', finance.businessResult]);
      const allocation =
        finance.routeId && finance.movementAllocation === 'PROPORTIONAL'
          ? ' · ' + this.amount((finance.movementAllocationRate ?? 0) * 100) + ' % DE VENTAS'
          : '';
      const adjustmentTitle =
        (finance.routeId ? 'AJUSTES DE RUTA' : 'AJUSTES ADMINISTRATIVOS') + allocation;
      y = this.a4UtilitySummary(document, y, adjustmentTitle, adjustments);
    }
    if (options.businessDetails) {
      y = this.a4BusinessDetails(document, y, options.businessDetails, !!options.includeMovements);
    }

    if (report.pendingResults > 0) {
      document.setFillColor(255, 248, 226);
      document.rect(15, y, 180, 9, 'F');
      document.setFont('helvetica', 'bold');
      document.setFontSize(7);
      document.setTextColor(125, 89, 14);
      document.text(
        `PROVISIONAL · ${report.pendingResults} ${report.pendingResults === 1 ? 'sorteo pendiente' : 'sorteos pendientes'}`,
        18,
        y + 5.7,
      );
      y += 14;
    }

    const sellers = [...report.sellers].sort((left, right) =>
      left.sellerName.localeCompare(right.sellerName, 'es'),
    );
    document.setFont('helvetica', 'bold');
    document.setFontSize(7.5);
    document.setTextColor(171, 128, 47);
    document.text(`DETALLE POR VENDEDOR (${sellers.length})`, 17, y);
    y += 9;

    for (const seller of sellers) {
      y = this.ensureSpace(document, y, sellers.length > 1 ? 34 : 16, 'Detalle por vendedor');
      document.setFont('helvetica', 'bold');
      document.setFontSize(10.5);
      document.setTextColor(30, 30, 30);
      document.text(this.clean(seller.sellerName), 17, y, { maxWidth: 120 });
      document.setFont('helvetica', 'normal');
      document.setFontSize(7);
      document.setTextColor(105, 105, 105);
      document.text(`${seller.ticketCount} boletos`, 193, y, { align: 'right' });
      y += 7;

      if (sellers.length > 1) {
        const sellerResult = includeCommissions
          ? seller.netAfterCommission
          : seller.netBeforeCommission;
        const sellerTotals: Array<[string, number]> = [
          ['Vendido', seller.grossSales],
          ['Premios', seller.prizesPaid],
        ];
        if (includeCommissions) sellerTotals.push(['Comisión', seller.commissionAmount]);
        sellerTotals.push(['Resultado', sellerResult]);
        y = this.a4UtilitySummary(document, y, '', sellerTotals);
      }
      if (options.includeDraws) {
        y = this.utilitySellerDetails(document, y, seller);
      }
      if (includeCommissions) {
        y = this.utilityCommissionSignature(document, y, seller);
      }
      y += 5;
    }
    await this.pdfFiles.save(document, `suerte-utilidades-${report.from}-${report.to}.pdf`);
  }

  private a4UtilityHeader(
    document: import('jspdf').jsPDF,
    report: UtilitySummary,
    scopeLabel?: string,
  ): number {
    document.setFont('helvetica', 'bold');
    document.setFontSize(14);
    document.setTextColor(35, 34, 31);
    document.text('UTILIDADES', 17, 19);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8);
    document.setTextColor(120, 117, 108);
    document.text(
      scopeLabel
        ? `${this.mobilePeriod(report.from, report.to)} · ${this.clean(scopeLabel)}`
        : this.mobilePeriod(report.from, report.to),
      17,
      25,
      { maxWidth: 176 },
    );
    document.setDrawColor(184, 139, 53);
    document.setLineWidth(0.45);
    document.line(17, 30, 193, 30);
    return 39;
  }

  private a4UtilitySummary(
    document: import('jspdf').jsPDF,
    top: number,
    title: string,
    values: Array<[string, number]>,
  ): number {
    let y = top;
    if (title) {
      document.setFont('helvetica', 'bold');
      document.setFontSize(7.3);
      document.setTextColor(171, 128, 47);
      document.text(title, 17, y);
      y += 5;
    }
    const left = 15;
    const width = 180 / values.length;
    document.setFillColor(249, 248, 245);
    document.setDrawColor(224, 219, 208);
    document.setLineWidth(0.2);
    document.rect(left, y, 180, 24, 'FD');
    values.forEach(([label, value], index) => {
      const x = left + width * (index + 0.5);
      if (index > 0) document.line(left + width * index, y, left + width * index, y + 24);
      document.setFont('helvetica', 'normal');
      document.setFontSize(6.3);
      document.setTextColor(130, 126, 117);
      document.text(label.toUpperCase(), x, y + 8, { align: 'center' });
      document.setFont('helvetica', 'bold');
      document.setFontSize(12);
      const isResult = label.startsWith('Resultado');
      document.setTextColor(
        isResult && value < 0 ? 178 : isResult && value > 0 ? 42 : 35,
        isResult && value < 0 ? 65 : isResult && value > 0 ? 122 : 34,
        isResult && value < 0 ? 65 : isResult && value > 0 ? 103 : 31,
      );
      document.text(isResult ? this.signedAmount(value) : this.amount(value), x, y + 17, {
        align: 'center',
      });
    });
    return y + 31;
  }

  private a4BusinessDetails(
    document: import('jspdf').jsPDF,
    top: number,
    details: BusinessFinanceDetails,
    includeMovements: boolean,
  ): number {
    let y = this.ensureSpace(document, top, 14, 'Detalle administrativo');
    document.setFont('helvetica', 'bold');
    document.setFontSize(7.3);
    document.setTextColor(171, 128, 47);
    document.text(`MONTADAS DEL PERÍODO (${details.mountings.length})`, 17, y);
    y += 6;
    for (const mounting of details.mountings) {
      const required = mounting.items.length ? 11 + Math.ceil(mounting.items.length / 4) * 5 : 12;
      y = this.ensureSpace(document, y, required, 'Montadas del período');
      document.setFont('helvetica', 'bold');
      document.setFontSize(7.8);
      document.setTextColor(40, 40, 38);
      document.text(
        `${mounting.drawType === 'NATIONAL_LOTTERY' ? 'Lotería' : 'LOTO'} · ${this.financeDateTime(mounting.scheduledAt)}`,
        17,
        y,
      );
      document.setFont('helvetica', 'normal');
      document.setFontSize(7);
      document.setTextColor(90, 88, 82);
      document.text(`Ganador ${mounting.winningNumber ?? '—'}`, 88, y);
      document.text(`Montada ${this.amount(mounting.totalStake)}`, 130, y, { align: 'right' });
      document.text(`Premio ${this.amount(mounting.externalPrize)}`, 193, y, { align: 'right' });
      y += 5;
      if (mounting.items.length) {
        const labels = mounting.items.map(
          (item) =>
            `${item.number}: ${this.amount(item.stakeAmount)} × ${this.amount(item.payoutMultiplier ?? 0)}`,
        );
        for (let index = 0; index < labels.length; index += 4) {
          document.setFontSize(6.4);
          document.setTextColor(110, 106, 98);
          labels
            .slice(index, index + 4)
            .forEach((label, column) =>
              document.text(label, 18 + column * 44, y, { maxWidth: 41 }),
            );
          y += 4.5;
        }
      } else {
        document.setFont('helvetica', 'italic');
        document.setFontSize(6.3);
        document.setTextColor(125, 122, 116);
        document.text('Registro histórico sin desglose individual de números.', 18, y);
        y += 4.5;
      }
      this.line(document, y, 230);
      y += 4;
    }
    if (includeMovements) {
      y = this.ensureSpace(document, y + 2, 12, 'Ingresos y gastos del período');
      document.setFont('helvetica', 'bold');
      document.setFontSize(7.3);
      document.setTextColor(171, 128, 47);
      document.text(`INGRESOS Y GASTOS (${details.movements.length})`, 17, y);
      y += 6;
      for (const movement of details.movements) {
        y = this.ensureSpace(document, y, 6, 'Ingresos y gastos del período');
        document.setFont('helvetica', 'normal');
        document.setFontSize(7);
        document.setTextColor(55, 54, 51);
        document.text(this.date(movement.date), 17, y);
        document.text(this.clean(movement.description), 44, y, { maxWidth: 105 });
        document.setFont('helvetica', 'bold');
        document.setTextColor(
          movement.type === 'INCOME' ? 42 : 178,
          movement.type === 'INCOME' ? 122 : 65,
          movement.type === 'INCOME' ? 103 : 65,
        );
        document.text(
          `${movement.type === 'INCOME' ? '+' : '−'}${this.amount(movement.amount)}`,
          193,
          y,
          { align: 'right' },
        );
        y += 5;
      }
    }
    return y + 5;
  }

  /** Comprobante angosto y escaneable, inspirado en el recibo comercial móvil. */
  async exportUtilitiesMobile(
    report: UtilitySummary,
    options: UtilityPdfOptions = { includeCommissions: false, includeDraws: true },
  ): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const includeCommissions = options.includeCommissions;
    const pageHeight = includeCommissions ? 222 : 204;
    const document = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [92, pageHeight],
      compress: true,
    });
    document.setProperties({
      title: 'Utilidades · formato móvil',
      author: 'Suerte',
      creator: 'Suerte',
    });
    const sellers = [...report.sellers].sort((left, right) =>
      left.sellerName.localeCompare(right.sellerName, 'es'),
    );
    for (const [sellerIndex, seller] of sellers.entries()) {
      if (sellerIndex > 0) document.addPage();
      this.mobileReceiptBackground(document, pageHeight);
      let y = this.mobileSellerCard(
        document,
        report,
        seller,
        includeCommissions,
        options.scopeLabel,
      );

      if (options.includeDraws) {
        const days = [...groupUtilitiesByDay(seller)].sort((left, right) =>
          left.date.localeCompare(right.date),
        );
        for (const day of days) {
          y = this.ensureMobileReceiptSpace(
            document,
            y,
            13 + day.entries.length * 13,
            report,
            seller,
            pageHeight,
          );
          this.mobileTimelineDivider(document, y);
          y += 8;
          document.setFont('helvetica', 'bold');
          document.setFontSize(8.5);
          document.setTextColor(38, 38, 35);
          document.text(this.mobileDate(day.date), 4, y);
          const dayResult = day.netBeforeCommission;
          this.mobileInlineResult(document, dayResult, 31, y);
          y += 9;

          for (const entry of day.entries) {
            const entryResult = entry.netBeforeCommission;
            const winner = entry.pendingResult ? '—' : (entry.winningNumber ?? '—');
            document.setDrawColor(184, 139, 53);
            document.setLineWidth(0.25);
            document.circle(8, y - 1.2, 4, 'S');
            document.setFont('helvetica', 'bold');
            document.setFontSize(7.5);
            document.setTextColor(35, 35, 35);
            document.text(winner, 8, y - 0.2, { align: 'center' });
            document.setFontSize(8);
            document.text(this.mobileTurnLabel(entry), 17, y - 1.8);
            document.setFont('helvetica', 'normal');
            document.setFontSize(6.2);
            document.setTextColor(120, 117, 108);
            document.text(
              `${entry.ticketCount} ${entry.ticketCount === 1 ? 'boleto' : 'boletos'}`,
              17,
              y + 2.2,
            );
            this.mobileResult(document, entryResult, 88, y - 1.8, 8);
            const amounts = `Venta ${this.amount(entry.grossSales)} · Premio ${this.amount(entry.prizesPaid)}`;
            document.setFont('helvetica', 'normal');
            document.setFontSize(5.7);
            document.setTextColor(120, 117, 108);
            document.text(amounts, 88, y + 2.2, { align: 'right' });
            document.setDrawColor(222, 218, 208);
            document.setLineWidth(0.15);
            document.line(4, y + 6, 88, y + 6);
            y += 13;
          }
        }
      }

      if (includeCommissions) {
        y = this.ensureMobileReceiptSpace(document, y, 18, report, seller, pageHeight);
        document.setFont('helvetica', 'normal');
        document.setFontSize(6.5);
        document.setTextColor(95, 92, 85);
        document.text(`Recibí ${this.amount(seller.commissionAmount)} por comisión.`, 8, y + 4);
        y += 12;
        document.setDrawColor(125, 125, 125);
        document.line(8, y, 56, y);
        document.text('Firma', 8, y + 3.5);
        y += 8;
      }
      document.setFont('helvetica', 'normal');
      document.setFontSize(5.8);
      document.setTextColor(135, 131, 121);
      document.text(
        'suerte · reporte de utilidades por turno',
        46,
        Math.min(y + 6, pageHeight - 5),
        { align: 'center' },
      );
    }

    await this.pdfFiles.save(document, `suerte-utilidades-movil-${report.from}-${report.to}.pdf`);
  }

  private mobileReceiptBackground(document: import('jspdf').jsPDF, pageHeight: number): void {
    document.setFillColor(250, 249, 246);
    document.rect(0, 0, 92, pageHeight, 'F');
  }

  private mobileSellerCard(
    document: import('jspdf').jsPDF,
    report: UtilitySummary,
    seller: UtilitySellerSummary,
    includeCommissions: boolean,
    scopeLabel?: string,
  ): number {
    const result = includeCommissions ? seller.netAfterCommission : seller.netBeforeCommission;
    document.setFillColor(255, 255, 255);
    document.setDrawColor(224, 218, 205);
    document.setLineWidth(0.25);
    document.roundedRect(2, 3, 88, 56, 4, 4, 'FD');
    document.setFont('helvetica', 'bold');
    document.setTextColor(171, 128, 47);
    document.setFontSize(6.8);
    document.text('SUERTE · UTILIDADES', 46, 11, { align: 'center' });
    document.setFont('helvetica', 'normal');
    document.setFontSize(7.2);
    document.setTextColor(115, 111, 102);
    document.text(
      scopeLabel
        ? `${this.mobilePeriod(report.from, report.to)} · ${this.clean(scopeLabel)}`
        : this.mobilePeriod(report.from, report.to),
      46,
      16,
      { align: 'center', maxWidth: 80 },
    );
    document.setFont('helvetica', 'bold');
    document.setTextColor(48, 46, 42);
    document.setFontSize(7.2);
    document.text(`${this.clean(seller.sellerName)} · ${seller.ticketCount} boletos`, 46, 23, {
      align: 'center',
      maxWidth: 78,
    });
    document.setFontSize(5.8);
    document.setTextColor(130, 126, 117);
    document.text('RESULTADO', 46, 31, { align: 'center' });
    this.mobileResult(document, result, 46, 40, 17, 'center');
    document.setDrawColor(224, 219, 208);
    document.setLineWidth(0.15);
    document.line(7, 45, 85, 45);
    const values: Array<[string, number]> = [
      ['VENDIDO', seller.grossSales],
      ['PREMIOS', seller.prizesPaid],
    ];
    if (includeCommissions) values.push(['COMISIÓN', seller.commissionAmount]);
    const width = 76 / values.length;
    values.forEach(([label, value], index) => {
      const x = 8 + width * (index + 0.5);
      document.setFont('helvetica', 'normal');
      document.setFontSize(5.6);
      document.setTextColor(130, 126, 117);
      document.text(label, x, 51, { align: 'center' });
      document.setFont('helvetica', 'normal');
      document.setFontSize(8.5);
      document.setTextColor(35, 34, 31);
      document.text(this.amount(value), x, 56, { align: 'center' });
    });
    return 66;
  }

  private mobileResult(
    document: import('jspdf').jsPDF,
    value: number,
    x: number,
    y: number,
    fontSize: number,
    align: 'left' | 'center' | 'right' = 'right',
  ): void {
    document.setFont('helvetica', 'bold');
    document.setFontSize(fontSize);
    document.setTextColor(
      value < 0 ? 178 : value > 0 ? 42 : 55,
      value < 0 ? 65 : value > 0 ? 122 : 55,
      value < 0 ? 65 : value > 0 ? 103 : 55,
    );
    document.text(this.signedAmount(value), x, y, { align });
  }

  private mobileInlineResult(
    document: import('jspdf').jsPDF,
    value: number,
    x: number,
    y: number,
  ): void {
    document.setFont('helvetica', 'bold');
    document.setFontSize(7.5);
    document.setTextColor(
      value < 0 ? 178 : value > 0 ? 42 : 55,
      value < 0 ? 65 : value > 0 ? 122 : 55,
      value < 0 ? 65 : value > 0 ? 103 : 55,
    );
    document.text(`(${this.signedAmount(value)})`, x, y);
  }

  private mobileTimelineDivider(document: import('jspdf').jsPDF, y: number): void {
    document.setDrawColor(220, 216, 206);
    document.setLineWidth(0.15);
    document.setLineDashPattern([1, 1], 0);
    document.line(2, y, 90, y);
    document.setLineDashPattern([], 0);
    document.setFillColor(225, 221, 211);
    document.circle(46, y, 0.8, 'F');
  }

  private ensureMobileReceiptSpace(
    document: import('jspdf').jsPDF,
    y: number,
    required: number,
    report: UtilitySummary,
    seller: UtilitySellerSummary,
    pageHeight: number,
  ): number {
    if (y + required <= pageHeight - 8) return y;
    document.addPage();
    this.mobileReceiptBackground(document, pageHeight);
    document.setFont('helvetica', 'bold');
    document.setFontSize(7.5);
    document.setTextColor(171, 128, 47);
    document.text('SUERTE · UTILIDADES', 4, 8);
    document.setTextColor(65, 62, 57);
    document.text(`${this.clean(seller.sellerName)} · continuación`, 88, 8, { align: 'right' });
    document.setFont('helvetica', 'normal');
    document.setFontSize(6.2);
    document.setTextColor(120, 117, 108);
    document.text(this.mobilePeriod(report.from, report.to), 4, 13);
    return 20;
  }

  private mobileTurnLabel(entry: UtilityDrawSummary): string {
    const time = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: true,
      timeZone: 'America/Managua',
    })
      .format(new Date(entry.scheduledAt))
      .replace(/\s/g, '');
    return entry.drawType === 'NATIONAL_LOTTERY' ? `${time} · Lotería` : time;
  }

  private mobileDate(value: string): string {
    const parts = new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).formatToParts(new Date(`${value}T12:00:00-06:00`));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const month = String(values['month']);
    return `${values['day']} ${month.charAt(0).toUpperCase()}${month.slice(1).replace('.', '')} ${values['year']}`;
  }

  private mobilePeriod(from: string, to: string): string {
    const start = this.mobileDate(from).split(' ');
    const end = this.mobileDate(to).split(' ');
    if (start[1] === end[1] && start[2] === end[2]) return `${start[0]} – ${end.join(' ')}`;
    return `${start.join(' ')} – ${end.join(' ')}`;
  }

  private signedAmount(value: number): string {
    return `${value > 0 ? '+' : ''}${this.amount(value)}`;
  }

  private utilitySellerDetails(
    document: import('jspdf').jsPDF,
    top: number,
    seller: UtilitySellerSummary,
  ): number {
    let y = top;
    const continuation = `${this.clean(seller.sellerName)} · detalle por sorteo`;
    const days = [...groupUtilitiesByDay(seller)].sort((left, right) =>
      left.date.localeCompare(right.date),
    );
    for (const day of days) {
      y = this.ensureSpace(document, y, 16 + day.entries.length * 7, continuation);
      document.setFont('helvetica', 'bold');
      document.setFontSize(8.5);
      document.setTextColor(45, 44, 40);
      document.text(this.mobileDate(day.date), 17, y);
      this.a4InlineResult(document, day.netBeforeCommission, 52, y);
      document.setFont('helvetica', 'normal');
      document.setFontSize(6.5);
      document.setTextColor(120, 117, 108);
      document.text(`${day.entries.length} sorteos`, 193, y, { align: 'right' });
      y += 7;
      const tableTop = y - 3.8;
      document.setFillColor(248, 247, 244);
      document.rect(15, y - 3.8, 180, 7, 'F');
      const headers: Array<[string, number, 'left' | 'right']> = [
        ['TURNO', 18, 'left'],
        ['GANADOR', 72.5, 'left'],
        ['VENTA', 107.5, 'left'],
        ['PREMIO', 142.5, 'left'],
        ['RESULTADO', 192, 'right'],
      ];
      document.setFont('helvetica', 'bold');
      document.setFontSize(6.2);
      document.setTextColor(130, 126, 117);
      headers.forEach(([label, x, align], index) =>
        document.text(label, x, y, { align: index > 0 && index < 4 ? 'center' : align }),
      );
      y += 7;
      for (const entry of day.entries) {
        const result = entry.netBeforeCommission;
        document.setFillColor(
          result < 0 ? 252 : result > 0 ? 236 : 248,
          result < 0 ? 238 : result > 0 ? 247 : 247,
          result < 0 ? 238 : result > 0 ? 241 : 244,
        );
        document.rect(160, y - 3.7, 35, 7, 'F');
        document.setFont('helvetica', 'normal');
        document.setFontSize(7);
        document.setTextColor(55, 54, 50);
        document.text(this.mobileTurnLabel(entry), 18, y);
        document.setFont('helvetica', 'bold');
        document.text(entry.pendingResult ? '—' : (entry.winningNumber ?? '—'), 72.5, y, {
          align: 'center',
        });
        document.setFont('helvetica', 'normal');
        document.text(this.amount(entry.grossSales), 107.5, y, { align: 'center' });
        document.text(this.amount(entry.prizesPaid), 142.5, y, { align: 'center' });
        document.setFont('helvetica', 'bold');
        document.setTextColor(result < 0 ? 175 : 45, result < 0 ? 65 : 45, result < 0 ? 65 : 45);
        document.text(this.signedAmount(result), 192, y, { align: 'right' });
        y += 7;
      }
      const tableBottom = y - 3.7;
      document.setDrawColor(218, 213, 202);
      document.setLineWidth(0.18);
      document.rect(15, tableTop, 180, tableBottom - tableTop, 'S');
      document.line(15, tableTop + 7, 195, tableTop + 7);
      for (const x of [55, 90, 125, 160]) document.line(x, tableTop, x, tableBottom);
      for (let row = 1; row < day.entries.length; row += 1) {
        const rowY = tableTop + 7 + row * 7;
        document.line(15, rowY, 195, rowY);
      }
      y += 7;
    }
    return y;
  }

  private a4InlineResult(
    document: import('jspdf').jsPDF,
    value: number,
    x: number,
    y: number,
  ): void {
    document.setFont('helvetica', 'bold');
    document.setFontSize(8);
    document.setTextColor(
      value < 0 ? 178 : value > 0 ? 42 : 55,
      value < 0 ? 65 : value > 0 ? 122 : 55,
      value < 0 ? 65 : value > 0 ? 103 : 55,
    );
    document.text(`(${this.signedAmount(value)})`, x, y);
  }

  private utilityCommissionSignature(
    document: import('jspdf').jsPDF,
    top: number,
    seller: UtilitySellerSummary,
  ): number {
    const continuation = `${this.clean(seller.sellerName)} · constancia de comisión`;
    let y = this.ensureSpace(document, top, 14, continuation);
    y += 3;
    document.setFont('helvetica', 'bold');
    document.setFontSize(6.8);
    document.setTextColor(35, 35, 35);
    document.text(
      `Recibí conforme ${this.amount(seller.commissionAmount)} por comisión del período.`,
      16,
      y,
    );
    const slots: Array<[string, number, number]> = [
      ['Firma', 77, 44],
      ['Cédula', 132, 27],
      ['Fecha', 170, 24],
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
    y += 5;
    this.line(document, y, 195);
    return y + 5;
  }

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
    await this.pdfFiles.save(document, `suerte-sorteo-${this.fileDate(report.scheduledAt)}.pdf`);
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
    await this.pdfFiles.save(document, `suerte-ganadores-${this.fileDate(report.scheduledAt)}.pdf`);
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
      this.sellerPayrollBlock(
        document,
        this.sellerPageTop(document, period, seller),
        seller,
        options,
      );
    });
    const single = shared ? 'todos' : this.safeFile(payroll.sellers[0].sellerName);
    await this.pdfFiles.save(
      document,
      `suerte-comisiones-${single}-${payroll.from}-${payroll.to}.pdf`,
    );
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

  private followUpPage(
    document: import('jspdf').jsPDF,
    sheet: FollowUpSheet,
    sellers: FollowUpSheet['sellers'],
    turns: string[],
    sellerOffset: number,
    page: number,
    pages: number,
  ): void {
    const left = 7;
    const right = 290;
    const columns = [left, 16, 64, 92, 117, 143, 169, 197, 222, right];
    const labels = [
      'N.º',
      'NOMBRE',
      'P. ANTERIOR',
      'TURNO',
      'VENTA',
      'PREMIO',
      'ENTREGADO',
      'TOTAL',
      'OBSERVACIÓN',
    ];
    const rowHeight = 6.2;
    const headerTop = 29;
    const headerHeight = 8;
    const rowsTop = headerTop + headerHeight;
    const rowsBottom = rowsTop + sellers.length * turns.length * rowHeight;
    const totalBottom = rowsBottom + 8;

    document.setTextColor(25, 25, 25);
    document.setFont('helvetica', 'bold');
    document.setFontSize(8);
    document.text('MÁQUINA: __________________', left, 9);
    document.text('PAPEL: ______________', 70, 9);
    document.text('CAPITAL: __________________', 203, 9);
    document.setFontSize(12);
    document.text(`SEGUIMIENTO · RUTA ${this.clean(sheet.routeCode)}`, 148.5, 17, {
      align: 'center',
    });
    document.setFont('helvetica', 'normal');
    document.setFontSize(7.5);
    document.text(this.clean(sheet.routeName), 148.5, 22, { align: 'center' });
    document.setFont('helvetica', 'bold');
    document.text(`FECHA: ${this.followUpDate(sheet.date)}`, left, 26);
    document.setFont('helvetica', 'normal');
    document.text(`SORTEOS: ${followUpDrawTimes(sheet.date).join('  ·  ')}`, 148.5, 26, {
      align: 'center',
    });
    if (pages > 1) document.text(`PÁGINA ${page}/${pages}`, right, 26, { align: 'right' });

    document.setFillColor(246, 240, 174);
    document.rect(left, headerTop, right - left, headerHeight, 'F');
    document.setDrawColor(35, 35, 35);
    document.setLineWidth(0.35);
    document.rect(left, headerTop, right - left, totalBottom - headerTop);
    for (const x of columns.slice(1, -1)) document.line(x, headerTop, x, totalBottom);
    document.line(left, rowsTop, right, rowsTop);

    document.setFont('helvetica', 'bold');
    document.setFontSize(6.2);
    labels.forEach((label, index) => {
      document.text(label, (columns[index] + columns[index + 1]) / 2, headerTop + 5, {
        align: 'center',
      });
    });

    let y = rowsTop;
    sellers.forEach((seller, sellerIndex) => {
      const groupTop = y;
      const groupBottom = groupTop + turns.length * rowHeight;
      const center = (groupTop + groupBottom) / 2;
      document.setFont('helvetica', 'normal');
      document.setFontSize(7.2);
      document.text(String(sellerOffset + sellerIndex + 1), (columns[0] + columns[1]) / 2, center, {
        align: 'center',
        baseline: 'middle',
      });
      document.setFont('helvetica', 'bold');
      document.text(this.clean(seller.fullName), columns[1] + 2, center, {
        maxWidth: columns[2] - columns[1] - 4,
        baseline: 'middle',
      });
      document.setFont('helvetica', 'normal');
      document.setFontSize(6.8);
      turns.forEach((turn, turnIndex) => {
        const turnY = groupTop + rowHeight * turnIndex + rowHeight / 2;
        document.text(turn, (columns[3] + columns[4]) / 2, turnY, {
          align: 'center',
          baseline: 'middle',
        });
        if (turnIndex > 0) {
          const divider = groupTop + rowHeight * turnIndex;
          document.setLineWidth(0.18);
          document.line(columns[3], divider, columns[7], divider);
        }
      });
      document.setLineWidth(0.35);
      document.line(left, groupBottom, right, groupBottom);
      y = groupBottom;
    });

    document.setFillColor(246, 246, 244);
    document.rect(left, rowsBottom, right - left, 8, 'F');
    document.line(left, rowsBottom, right, rowsBottom);
    document.setFont('helvetica', 'bold');
    document.setFontSize(8);
    document.text('TOTAL', (columns[0] + columns[3]) / 2, rowsBottom + 5.2, { align: 'center' });
    document.setFont('helvetica', 'normal');
    document.setFontSize(6);
    document.setTextColor(105, 105, 105);
    document.text('Hoja operativa para completar manualmente.', right, 205, { align: 'right' });
  }

  private followUpDate(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      timeZone: 'America/Managua',
    }).format(new Date(`${value}T12:00:00-06:00`));
  }

  private drawTime(entry: SellerCommissionEntry | UtilityDrawSummary): string {
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

  private async createLandscapeDocument(title: string): Promise<import('jspdf').jsPDF> {
    const { jsPDF } = await import('jspdf');
    const document = new jsPDF({
      orientation: 'landscape',
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

  private financeDateTime(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
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
