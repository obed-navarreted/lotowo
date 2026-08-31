import { Injectable } from '@angular/core';
import {
  BusinessFinanceDetails,
  BusinessMountingDetail,
  BusinessMovement,
} from '../models/api.models';
import { drawLabel } from '../../shared/draw-label';
import { PdfFileService } from './pdf-file.service';

type PdfDocument = import('jspdf').jsPDF;

@Injectable({ providedIn: 'root' })
export class ExpenseReportPdfService {
  constructor(private readonly pdfFiles: PdfFileService) {}

  async export(details: BusinessFinanceDetails): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const document = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const mountings = details.mountings;
    const expenses = details.movements.filter((movement) => movement.type === 'EXPENSE');
    const mountingMovements = details.movements.filter(
      (movement) => movement.type === 'MOUNTING_EXPENSE' || movement.type === 'MOUNTING_INCOME',
    );
    const mountingOutflows = mountingMovements.filter(
      (movement) => movement.type === 'MOUNTING_EXPENSE',
    );
    const mountingIncome = mountingMovements.filter(
      (movement) => movement.type === 'MOUNTING_INCOME',
    );
    const mountingExpense = this.round(
      this.sum(mountings.map((item) => item.totalStake)) +
        this.sum(mountingOutflows.map((item) => item.amount)),
    );
    const manualExpense = this.sum(expenses.map((item) => item.amount));
    const externalPrizes = this.round(
      this.sum(mountings.map((item) => item.externalPrize)) +
        this.sum(mountingIncome.map((item) => item.amount)),
    );
    const totalExpense = this.round(mountingExpense + manualExpense);
    const netCost = this.round(totalExpense - externalPrizes);

    this.header(document, details.from, details.to);
    let y = this.summary(document, 37, [
      ['Gasto total', totalExpense],
      ['Montadas', mountingExpense],
      ['Gastos manuales', manualExpense],
      ['Premios externos', externalPrizes],
      ['Costo neto', netCost],
    ]);

    y = this.sectionTitle(document, y, 'MONTADAS Y PREMIOS', mountings.length);
    if (mountings.length) {
      y = this.mountingTableHeader(document, y);
      for (const mounting of mountings) y = this.mountingRow(document, y, mounting);
    } else {
      y = this.emptyRow(document, y, 'No hubo montadas en el período.');
    }

    y = this.ensureSpace(document, y + 8, 25);
    y = this.sectionTitle(document, y, 'MOVIMIENTOS DE MONTADA', mountingMovements.length);
    if (mountingMovements.length) {
      y = this.mountingMovementTableHeader(document, y);
      for (const movement of mountingMovements) {
        y = this.mountingMovementRow(document, y, movement);
      }
    } else {
      y = this.emptyRow(document, y, 'No hubo movimientos simples de montada en el período.');
    }

    y = this.ensureSpace(document, y + 8, 25);
    y = this.sectionTitle(document, y, 'GASTOS MANUALES', expenses.length);
    if (expenses.length) {
      y = this.expenseTableHeader(document, y);
      for (const expense of expenses) y = this.expenseRow(document, y, expense);
    } else {
      this.emptyRow(document, y, 'No hubo gastos manuales en el período.');
    }

