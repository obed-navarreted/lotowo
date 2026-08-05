import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ManagedUser } from '../../core/models/admin.models';
import { Draw, TicketDaySummary } from '../../core/models/api.models';
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
  private readonly destroyRef = inject(DestroyRef);
  protected readonly draws = signal<Draw[]>([]);
  protected readonly sellers = signal<ManagedUser[]>([]);
  protected readonly summary = signal<TicketDaySummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly filterLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly historyMinDate: string;
  protected selectedDate = this.localDate(new Date());
  protected selectedDrawId = '';
  protected selectedSellerId = '';

  constructor() {
    const earliest = new Date();
    earliest.setDate(earliest.getDate() - 15);
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
          this.loadDay();
        },
      });
  }

  protected onDateChanged(): void {
    this.selectedDrawId = '';
    this.loadDay();
  }

  protected applyFilters(): void {
    this.loadSummary();
  }

  protected clearFilters(): void {
    this.selectedDate = this.localDate(new Date());
    this.selectedDrawId = '';
    this.selectedSellerId = '';
    this.loadDay();
  }

  protected drawName(draw: Draw): string {
    return drawLabel(draw);
  }

  protected selectedContext(): string {
    const draw = this.draws().find((item) => item.id === this.selectedDrawId);
    return draw ? this.drawName(draw) : 'Todos los turnos del día';
  }

  protected ticketsQuery(): Record<string, string> {
    return {
      date: this.selectedDate,
      ...(this.selectedDrawId ? { drawId: this.selectedDrawId } : {}),
      ...(this.selectedSellerId ? { sellerId: this.selectedSellerId } : {}),
    };
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  protected dateLabel(): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(`${this.selectedDate}T12:00:00-06:00`));
  }

  private loadDay(): void {
    if (!this.selectedDate) return;
    if (this.historyMinDate && this.selectedDate < this.historyMinDate) {
      this.errorMessage.set('Solo puedes consultar utilidades de los últimos 15 días.');
      this.summary.set(null);
      return;
    }
    this.filterLoading.set(true);
    this.errorMessage.set(null);
    const from = new Date(`${this.selectedDate}T00:00:00-06:00`);
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
      .getTicketDaySummary(
        this.selectedDate,
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
}
