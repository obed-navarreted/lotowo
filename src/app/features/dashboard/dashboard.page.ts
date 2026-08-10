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
import { RouterLink } from '@angular/router';
import { finalize, interval, startWith } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { LotoApiService } from '../../core/api/loto-api.service';
import { Draw, DrawClosure, SellerAvailability } from '../../core/models/api.models';
import { Icon } from '../../shared/icon/icon';
import { apiErrorMessage } from '../../shared/api-error';
import { drawLabel } from '../../shared/draw-label';
import { newestDrawFirst } from '../../shared/result-order';

@Component({
  selector: 'lo-dashboard-page',
  imports: [RouterLink, Icon],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(LotoApiService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly actionError = signal('');
  protected readonly updatingDrawId = signal<string | null>(null);
  protected readonly resultDraw = signal<Draw | null>(null);
  protected readonly resultNumber = signal('');
  protected readonly resultSaving = signal(false);
  protected readonly resultError = signal('');
  protected readonly lastClosure = signal<DrawClosure | null>(null);
  protected readonly draws = signal<Draw[]>([]);
  protected readonly availability = signal<SellerAvailability | null>(null);
  protected readonly now = signal(Date.now());

  protected readonly openDraws = computed(() =>
    this.draws()
      .filter(
        (draw) => draw.status === 'OPEN' && new Date(draw.salesCloseAt).getTime() > this.now(),
      )
      .sort((left, right) => left.salesCloseAt.localeCompare(right.salesCloseAt)),
  );
  protected readonly scheduleDraws = computed(() =>
    [...this.draws()]
      .sort((left, right) => {
        const leftFuture = new Date(left.salesCloseAt).getTime() > this.now();
        const rightFuture = new Date(right.salesCloseAt).getTime() > this.now();
        const leftRank =
          leftFuture && left.status === 'OPEN'
            ? 0
            : leftFuture && left.status === 'SCHEDULED'
              ? 1
              : 2;
        const rightRank =
          rightFuture && right.status === 'OPEN'
            ? 0
            : rightFuture && right.status === 'SCHEDULED'
              ? 1
              : 2;
        return leftRank - rightRank || left.scheduledAt.localeCompare(right.scheduledAt);
      })
      .slice(0, 5),
  );
  protected readonly nextDraw = computed(() => this.openDraws()[0] ?? null);
  protected readonly completedDraws = computed(() =>
    this.draws()
      .filter((draw) => ['RESULT_ENTERED', 'SETTLED'].includes(draw.status))
      .sort(newestDrawFirst),
  );
  protected readonly firstName = computed(
    () => this.auth.user()?.fullName.split(/\s+/)[0] || 'Hola',
  );
  protected readonly greeting = computed(() => {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: 'America/Managua',
      }).format(this.now()),
    );
    return hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches';
  });

  constructor() {
    interval(1000)
      .pipe(startWith(0), takeUntilDestroyed())
      .subscribe(() => this.now.set(Date.now()));
    this.load();
  }

  protected reload(): void {
    this.load();
  }

  protected countdown(draw: Draw | null): string {
    if (!draw) return '—';
    const remaining = Math.max(0, new Date(draw.salesCloseAt).getTime() - this.now());
    if (remaining === 0) return 'Cerrado';
    const hours = Math.floor(remaining / 3_600_000);
    const minutes = Math.floor((remaining % 3_600_000) / 60_000);
    const seconds = Math.floor((remaining % 60_000) / 1000);
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  }

  protected time(value: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Managua',
    }).formatToParts(new Date(value));
    const hour = parts.find((part) => part.type === 'hour')?.value ?? '';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
    const period = parts.find((part) => part.type === 'dayPeriod')?.value.toUpperCase() ?? '';
    return minute === '00' ? `${hour}${period}` : `${hour}:${minute}${period}`;
  }

  protected drawLabel(draw: Draw): string {
    return drawLabel(draw);
  }

  protected money(value: number | null | undefined): string {
    if (value == null) return 'Sin límite';
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  protected statusLabel(draw: Draw): string {
    if (draw.status === 'OPEN' && !draw.salesEnabled) return 'Bloqueado';
    return (
      {
        OPEN: 'Abierto',
        SCHEDULED: 'Programado',
        CLOSED: 'Cerrado',
        RESULT_ENTERED: 'Resultado',
        SETTLED: 'Liquidado',
        CANCELLED: 'Cancelado',
      } as const
    )[draw.status];
  }

  protected canManageSales(draw: Draw): boolean {
    return draw.status === 'OPEN' && new Date(draw.salesCloseAt).getTime() > this.now();
  }

  protected canRegisterResult(draw: Draw): boolean {
    return (
      !draw.winningNumber &&
      draw.status !== 'CANCELLED' &&
      new Date(draw.salesCloseAt).getTime() <= this.now()
    );
  }

  protected openResult(draw: Draw): void {
    if (!this.canRegisterResult(draw)) return;
    this.resultDraw.set(draw);
    this.resultNumber.set('');
    this.resultError.set('');
  }

  protected closeResult(): void {
    if (!this.resultSaving()) this.resultDraw.set(null);
  }
  protected updateResultNumber(value: string): void {
    this.resultNumber.set(value.replace(/\D/g, '').slice(0, 2));
    this.resultError.set('');
  }
  protected submitResult(): void {
    const draw = this.resultDraw();
    if (!draw || !/^\d{2}$/.test(this.resultNumber())) {
      this.resultError.set('Escribe el número ganador con dos dígitos, entre 00 y 99.');
      return;
    }
    this.resultSaving.set(true);
    this.api
      .registerWinningNumber(draw.id, this.resultNumber())
      .pipe(
        finalize(() => this.resultSaving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (closure) => {
          this.lastClosure.set(closure);
          this.resultDraw.set(null);
          this.load();
        },
        error: (error: unknown) =>
          this.resultError.set(apiErrorMessage(error, 'No fue posible registrar el resultado.')),
      });
  }

  protected toggleSales(draw: Draw): void {
    if (this.updatingDrawId()) return;
    this.updatingDrawId.set(draw.id);
    this.actionError.set('');
    this.api
      .updateDrawSales(draw.id, !draw.salesEnabled)
      .pipe(
        finalize(() => this.updatingDrawId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) =>
          this.draws.update((draws) =>
            draws.map((item) => (item.id === updated.id ? updated : item)),
          ),
        error: (error: unknown) =>
          this.actionError.set(
            apiErrorMessage(error, 'No fue posible cambiar el acceso de ventas.'),
          ),
      });
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set(false);
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    this.api
      .getDraws(from, to)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (draws) => {
          this.draws.set(draws);
          this.loading.set(false);
          const next = draws.find((draw) => draw.status === 'OPEN');
          if (next && this.auth.user()?.role === 'SELLER') this.loadAvailability(next.id);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          if (error.status === 404) {
            this.draws.set([]);
            return;
          }
          this.loadError.set(true);
        },
      });
  }

  private loadAvailability(drawId: string): void {
    this.api
      .getAvailability(drawId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (availability) => this.availability.set(availability),
        error: () => this.availability.set(null),
      });
  }
}
