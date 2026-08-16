import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { OperationalReportPdfService } from '../../core/reports/operational-report-pdf.service';
import { ManagedUser } from '../../core/models/admin.models';
import {
  DailyReport,
  DrawNumberReport,
  DrawReport,
  DrawSettlementReport,
  SellerSettlement,
  BusinessSettlement,
} from '../../core/models/api.models';
import { apiErrorMessage } from '../../shared/api-error';
import { drawLabel } from '../../shared/draw-label';
import { Icon } from '../../shared/icon/icon';
import { newestDayFirst, newestDrawFirst } from '../../shared/result-order';

@Component({
  selector: 'lo-reports-page',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './reports.page.html',
  styleUrl: './reports.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(LotoApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reportPdf = inject(OperationalReportPdfService);
  protected readonly sellers = signal<ManagedUser[]>([]);
  protected readonly days = signal<DailyReport[]>([]);
  protected readonly draws = signal<DrawReport[]>([]);
  protected readonly report = signal<DrawNumberReport | null>(null);
  protected readonly settlement = signal<DrawSettlementReport | null>(null);
  protected readonly businessSettlement = signal<BusinessSettlement | null>(null);
  protected readonly loading = signal(true);
  protected readonly filterLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly exporting = signal(false);
  protected readonly historyMinDate: string;
  protected selectedDate = '';
  protected selectedDrawId = '';
  protected selectedSellerId = '';
  protected showOnlyWithSales = true;
  protected activeTab: 'SELLERS' | 'TICKETS' | 'NUMBERS' = 'SELLERS';
  private readonly requestedDrawId: string;

  constructor() {
    const query = this.route.snapshot.queryParamMap;
    this.selectedDate = query.get('date') ?? '';
    this.selectedDrawId = query.get('drawId') ?? '';
    this.requestedDrawId = this.selectedDrawId;
    this.selectedSellerId =
      this.auth.user()?.role === 'SELLER' ? '' : (query.get('sellerId') ?? '');
    const earliest = new Date();
    earliest.setDate(earliest.getDate() - 15);
    this.historyMinDate = this.auth.isAdmin() ? '' : this.localDate(earliest);
    this.loadSellers();
    this.loadDays();
  }

  protected onDateChanged(): void {
    this.selectedDrawId = '';
    this.loadDraws();
  }

  protected onSellerChanged(): void {
    this.selectedDrawId = '';
    this.loadDays();
  }

  protected onDrawChanged(): void {
    this.activeTab = 'SELLERS';
    this.loadDetail();
  }

  protected visibleNumbers() {
    const numbers = this.report()?.numbers ?? [];
    return this.showOnlyWithSales ? numbers.filter((item) => item.salesAmount > 0) : numbers;
  }

  protected exportPdf(): void {
    const report = this.report();
    if (!report || this.exporting()) return;
    this.exporting.set(true);
    this.errorMessage.set(null);
    void this.reportPdf
      .exportDraw(report, this.settlement(), {
        scopeLabel: this.sellerName(),
        dateLabel: this.filterDateLabel(),
      })
      .catch(() => this.errorMessage.set('No pudimos generar el PDF. Intenta nuevamente.'))
      .finally(() => this.exporting.set(false));
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  protected sellerBalanceLabel(seller: SellerSettlement): string {
    if (seller.netResult > 0) return 'Vendedor entrega';
    if (seller.netResult < 0) return 'Negocio entrega';
    return 'Sin saldo pendiente';
  }

  protected absolute(value: number): number {
    return Math.abs(value);
  }

  protected dateTime(value: string): string {
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

  protected filterDateLabel(): string {
    return this.dateLabel(this.selectedDate);
  }

  protected dateLabel(value: string): string {
    if (!value) return 'Seleccionar fecha';
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(`${value}T12:00:00-06:00`));
  }

  protected drawName(draw: DrawReport | DrawNumberReport): string {
    return drawLabel({ drawType: draw.drawType, scheduledAt: draw.scheduledAt });
  }

  protected sellerName(): string {
    return (
      this.sellers().find((seller) => seller.id === this.selectedSellerId)?.fullName ??
      (this.auth.user()?.role === 'SELLER'
        ? this.auth.user()!.fullName
        : 'Todos los vendedores permitidos')
    );
  }

  private loadSellers(): void {
    if (this.auth.user()?.role === 'SELLER') return;
    this.api
      .getUsers(0, 100)
      .pipe(
        catchError(() => of({ content: [] as ManagedUser[] })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) =>
        this.sellers.set(response.content.filter((user) => user.role === 'SELLER')),
      );
  }

  private loadDays(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api
      .getDailyReports(undefined, undefined, this.selectedSellerId || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (days) => {
          const newestFirst = [...days].sort(newestDayFirst);
          this.days.set(newestFirst);
          if (!this.selectedDate)
            this.selectedDate = newestFirst[0]?.date ?? this.localDate(new Date());
          this.loadDraws();
        },
        error: (error: HttpErrorResponse) => {
          this.days.set([]);
          this.draws.set([]);
          this.report.set(null);
          this.settlement.set(null);
          this.businessSettlement.set(null);
          this.loading.set(false);
          if (error.status !== 404)
            this.errorMessage.set(apiErrorMessage(error, 'No pudimos cargar los reportes.'));
        },
      });
  }

  private loadDraws(): void {
    if (!this.selectedDate) return;
    this.filterLoading.set(true);
    this.errorMessage.set(null);
    this.api
      .getDrawReports(this.selectedDate, this.selectedSellerId || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (draws) => {
          const newestFirst = [...draws].sort(newestDrawFirst);
          this.draws.set(newestFirst);
          const preferred = this.selectedDrawId || this.requestedDrawId;
          const latestWithSales =
            newestFirst.find((draw) => draw.ticketCount > 0) ?? newestFirst[0];
          this.selectedDrawId = newestFirst.some((draw) => draw.drawId === preferred)
            ? preferred
            : (latestWithSales?.drawId ?? '');
          this.filterLoading.set(false);
          this.loadDetail();
        },
        error: (error: HttpErrorResponse) => {
          this.draws.set([]);
          this.report.set(null);
          this.settlement.set(null);
          this.businessSettlement.set(null);
          this.loading.set(false);
          this.filterLoading.set(false);
          if (error.status !== 404)
            this.errorMessage.set(apiErrorMessage(error, 'No pudimos cargar los sorteos del día.'));
        },
      });
  }

  private loadDetail(): void {
    if (!this.selectedDrawId) {
      this.report.set(null);
      this.settlement.set(null);
      this.businessSettlement.set(null);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    forkJoin({
      numbers: this.api.getDrawNumberReport(
        this.selectedDrawId,
        this.selectedSellerId || undefined,
      ),
      settlement: this.api
        .getDrawSettlementReport(this.selectedDrawId, this.selectedSellerId || undefined)
        .pipe(catchError(() => of(null))),
      business:
        this.auth.isAdmin() && !this.selectedSellerId
          ? this.api.getDrawBusinessSummary(this.selectedDrawId).pipe(catchError(() => of(null)))
          : of(null),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ numbers, settlement, business }) => {
          this.report.set(numbers);
          this.settlement.set(settlement);
          this.businessSettlement.set(business);
          this.activeTab = settlement ? 'SELLERS' : 'NUMBERS';
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.report.set(null);
          this.settlement.set(null);
          this.businessSettlement.set(null);
          this.loading.set(false);
          this.errorMessage.set(
            apiErrorMessage(error, 'No pudimos generar el detalle por número.'),
          );
        },
      });
  }

  private localDate(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Managua',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value['year']}-${value['month']}-${value['day']}`;
  }
}
