import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ManagedUser } from '../../core/models/admin.models';
import { Draw, UtilitySummary } from '../../core/models/api.models';
import { OperationalReportPdfService } from '../../core/reports/operational-report-pdf.service';
import { apiErrorMessage } from '../../shared/api-error';
import { drawLabel } from '../../shared/draw-label';
import { Icon } from '../../shared/icon/icon';
import { newestDrawFirst } from '../../shared/result-order';

@Component({
  selector: 'lo-utilities-page',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './utilities.page.html',
  styleUrl: './utilities.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UtilitiesPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(LotoApiService);
  private readonly pdf = inject(OperationalReportPdfService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly draws = signal<Draw[]>([]);
  protected readonly sellers = signal<ManagedUser[]>([]);
  protected readonly summary = signal<UtilitySummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly exporting = signal(false);
  protected readonly filterLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly historyMinDate: string;
  protected readonly today = this.localDate(new Date());
  protected fromDate = this.weekStart(this.today);
  protected toDate = this.today;
  protected selectedDrawId = '';
  protected selectedSellerId = '';
  protected includeCommissions = true;

  constructor() {
    const earliest = new Date();
    earliest.setDate(earliest.getDate() - 14);
    this.historyMinDate = this.auth.isAdmin() ? '' : this.localDate(earliest);
    const sellers$ =
      this.auth.user()?.role === 'SELLER'
        ? of({ content: [] as ManagedUser[] })
        : this.api.getUsers(0, 100).pipe(catchError(() => of({ content: [] as ManagedUser[] })));
    forkJoin({ sellers: sellers$ })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ sellers }) => {
          this.sellers.set(sellers.content.filter((user) => user.role === 'SELLER'));
          this.loadPeriod();
        },
      });
  }

  protected onFromDateChanged(): void {
    if (this.toDate < this.fromDate) this.toDate = this.fromDate;
    this.selectedDrawId = '';
    this.loadPeriod();
  }

  protected onToDateChanged(): void {
    if (this.fromDate > this.toDate) this.fromDate = this.toDate;
    this.selectedDrawId = '';
    this.loadPeriod();
  }

  protected applyFilters(): void {
    this.loadSummary();
  }

  protected exportReport(): void {
    const report = this.summary();
    if (!report || this.exporting()) return;
    this.exporting.set(true);
    this.errorMessage.set(null);
    void this.pdf
      .exportUtilities(report, { includeCommissions: this.includeCommissions })
      .catch(() => this.errorMessage.set('No pudimos generar el reporte PDF.'))
      .finally(() => this.exporting.set(false));
  }

  protected clearFilters(): void {
    this.fromDate = this.weekStart(this.today);
    this.toDate = this.today;
    this.selectedDrawId = '';
    this.selectedSellerId = '';
    this.loadPeriod();
  }

  protected drawName(draw: Draw): string {
    return drawLabel(draw);
  }

  protected selectedContext(): string {
    const draw = this.draws().find((item) => item.id === this.selectedDrawId);
    if (draw) return this.drawName(draw);
    return this.isSingleDay() ? 'Todos los turnos del día' : 'Todos los turnos del período';
  }

  protected ticketsQuery(): Record<string, string> {
    return {
      date: this.fromDate,
      ...(this.selectedDrawId ? { drawId: this.selectedDrawId } : {}),
      ...(this.selectedSellerId ? { sellerId: this.selectedSellerId } : {}),
    };
  }

  protected isSingleDay(): boolean {
    return this.fromDate === this.toDate;
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  protected resultValue(result: UtilitySummary): number {
    return this.includeCommissions ? result.netAfterCommission : result.netResult;
  }

  protected sellerResultValue(seller: UtilitySummary['sellers'][number]): number {
    return this.includeCommissions ? seller.netAfterCommission : seller.netBeforeCommission;
  }

  protected dateLabel(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(`${value}T12:00:00-06:00`));
  }

  protected periodLabel(): string {
    const from = this.dateLabel(this.fromDate);
    return this.isSingleDay() ? from : `${from} – ${this.dateLabel(this.toDate)}`;
  }

  private loadPeriod(): void {
    if (!this.fromDate || !this.toDate) return;
    if (this.historyMinDate && this.fromDate < this.historyMinDate) {
      this.errorMessage.set('Solo puedes consultar utilidades de los últimos 15 días.');
      this.summary.set(null);
      return;
    }
    if (this.toDate < this.fromDate) {
      this.errorMessage.set('La fecha final debe ser igual o posterior a la fecha inicial.');
      this.summary.set(null);
      return;
    }
    if (!this.isSingleDay()) {
      this.draws.set([]);
      this.filterLoading.set(false);
      this.loadSummary();
      return;
    }
    this.filterLoading.set(true);
    this.errorMessage.set(null);
    const from = new Date(`${this.fromDate}T00:00:00-06:00`);
    const to = new Date(from.getTime() + 86_400_000 - 1);
    this.api
      .getDraws(from, to)
      .pipe(
        catchError((error: HttpErrorResponse) =>
          error.status === 404
            ? of([] as Draw[])
            : (() => {
                throw error;
              })(),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (draws) => {
          this.draws.set([...draws].sort(newestDrawFirst));
          this.filterLoading.set(false);
          this.loadSummary();
        },
        error: (error: unknown) => {
          this.draws.set([]);
          this.filterLoading.set(false);
          this.loading.set(false);
          this.errorMessage.set(
            apiErrorMessage(error, 'No pudimos cargar los sorteos de ese día.'),
          );
        },
      });
  }

  private loadSummary(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api
      .getUtilitySummary(
        this.fromDate,
        this.toDate,
        this.selectedDrawId || undefined,
        this.selectedSellerId || undefined,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.summary.set(summary);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.summary.set(null);
          this.loading.set(false);
          if (error.status !== 404)
            this.errorMessage.set(apiErrorMessage(error, 'No pudimos calcular las utilidades.'));
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

  private weekStart(today: string): string {
    const date = new Date(`${today}T12:00:00-06:00`);
    date.setUTCDate(date.getUTCDate() - date.getUTCDay());
    return date.toISOString().slice(0, 10);
  }
}
