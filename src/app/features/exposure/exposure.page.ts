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
import { ActivatedRoute } from '@angular/router';
import {
  catchError,
  EMPTY,
  expand,
  finalize,
  forkJoin,
  map,
  Observable,
  of,
  reduce,
  timer,
} from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ManagedUser, RouteSummary } from '../../core/models/admin.models';
import { FilterStateService } from '../../core/navigation/filter-state.service';
import {
  DrawNumberReport,
  DrawReport,
  NotificationSettings,
  NumberReport,
} from '../../core/models/api.models';
import { apiErrorMessage } from '../../shared/api-error';
import { drawLabel } from '../../shared/draw-label';
import { Icon } from '../../shared/icon/icon';
import { newestDrawFirst } from '../../shared/result-order';

@Component({
  selector: 'lo-exposure-page',
  imports: [FormsModule, Icon],
  templateUrl: './exposure.page.html',
  styleUrl: './exposure.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExposurePage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(LotoApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filterState = inject(FilterStateService);

  protected readonly routes = signal<RouteSummary[]>([]);
  protected readonly sellers = signal<ManagedUser[]>([]);
  protected readonly draws = signal<DrawReport[]>([]);
  protected readonly report = signal<DrawNumberReport | null>(null);
  protected readonly notificationSettings = signal<NotificationSettings | null>(null);
  protected readonly loading = signal(true);
  protected readonly refreshing = signal(false);
  protected readonly alertDialogOpen = signal(false);
  protected readonly alertSettingsLoading = signal(false);
  protected readonly alertSettingsSaving = signal(false);
  protected readonly alertSettingsError = signal<string | null>(null);
  protected readonly actionMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly lastUpdatedAt = signal<Date | null>(null);
  protected readonly historyMinDate: string;
  protected selectedDate: string;
  protected selectedDrawId: string;
  protected selectedRouteId = '';
  protected selectedSellerId = '';
  protected showOnlyWithSales = true;
  protected idealProfit: number | null = 5_000;
  protected alertEnabled = false;
  protected alertThreshold: number | null = 40_000;
  private readonly requestedDrawId: string;

  protected visibleNumbers(): NumberReport[] {
    const values = this.report()?.numbers ?? [];
    return this.showOnlyWithSales ? values.filter((value) => value.salesAmount > 0) : values;
  }

  protected readonly soldNumberCount = computed(
    () => (this.report()?.numbers ?? []).filter((item) => item.salesAmount > 0).length,
  );

  protected readonly highestExposure = computed<NumberReport | null>(() => {
    const sold = (this.report()?.numbers ?? []).filter((item) => item.potentialPayout > 0);
    return sold.reduce<NumberReport | null>(
      (highest, item) =>
        !highest || item.potentialPayout > highest.potentialPayout ? item : highest,
      null,
    );
  });

  constructor() {
    const query = this.route.snapshot.queryParamMap;
    const stored = this.filterState.restore<ExposureFilterState>('exposure');
    this.selectedDate = query.get('date') ?? stored?.date ?? this.localDate(new Date());
    this.selectedDrawId = query.get('drawId') ?? stored?.drawId ?? '';
    this.selectedRouteId = this.auth.user()?.role === 'SELLER' ? '' : (stored?.routeId ?? '');
    this.selectedSellerId = this.auth.user()?.role === 'SELLER' ? '' : (stored?.sellerId ?? '');
    this.showOnlyWithSales = stored?.showOnlyWithSales ?? true;
    this.idealProfit = stored?.idealProfit ?? 5_000;
    this.requestedDrawId = this.selectedDrawId;
    const earliest = new Date();
    earliest.setDate(earliest.getDate() - 15);
    this.historyMinDate = this.auth.isAdmin() ? '' : this.localDate(earliest);
    this.loadFilterOptions();
    this.loadDraws();
    timer(15_000, 15_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadReport(true));
  }

  protected onDateChanged(): void {
    this.selectedDrawId = '';
    this.rememberFilters();
    this.loadDraws();
  }

  protected onDrawChanged(): void {
    this.rememberFilters();
    this.loadReport();
  }

  protected onRouteChanged(): void {
    if (!this.availableSellers().some((seller) => seller.id === this.selectedSellerId)) {
      this.selectedSellerId = '';
    }
    this.rememberFilters();
    this.loadReport();
  }

  protected onSellerChanged(): void {
    this.rememberFilters();
    this.loadReport();
  }

  protected onVisibilityChanged(): void {
    this.rememberFilters();
  }

  protected onIdealProfitChanged(): void {
    if (this.idealProfit !== null && this.idealProfit < 0) this.idealProfit = 0;
    this.rememberFilters();
  }

  protected idealNumbers(): NumberReport[] {
    const report = this.report();
    const target = this.idealProfit;
    if (!report || target === null || !Number.isFinite(target) || target < 0) return [];
    return report.numbers.filter((item) => this.profitIfWinner(item) >= target);
  }

  protected profitIfWinner(item: NumberReport): number {
    return (this.report()?.grossSales ?? 0) - item.potentialPayout;
  }

  protected availableSellers(): ManagedUser[] {
    return this.sellers().filter(
      (seller) =>
        seller.role === 'SELLER' &&
        (!this.selectedRouteId || seller.routeId === this.selectedRouteId),
    );
  }

  protected refresh(): void {
    this.loadReport(true);
  }

  protected openAlertSettings(): void {
    if (!this.auth.isAdmin()) return;
    this.alertDialogOpen.set(true);
    this.alertSettingsError.set(null);
    const settings = this.notificationSettings();
    if (settings) {
      this.applyAlertSettings(settings);
      return;
    }
    this.alertSettingsLoading.set(true);
    this.api
      .getNotificationSettings()
      .pipe(
        finalize(() => this.alertSettingsLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (loaded) => {
          this.notificationSettings.set(loaded);
          this.applyAlertSettings(loaded);
        },
        error: (error: unknown) =>
          this.alertSettingsError.set(
            apiErrorMessage(error, 'No pudimos cargar las alertas. Intenta nuevamente.'),
          ),
      });
  }

  protected closeAlertSettings(): void {
    if (this.alertSettingsSaving()) return;
    this.alertDialogOpen.set(false);
    this.alertSettingsError.set(null);
  }

  protected saveAlertSettings(): void {
    this.alertSettingsError.set(null);
    if (
      this.alertThreshold === null ||
      !Number.isFinite(this.alertThreshold) ||
      this.alertThreshold < 1
    ) {
      this.alertSettingsError.set('Ingresa un monto mayor o igual a C$1.');
      return;
    }
    this.alertSettingsSaving.set(true);
    this.api
      .updateNotificationSettings(this.alertEnabled, this.alertThreshold)
      .pipe(
        finalize(() => this.alertSettingsSaving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (saved) => {
          this.notificationSettings.set(saved);
          this.applyAlertSettings(saved);
          this.alertDialogOpen.set(false);
          this.actionMessage.set(
            saved.numberExposureEnabled
              ? `Alerta activa desde ${this.money(saved.numberExposureThreshold)}.`
              : 'Las alertas de riesgo están desactivadas.',
          );
        },
        error: (error: unknown) =>
          this.alertSettingsError.set(
            apiErrorMessage(error, 'No pudimos guardar las alertas. Intenta nuevamente.'),
          ),
      });
  }

  protected drawName(draw: DrawReport | DrawNumberReport): string {
    return drawLabel({ drawType: draw.drawType, scheduledAt: draw.scheduledAt });
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 0 }).format(value);
  }

  protected dateLabel(): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(`${this.selectedDate}T12:00:00-06:00`));
  }

  protected updatedLabel(): string {
    const updated = this.lastUpdatedAt();
    if (!updated) return 'Pendiente de actualización';
    return `Actualizado ${new Intl.DateTimeFormat('es-NI', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'America/Managua',
    }).format(updated)}`;
  }

  protected exceedsAlert(item: NumberReport): boolean {
    const settings = this.notificationSettings();
    return (
      !!settings?.numberExposureEnabled && item.potentialPayout > settings.numberExposureThreshold
    );
  }

  private loadFilterOptions(): void {
    if (this.auth.user()?.role === 'SELLER') return;
    forkJoin({
      routes: this.api.getRoutes().pipe(catchError(() => of([] as RouteSummary[]))),
      users: this.loadAllUsers().pipe(catchError(() => of([] as ManagedUser[]))),
      settings: this.auth.isAdmin()
        ? this.api.getNotificationSettings().pipe(catchError(() => of(null)))
        : of(null),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ routes, users, settings }) => {
        this.routes.set(routes);
        this.sellers.set(
          users
            .filter((user) => user.role === 'SELLER')
            .sort((left, right) => left.fullName.localeCompare(right.fullName, 'es')),
        );
        this.notificationSettings.set(settings);
        if (settings) this.applyAlertSettings(settings);
      });
  }

  private applyAlertSettings(settings: NotificationSettings): void {
    this.alertEnabled = settings.numberExposureEnabled;
    this.alertThreshold = settings.numberExposureThreshold;
  }

  private loadAllUsers(): Observable<ManagedUser[]> {
    return this.api.getUsers(0, 100).pipe(
      expand((page) =>
        page.page + 1 < page.totalPages ? this.api.getUsers(page.page + 1, 100) : EMPTY,
      ),
      map((page) => page.content),
      reduce((users, page) => [...users, ...page], [] as ManagedUser[]),
    );
  }

  private loadDraws(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api
      .getDrawReports(this.selectedDate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (draws) => {
          const newest = [...draws].sort(newestDrawFirst);
          this.draws.set(newest);
          const preferred = this.selectedDrawId || this.requestedDrawId;
          this.selectedDrawId = newest.some((draw) => draw.drawId === preferred)
            ? preferred
            : (newest.find((draw) => draw.ticketCount > 0)?.drawId ?? newest[0]?.drawId ?? '');
          this.loadReport();
        },
        error: (error: HttpErrorResponse) => {
          this.draws.set([]);
          this.report.set(null);
          this.loading.set(false);
          if (error.status !== 404) {
            this.errorMessage.set(apiErrorMessage(error, 'No pudimos cargar los sorteos.'));
          }
        },
      });
  }

  protected loadReport(background = false): void {
    if (!this.selectedDrawId) {
      this.report.set(null);
      this.loading.set(false);
      return;
    }
    if (
      background &&
      (document.visibilityState !== 'visible' || this.loading() || this.refreshing())
    ) {
      return;
    }
    if (background) this.refreshing.set(true);
    else this.loading.set(true);
    this.api
      .getDrawNumberReport(
        this.selectedDrawId,
        this.selectedSellerId || undefined,
        this.selectedRouteId || undefined,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.lastUpdatedAt.set(new Date());
          this.errorMessage.set(null);
          this.loading.set(false);
          this.refreshing.set(false);
          this.rememberFilters();
        },
        error: (error: unknown) => {
          if (!background) this.report.set(null);
          this.loading.set(false);
          this.refreshing.set(false);
          this.errorMessage.set(
            apiErrorMessage(error, 'No pudimos calcular el premio comprometido.'),
          );
        },
      });
  }

  private rememberFilters(): void {
    this.filterState.save<ExposureFilterState>('exposure', {
      date: this.selectedDate,
      drawId: this.selectedDrawId,
      routeId: this.selectedRouteId,
      sellerId: this.selectedSellerId,
      showOnlyWithSales: this.showOnlyWithSales,
      idealProfit: this.idealProfit,
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

interface ExposureFilterState {
  date: string;
  drawId: string;
  routeId: string;
  sellerId: string;
  showOnlyWithSales: boolean;
  idealProfit: number | null;
}
