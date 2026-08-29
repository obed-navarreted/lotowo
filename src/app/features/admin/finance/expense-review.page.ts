import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';
import { LotoApiService } from '../../../core/api/loto-api.service';
import { FilterStateService } from '../../../core/navigation/filter-state.service';
import {
  BusinessFinanceDetails,
  BusinessMountingDetail,
  BusinessMovement,
} from '../../../core/models/api.models';
import { ExpenseReportPdfService } from '../../../core/reports/expense-report-pdf.service';
import { apiErrorMessage } from '../../../shared/api-error';
import { drawLabel } from '../../../shared/draw-label';
import { Icon } from '../../../shared/icon/icon';

interface ExpenseReviewFilterState {
  fromDate: string;
  toDate: string;
}

@Component({
  selector: 'lo-expense-review-page',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './expense-review.page.html',
  styleUrl: './expense-review.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseReviewPage {
  private readonly api = inject(LotoApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filterState = inject(FilterStateService);
  private readonly pdf = inject(ExpenseReportPdfService);

  protected readonly details = signal<BusinessFinanceDetails | null>(null);
  protected readonly loading = signal(false);
  protected readonly exporting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly today = this.localDate(new Date());
  protected fromDate = this.weekStart(this.today);
  protected toDate = this.today;

  protected readonly mountings = computed(() => this.details()?.mountings ?? []);
  protected readonly manualExpenses = computed(() =>
    (this.details()?.movements ?? []).filter((movement) => movement.type === 'EXPENSE'),
  );
  protected readonly mountingExpense = computed(() =>
    this.round(this.mountings().reduce((total, mounting) => total + mounting.totalStake, 0)),
  );
  protected readonly manualExpense = computed(() =>
    this.round(this.manualExpenses().reduce((total, movement) => total + movement.amount, 0)),
  );
  protected readonly totalExpense = computed(() =>
    this.round(this.mountingExpense() + this.manualExpense()),
  );
  protected readonly externalPrizes = computed(() =>
    this.round(this.mountings().reduce((total, mounting) => total + mounting.externalPrize, 0)),
  );
  protected readonly netCost = computed(() =>
    this.round(this.totalExpense() - this.externalPrizes()),
  );

  constructor() {
    const stored = this.filterState.restore<ExpenseReviewFilterState>('expense-review');
    if (stored?.fromDate) this.fromDate = stored.fromDate;
    if (stored?.toDate) this.toDate = stored.toDate;
    this.normalizeDates();
    this.load();
  }

  protected search(): void {
    this.normalizeDates();
    this.filterState.save<ExpenseReviewFilterState>('expense-review', {
      fromDate: this.fromDate,
      toDate: this.toDate,
    });
    this.load();
  }

  protected exportReport(): void {
    const details = this.details();
    if (
      !details ||
      this.exporting() ||
      (!this.mountings().length && !this.manualExpenses().length)
    ) {
      return;
    }
    this.exporting.set(true);
    this.errorMessage.set(null);
    void this.pdf
      .export(details)
      .catch(() => this.errorMessage.set('No pudimos generar el reporte PDF.'))
      .finally(() => this.exporting.set(false));
  }

  protected mountingResult(mounting: BusinessMountingDetail): number {
    return this.round(mounting.externalPrize - mounting.totalStake);
  }

  protected mountingLabel(mounting: BusinessMountingDetail): string {
    return drawLabel(mounting);
  }

  protected movementDate(movement: BusinessMovement): string {
    return this.dateLabel(movement.date);
  }

  protected dateTimeLabel(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Managua',
    }).format(new Date(value));
  }

  protected dateLabel(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(`${value}T12:00:00-06:00`));
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  private load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api
      .getBusinessFinanceDetails(this.fromDate, this.toDate)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          if (error.status === 404) {
            return of({
              from: this.fromDate,
              to: this.toDate,
              mountings: [],
              movements: [],
            } satisfies BusinessFinanceDetails);
          }
          throw error;
        }),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (details) => this.details.set(details),
        error: (error: unknown) => {
          this.details.set(null);
          this.errorMessage.set(apiErrorMessage(error, 'No pudimos cargar el detalle de gastos.'));
        },
      });
  }

  private normalizeDates(): void {
    if (this.fromDate > this.today) this.fromDate = this.today;
    if (this.toDate > this.today) this.toDate = this.today;
    if (this.fromDate > this.toDate) this.toDate = this.fromDate;
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

  private round(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
