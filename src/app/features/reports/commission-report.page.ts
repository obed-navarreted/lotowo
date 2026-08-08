import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, map, of } from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { ManagedUser } from '../../core/models/admin.models';
import { ApiProblem, CommissionPayroll, SellerCommissionReport } from '../../core/models/api.models';
import { OperationalReportPdfService } from '../../core/reports/operational-report-pdf.service';
import { CommissionDay, groupCommissionsByDay } from '../../shared/commission-days';
import { drawLabel } from '../../shared/draw-label';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'lo-commission-report-page',
  imports: [FormsModule, Icon],
  templateUrl: './commission-report.page.html',
  styleUrl: './commission-report.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommissionReportPage {
  private readonly api = inject(LotoApiService);
  private readonly pdf = inject(OperationalReportPdfService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly sellers = signal<ManagedUser[]>([]);
  protected readonly report = signal<CommissionPayroll | null>(null);
  protected readonly loading = signal(false);
  protected readonly exporting = signal(false);
  protected readonly error = signal('');
  protected sellerId = '';
  protected from: string;
  protected to: string;
  protected includeProfit = true;
  protected includeDraws = true;

  constructor() {
    const today = new Date();
    this.to = this.localDate(today);
    this.from = `${this.to.slice(0, 8)}01`;
    this.api
      .getUsers(0, 100)
      .pipe(
        catchError(() => of({ content: [] as ManagedUser[] })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) =>
        this.sellers.set(
          response.content
            .filter((user) => user.role === 'SELLER')
            .sort((left, right) => left.fullName.localeCompare(right.fullName, 'es')),
        ),
      );
  }

  protected generate(): void {
    if (!this.from || !this.to || this.to < this.from) {
      this.error.set('Selecciona un rango de fechas válido.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const request = this.sellerId
      ? this.api
          .getSellerCommissionReport(this.sellerId, this.from, this.to)
          .pipe(map((seller) => this.singleSellerPayroll(seller)))
      : this.api.getCommissionPayroll(this.from, this.to);
    request
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (payroll) => this.report.set(payroll),
        error: (error: HttpErrorResponse) => {
          this.report.set(null);
          this.error.set(this.message(error, 'No pudimos generar el reporte.'));
        },
      });
  }

  protected export(): void {
    const payroll = this.report();
    if (!payroll || this.exporting()) return;
    this.exporting.set(true);
    this.error.set('');
    void this.pdf
      .exportCommissions(payroll, {
        includeProfit: this.includeProfit,
        includeDraws: this.includeDraws,
      })
      .catch(() => this.error.set('No pudimos generar el PDF.'))
      .finally(() => this.exporting.set(false));
  }

  private singleSellerPayroll(seller: SellerCommissionReport): CommissionPayroll {
    return {
      from: seller.from,
      to: seller.to,
      grossSales: seller.grossSales,
      prizesDue: seller.prizesDue,
      commissionAmount: seller.commissionAmount,
      netBeforeCommission: seller.netBeforeCommission,
      netAfterCommission: seller.netAfterCommission,
      sellers: [seller],
    };
  }

  protected draw(entry: SellerCommissionReport['entries'][number]): string {
    return drawLabel(entry);
  }

  protected days(report: SellerCommissionReport): CommissionDay[] {
    return groupCommissionsByDay(report);
  }

  protected date(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(value.includes('T') ? new Date(value) : new Date(`${value}T12:00:00-06:00`));
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  private message(error: HttpErrorResponse, fallback: string): string {
    return (error.error as ApiProblem | null)?.detail || fallback;
  }

  private localDate(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'America/Managua',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values['year']}-${values['month']}-${values['day']}`;
  }
}