    this.footers(document);
    await this.pdfFiles.save(document, `suerte-gastos-${details.from}-${details.to}.pdf`);
  }

  private header(document: PdfDocument, from: string, to: string): void {
    document.setFont('helvetica', 'bold');
    document.setFontSize(15);
    document.setTextColor(34, 33, 31);
    document.text('DETALLE DE GASTOS', 16, 18);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8);
    document.setTextColor(113, 109, 101);
    document.text(this.period(from, to), 16, 24);
    document.setDrawColor(181, 139, 60);
    document.setLineWidth(0.45);
    document.line(16, 30, 194, 30);
  }

  private summary(document: PdfDocument, top: number, values: Array<[string, number]>): number {
    const left = 16;
    const width = 178 / values.length;
    document.setFillColor(249, 248, 245);
    document.setDrawColor(224, 220, 211);
    document.setLineWidth(0.2);
    document.rect(left, top, 178, 25, 'FD');
    values.forEach(([label, value], index) => {
      const center = left + width * (index + 0.5);
      if (index) document.line(left + width * index, top, left + width * index, top + 25);
      document.setFont('helvetica', 'normal');
      document.setFontSize(6.2);
      document.setTextColor(122, 118, 109);
      document.text(label.toUpperCase(), center, top + 8, { align: 'center' });
      document.setFont('helvetica', 'bold');
      document.setFontSize(10.5);
      const highlighted = label === 'Costo neto';
      this.resultColor(document, highlighted ? -value : 0);
      const formatted =
        label === 'Premios externos'
          ? `+${this.amount(value)}`
          : highlighted
            ? this.signedCost(value)
            : this.amount(value);
      document.text(formatted, center, top + 17, { align: 'center' });
    });
    return top + 35;
  }

  private sectionTitle(document: PdfDocument, top: number, title: string, count: number): number {
    document.setFont('helvetica', 'bold');
    document.setFontSize(7.5);
    document.setTextColor(161, 119, 40);
    document.text(`${title} · ${count}`, 16, top);
    return top + 5;
  }

  private mountingTableHeader(document: PdfDocument, top: number): number {
    document.setFillColor(242, 240, 236);
    document.rect(16, top, 178, 8, 'F');
    this.tableHeader(document, top + 5.2, [
      ['SORTEO', 18, 'left'],
      ['GANADOR', 104, 'center'],
      ['MONTADA', 137, 'right'],
      ['PREMIO', 164, 'right'],
      ['BALANCE', 192, 'right'],
    ]);
    return top + 8;
  }

  private mountingRow(
    document: PdfDocument,
    top: number,
    mounting: BusinessMountingDetail,
  ): number {
    const numbers = mounting.items.length
      ? mounting.items.map((item) => `${item.number}: ${this.amount(item.stakeAmount)}`).join(' · ')
      : 'Sin desglose por número';
    const lines = document.splitTextToSize(numbers, 78) as string[];
    const height = Math.max(14, 9 + lines.length * 3.2);
    let y = this.ensureSpace(document, top, height + 8, true);
    if (y !== top) y = this.mountingTableHeader(document, y);
    const balance = this.round(mounting.externalPrize - mounting.totalStake);
    document.setDrawColor(232, 228, 220);
    document.setLineWidth(0.15);
    document.line(16, y + height, 194, y + height);
    document.setFont('helvetica', 'bold');
    document.setFontSize(7.4);
    document.setTextColor(38, 36, 33);
    document.text(this.clean(drawLabel(mounting)), 18, y + 5, { maxWidth: 78 });
    document.setFont('helvetica', 'normal');
    document.setFontSize(6.2);
    document.setTextColor(118, 114, 106);
    document.text(lines, 18, y + 9.2);
    document.setFont('helvetica', 'bold');
    document.setFontSize(8);
    document.setTextColor(67, 64, 59);
    document.text(mounting.winningNumber || '—', 104, y + 6.5, { align: 'center' });
    document.text(this.amount(mounting.totalStake), 137, y + 6.5, { align: 'right' });
    document.setTextColor(38, 121, 101);
    document.text(`+${this.amount(mounting.externalPrize)}`, 164, y + 6.5, { align: 'right' });
    this.resultColor(document, balance);
    document.text(this.signed(balance), 192, y + 6.5, { align: 'right' });
    return y + height;
  }

  private expenseTableHeader(document: PdfDocument, top: number): number {
    document.setFillColor(242, 240, 236);
    document.rect(16, top, 178, 8, 'F');
    this.tableHeader(document, top + 5.2, [
      ['FECHA', 18, 'left'],
      ['DESCRIPCIÓN', 47, 'left'],
      ['ASOCIADO A', 148, 'left'],
      ['MONTO', 192, 'right'],
    ]);
    return top + 8;
  }

  private mountingMovementTableHeader(document: PdfDocument, top: number): number {
    document.setFillColor(242, 240, 236);
    document.rect(16, top, 178, 8, 'F');
    this.tableHeader(document, top + 5.2, [
      ['FECHA', 18, 'left'],
      ['TIPO', 47, 'left'],
      ['DESCRIPCIÓN', 86, 'left'],
      ['MONTO', 192, 'right'],
    ]);
    return top + 8;
  }

  private mountingMovementRow(
    document: PdfDocument,
    top: number,
    movement: BusinessMovement,
  ): number {
    const description = document.splitTextToSize(this.clean(movement.description), 90) as string[];
    const height = Math.max(11, 7 + description.length * 3.2);
    let y = this.ensureSpace(document, top, height + 8, true);
    if (y !== top) y = this.mountingMovementTableHeader(document, y);
    const income = movement.type === 'MOUNTING_INCOME';
    document.setDrawColor(232, 228, 220);
    document.setLineWidth(0.15);
    document.line(16, y + height, 194, y + height);
    document.setFont('helvetica', 'normal');
    document.setFontSize(7);
    document.setTextColor(67, 64, 59);
    document.text(this.shortDate(movement.date), 18, y + 6);
    document.setFont('helvetica', 'bold');
    document.text(income ? 'Ingreso' : 'Egreso', 47, y + 6);
    document.text(description, 86, y + 6);
    document.setTextColor(income ? 38 : 177, income ? 121 : 65, income ? 101 : 65);
    document.text(`${income ? '+' : '-'}${this.amount(movement.amount)}`, 192, y + 6, {
      align: 'right',
    });
    return y + height;
  }

  private expenseRow(document: PdfDocument, top: number, expense: BusinessMovement): number {
    const description = document.splitTextToSize(this.clean(expense.description), 92) as string[];
    const height = Math.max(11, 7 + description.length * 3.2);
    let y = this.ensureSpace(document, top, height + 8, true);
    if (y !== top) y = this.expenseTableHeader(document, y);
    document.setDrawColor(232, 228, 220);
    document.setLineWidth(0.15);
    document.line(16, y + height, 194, y + height);
    document.setFont('helvetica', 'normal');
    document.setFontSize(7);
    document.setTextColor(67, 64, 59);
    document.text(this.shortDate(expense.date), 18, y + 6);
    document.setFont('helvetica', 'bold');
    document.text(description, 47, y + 6);
    document.setFont('helvetica', 'normal');
    document.setTextColor(108, 104, 96);
    document.text(this.clean(expense.userName || 'General'), 148, y + 6, { maxWidth: 28 });
    document.setFont('helvetica', 'bold');
    document.setTextColor(177, 65, 65);
    document.text(`-${this.amount(expense.amount)}`, 192, y + 6, { align: 'right' });
    return y + height;
  }

  private tableHeader(
    document: PdfDocument,
    y: number,
    columns: Array<[string, number, 'left' | 'center' | 'right']>,
  ): void {
    document.setFont('helvetica', 'bold');
    document.setFontSize(6.2);
    document.setTextColor(106, 102, 95);
    for (const [label, x, align] of columns) document.text(label, x, y, { align });
  }

  private emptyRow(document: PdfDocument, top: number, message: string): number {
    document.setFillColor(249, 248, 245);
    document.rect(16, top, 178, 13, 'F');
    document.setFont('helvetica', 'normal');
    document.setFontSize(7);
    document.setTextColor(120, 116, 108);
    document.text(message, 19, top + 8);
    return top + 13;
  }

  private ensureSpace(
    document: PdfDocument,
    top: number,
    required: number,
    continuation = false,
  ): number {
    if (top + required <= 279) return top;
    document.addPage();
    if (!continuation) return 18;
    document.setFont('helvetica', 'bold');
    document.setFontSize(7);
    document.setTextColor(161, 119, 40);
    document.text('DETALLE DE GASTOS · CONTINUACIÓN', 16, 16);
    document.setDrawColor(181, 139, 60);
    document.line(16, 20, 194, 20);
    return 26;
  }

  private footers(document: PdfDocument): void {
    const pages = document.getNumberOfPages();
    const generated = new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Managua',
    }).format(new Date());
    for (let page = 1; page <= pages; page += 1) {
      document.setPage(page);
      document.setDrawColor(224, 220, 211);
      document.line(16, 286, 194, 286);
      document.setFont('helvetica', 'normal');
      document.setFontSize(6.2);
      document.setTextColor(130, 126, 117);
      document.text(`Generado ${generated}`, 16, 291);
      document.text(`${page} / ${pages}`, 194, 291, { align: 'right' });
    }
  }

  private resultColor(document: PdfDocument, value: number): void {
    document.setTextColor(
      value < 0 ? 177 : value > 0 ? 38 : 67,
      value < 0 ? 65 : value > 0 ? 121 : 64,
      value < 0 ? 65 : value > 0 ? 101 : 59,
    );
  }

  private period(from: string, to: string): string {
    return from === to ? this.longDate(from) : `${this.longDate(from)} — ${this.longDate(to)}`;
  }

  private longDate(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(`${value}T12:00:00-06:00`));
  }

  private shortDate(value: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      timeZone: 'America/Managua',
    }).format(new Date(`${value}T12:00:00-06:00`));
  }

  private amount(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value || 0);
  }

  private signed(value: number): string {
    return `${value > 0 ? '+' : ''}${this.amount(value)}`;
  }

  private signedCost(value: number): string {
    return value < 0 ? `+${this.amount(-value)}` : this.amount(value);
  }

  private clean(value: string): string {
    return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  }

  private sum(values: number[]): number {
    return this.round(values.reduce((total, value) => total + (value || 0), 0));
  }

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
