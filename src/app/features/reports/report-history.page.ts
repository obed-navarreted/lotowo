import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ManagedUser } from '../../core/models/admin.models';
import { DailyReport, DrawReport } from '../../core/models/api.models';
import { apiErrorMessage } from '../../shared/api-error';
import { drawLabel } from '../../shared/draw-label';
import { Icon } from '../../shared/icon/icon';
import { newestDayFirst, newestDrawFirst } from '../../shared/result-order';

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
  protected readonly sellers = signal<ManagedUser[]>([]);
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

  constructor() {
    if (this.auth.user()?.role !== 'SELLER') {
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
    this.loadDays();
  }

  protected onSellerChanged(): void {
    this.page.set(0);
    this.expandedDate.set(null);
    this.dayDraws.set([]);
    this.loadDays();
  }

  protected previousPage(): void {
    this.page.update((value) => Math.max(0, value - 1));
  }

  protected nextPage(): void {
    this.page.update((value) => Math.min(this.totalPages() - 1, value + 1));
  }

  protected toggleDay(day: DailyReport): void {
    if (this.expandedDate() === day.date) {
      this.expandedDate.set(null);
      this.dayDraws.set([]);
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
    this.drawsLoading.set(true);
    this.api
      .getDrawReports(day.date, this.selectedSellerId || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (draws) => {
          this.dayDraws.set(
            draws.filter((draw) => draw.ticketCount > 0).sort(newestDrawFirst),
          );
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
    return new Intl.DateTimeFormat('es-NI', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(`${value}T12:00:00-06:00`));
  }

  protected drawName(draw: DrawReport): string {
    return drawLabel({ drawType: draw.drawType, scheduledAt: draw.scheduledAt });
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
          this.page.set(0);
          this.loading.set(false);
          const firstDay = newestFirst[0];
          if (firstDay) this.loadDraws(firstDay);
        },
        error: (error: HttpErrorResponse) => {
          this.days.set([]);
          this.loading.set(false);
          if (error.status !== 404)
            this.errorMessage.set(apiErrorMessage(error, 'No pudimos cargar el histórico.'));
        },
      });
  }
}
