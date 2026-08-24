import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { FilterStateService } from '../../core/navigation/filter-state.service';
import { DailyReport, DrawReport, ReportSellerOption } from '../../core/models/api.models';
import { apiErrorMessage } from '../../shared/api-error';
import { Icon } from '../../shared/icon/icon';
import { newestDayFirst, newestDrawFirst } from '../../shared/result-order';
import { reportSellerOptions } from '../../shared/report-seller-options';

@Component({
  selector: 'lo-report-history-page',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './report-history.page.html',
  styleUrl: './report-history.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportHistoryPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(LotoApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filterState = inject(FilterStateService);
  protected readonly sellers = signal<ReportSellerOption[]>([]);
  protected readonly days = signal<DailyReport[]>([]);
  protected readonly dayDraws = signal<DrawReport[]>([]);
  protected readonly expandedDate = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly drawsLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly page = signal(0);
  protected readonly pageSize = 15;
  protected readonly totalPages = computed(() => Math.ceil(this.days().length / this.pageSize));
  protected readonly visibleDays = computed(() =>
    this.days().slice(this.page() * this.pageSize, (this.page() + 1) * this.pageSize),
  );
  protected selectedSellerId = '';
  private restoredExpandedDate: string | null;

  constructor() {
    const stored = this.filterState.restore<HistoryFilterState>('report-history');
    this.selectedSellerId = this.auth.user()?.role === 'SELLER' ? '' : (stored?.sellerId ?? '');
    this.restoredExpandedDate = stored?.expandedDate ?? null;
    this.page.set(Math.max(0, stored?.page ?? 0));
    if (this.auth.user()?.role !== 'SELLER') {
      this.api
        .getReportSellerOptions()
        .pipe(
          catchError(() => of([] as ReportSellerOption[])),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((sellers) => {
          const available = reportSellerOptions(sellers);
          this.sellers.set(available);
          if (!available.some((seller) => seller.id === this.selectedSellerId)) {
            this.selectedSellerId = '';
          }
          this.loadDays();
        });
    } else {
      this.loadDays();
    }
  }

  protected onSellerChanged(): void {
    this.page.set(0);
    this.restoredExpandedDate = null;
    this.expandedDate.set(null);
    this.dayDraws.set([]);
    this.rememberFilters();
    this.loadDays();
  }

  protected previousPage(): void {
    this.page.update((value) => Math.max(0, value - 1));
    this.rememberFilters();
  }

  protected nextPage(): void {
    this.page.update((value) => Math.min(this.totalPages() - 1, value + 1));
    this.rememberFilters();
  }

  protected toggleDay(day: DailyReport): void {
    if (this.expandedDate() === day.date) {
      this.expandedDate.set(null);
      this.dayDraws.set([]);
      this.rememberFilters();
      return;
    }
    this.loadDraws(day);
  }

  protected ticketsQuery(draw: DrawReport): Record<string, string> {
    return {
      date: this.expandedDate()!,
      drawId: draw.drawId,
      ...(this.selectedSellerId ? { sellerId: this.selectedSellerId } : {}),
    };
  }

  protected resultLabel(value: number): string {
    if (value < 0) return 'Pérdida';
    if (value > 0) return 'Utilidad';
    return 'Sin diferencia';
  }

  private loadDraws(day: DailyReport): void {
    this.expandedDate.set(day.date);
    this.rememberFilters();
    this.drawsLoading.set(true);
    this.api
      .getDrawReports(day.date, this.selectedSellerId || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (draws) => {
          this.dayDraws.set(draws.filter((draw) => draw.ticketCount > 0).sort(newestDrawFirst));
          this.drawsLoading.set(false);
        },
        error: (error: unknown) => {
          this.dayDraws.set([]);
          this.drawsLoading.set(false);
          this.errorMessage.set(
            apiErrorMessage(error, 'No pudimos cargar los sorteos de ese día.'),
          );
        },
      });
  }

  protected reportQuery(draw: DrawReport): Record<string, string> {
    return {
      date: this.expandedDate()!,
      drawId: draw.drawId,
      ...(this.selectedSellerId ? { sellerId: this.selectedSellerId } : {}),
    };
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  protected date(value: string): string {
    const localDate = new Date(`${value}T12:00:00-06:00`);
    const weekday = new Intl.DateTimeFormat('es-NI', {
      weekday: 'short',
      timeZone: 'America/Managua',
    })
      .format(localDate)
      .replace('.', '');
    const numeric = new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(localDate);
    return `${weekday} · ${numeric}`;
  }

  protected drawName(draw: DrawReport): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Managua',
    }).formatToParts(new Date(draw.scheduledAt));
    const hour = parts.find((part) => part.type === 'hour')?.value ?? '';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
    const period = parts.find((part) => part.type === 'dayPeriod')?.value.toUpperCase() ?? '';
    const time = minute === '00' ? `${hour}${period}` : `${hour}:${minute}${period}`;
    return `${draw.drawType === 'DAILY' ? 'LOTO' : 'Lotería'} · ${time}`;
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
          this.page.set(
            Math.min(this.page(), Math.max(0, Math.ceil(newestFirst.length / this.pageSize) - 1)),
          );
          this.loading.set(false);
          const restoredDay = newestFirst.find((day) => day.date === this.restoredExpandedDate);
          const firstVisible = newestFirst[this.page() * this.pageSize];
          this.restoredExpandedDate = null;
          if (restoredDay ?? firstVisible) this.loadDraws((restoredDay ?? firstVisible)!);
        },
        error: (error: HttpErrorResponse) => {
          this.days.set([]);
          this.loading.set(false);
          if (error.status !== 404)
            this.errorMessage.set(apiErrorMessage(error, 'No pudimos cargar el histórico.'));
        },
      });
  }

  private rememberFilters(): void {
    this.filterState.save<HistoryFilterState>('report-history', {
      sellerId: this.selectedSellerId,
      expandedDate: this.expandedDate(),
      page: this.page(),
    });
  }
}

interface HistoryFilterState {
  sellerId: string;
  expandedDate: string | null;
  page: number;
}
