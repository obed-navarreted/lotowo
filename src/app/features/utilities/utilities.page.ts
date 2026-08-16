import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ManagedUser, RouteSummary } from '../../core/models/admin.models';
import {
  BusinessFinanceSummary,
  BusinessFinanceDetails,
  BusinessMountingDetail,
  Draw,
  UtilityDrawSummary,
  UtilitySellerSummary,
  UtilitySummary,
} from '../../core/models/api.models';
import { OperationalReportPdfService } from '../../core/reports/operational-report-pdf.service';
import {
  WeeklyRouteSales,
  WeeklySalesZipService,
} from '../../core/reports/weekly-sales-zip.service';
import { apiErrorMessage } from '../../shared/api-error';
import { drawLabel } from '../../shared/draw-label';
import { Icon } from '../../shared/icon/icon';
import { groupUtilitiesByDay, UtilityDay } from '../../shared/utility-days';

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
  private readonly weeklyZip = inject(WeeklySalesZipService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly draws = signal<Draw[]>([]);
  protected readonly routes = signal<RouteSummary[]>([]);
  protected readonly sellers = signal<ManagedUser[]>([]);
  protected readonly summary = signal<UtilitySummary | null>(null);
  protected readonly businessSummary = signal<BusinessFinanceSummary | null>(null);
  protected readonly businessDetails = signal<BusinessFinanceDetails | null>(null);
  protected readonly loading = signal(true);
  protected readonly exporting = signal<'A4' | 'MOBILE' | 'ZIP' | null>(null);
  protected readonly filterLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly historyMinDate: string;
  protected readonly today = this.localDate(new Date());
  protected fromDate = this.weekStart(this.today);
  protected toDate = this.today;
  protected selectedDrawIds: string[] = [];
  protected allDrawsSelected = true;
  protected selectedSellerId = '';
  protected selectedRouteId = '';
  protected includeCommissions = false;
  protected includeMovements = false;
  protected includeDraws = true;

  constructor() {
    const earliest = new Date();
    earliest.setDate(earliest.getDate() - 14);
    this.historyMinDate = this.auth.isAdmin() ? '' : this.localDate(earliest);
    if (this.auth.user()?.role !== 'SELLER') {
      this.api
        .getRoutes()
        .pipe(
          catchError(() => of([] as RouteSummary[])),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((routes) =>
          this.routes.set(
            [...routes].sort((left, right) => left.name.localeCompare(right.name, 'es')),
          ),
        );
      this.api
        .getUsers(0, 100)
        .pipe(
          catchError(() => of({ content: [] as ManagedUser[] })),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((users) =>
          this.sellers.set(users.content.filter((user) => user.role === 'SELLER')),
        );
    }
    this.loadPeriod();
  }

  protected onFromDateChanged(): void {
    if (this.toDate < this.fromDate) this.toDate = this.fromDate;
    this.resetDrawSelection();
    this.loadPeriod();
  }

  protected onToDateChanged(): void {
    if (this.fromDate > this.toDate) this.fromDate = this.toDate;
    this.resetDrawSelection();
    this.loadPeriod();
  }

  protected applyFilters(): void {
    if (this.isSingleDay() && !this.allDrawsSelected && !this.selectedDrawIds.length) {
      this.errorMessage.set('Selecciona al menos un turno o marca Todos.');
      return;
    }
    if (this.selectedRouteId || this.selectedSellerId || !this.allDrawsSelected) {
      this.includeMovements = false;
    }
    this.loadSummary();
  }

  protected onFinanceOptionsChanged(): void {
    this.loadBusinessSummary();
  }

  protected exportReport(format: 'A4' | 'MOBILE'): void {
    const report = this.summary();
    if (!report || this.exporting()) return;
    this.exporting.set(format);
    this.errorMessage.set(null);
    const options = {
      includeCommissions: this.includeCommissions,
      includeDraws: this.includeDraws,
      includeMovements: this.includeMovements,
      scopeLabel: this.selectedRoute()?.name,
      businessSummary: format === 'A4' ? this.businessSummary() : null,
      businessDetails: format === 'A4' ? this.businessDetails() : null,
    };
    const exportOperation =
      format === 'MOBILE'
        ? this.pdf.exportUtilitiesMobile(report, options)
        : this.pdf.exportUtilities(report, options);
    void exportOperation
      .catch(() => this.errorMessage.set('No pudimos generar el reporte PDF.'))
      .finally(() => this.exporting.set(null));
  }

  protected canExportWeeklyZip(): boolean {
    if (
      !this.auth.isAdmin() ||
      this.selectedRouteId ||
      this.selectedSellerId ||
      !this.allDrawsSelected ||
      !this.routes().length ||
      this.isNativeRuntime()
    ) {
      return false;
    }
    const from = new Date(`${this.fromDate}T12:00:00-06:00`);
    const to = new Date(`${this.toDate}T12:00:00-06:00`);
    return (
      from.getUTCDay() === 6 &&
      to.getUTCDay() === 5 &&
      Math.round((to.getTime() - from.getTime()) / 86_400_000) === 6
    );
  }

  protected exportWeeklyZip(): void {
    const report = this.summary();
    if (!report || !this.canExportWeeklyZip() || this.exporting()) return;
    this.exporting.set('ZIP');
    this.errorMessage.set(null);
    const routeReports = this.routes().map((route) =>
      this.api.getUtilitySummary(this.fromDate, this.toDate, [], undefined, route.id).pipe(
        map((routeReport) => ({ route, report: routeReport }) satisfies WeeklyRouteSales),
        catchError((error: HttpErrorResponse) =>
          error.status === 404
            ? of(null)
            : (() => {
                throw error;
              })(),
        ),
      ),
    );
    forkJoin(routeReports)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (packages) => {
          void this.weeklyZip
            .export(packages.filter((item): item is WeeklyRouteSales => item !== null))
            .catch(() => this.errorMessage.set('No pudimos generar el paquete semanal.'))
            .finally(() => this.exporting.set(null));
        },
        error: () => {
          this.exporting.set(null);
          this.errorMessage.set('No pudimos preparar las ventas de cada ruta.');
        },
      });
  }

  protected onAllDrawsChanged(selected: boolean): void {
    this.allDrawsSelected = selected;
    if (selected) this.selectedDrawIds = [];
    else this.includeMovements = false;
  }

  protected toggleDraw(drawId: string, selected: boolean): void {
    this.selectedDrawIds = selected
      ? [...new Set([...this.selectedDrawIds, drawId])]
      : this.selectedDrawIds.filter((id) => id !== drawId);
  }

  protected drawSelected(drawId: string): boolean {
    return this.selectedDrawIds.includes(drawId);
  }

  protected drawSelectionLabel(): string {
    if (!this.isSingleDay()) return 'Disponible al consultar un solo día';
    if (this.allDrawsSelected) return 'Todos los turnos';
    if (!this.selectedDrawIds.length) return 'Selecciona los turnos';
    return `${this.selectedDrawIds.length} ${
      this.selectedDrawIds.length === 1 ? 'turno seleccionado' : 'turnos seleccionados'
    }`;
  }

  protected drawShort(entry: UtilityDrawSummary): string {
    const hour = this.hourLabel(entry.scheduledAt);
    return entry.drawType === 'NATIONAL_LOTTERY' ? `${hour} · Lotería` : hour;
  }

  protected drawOptionName(draw: Draw): string {
    return `${draw.drawType === 'NATIONAL_LOTTERY' ? 'Lotería' : 'LOTO'} ${this.hourLabel(
      draw.scheduledAt,
    )}`;
  }

  protected winnerAndTickets(entry: UtilityDrawSummary): string {
    const winner = entry.pendingResult ? 'Ganador pendiente' : `Ganador ${entry.winningNumber}`;
    return `${winner} · ${entry.ticketCount} ${entry.ticketCount === 1 ? 'boleto' : 'boletos'}`;
  }

  protected resultState(value: number): 'profit' | 'loss' | 'neutral' {
    return value > 0 ? 'profit' : value < 0 ? 'loss' : 'neutral';
  }

  protected clearFilters(): void {
    this.fromDate = this.weekStart(this.today);
    this.toDate = this.today;
    this.resetDrawSelection();
    this.selectedSellerId = '';
    this.selectedRouteId = '';
    this.loadPeriod();
  }

  protected onRouteChanged(): void {
    if (this.selectedRouteId) this.includeMovements = false;
    if (
      this.selectedSellerId &&
      !this.sellers().some(
        (seller) => seller.id === this.selectedSellerId && seller.routeId === this.selectedRouteId,
      )
    ) {
      this.selectedSellerId = '';
    }
    this.applyFilters();
  }

  protected visibleSellers(): ManagedUser[] {
    return this.selectedRouteId
      ? this.sellers().filter((seller) => seller.routeId === this.selectedRouteId)
      : this.sellers();
  }

  protected selectedRoute(): RouteSummary | undefined {
    return this.routes().find((route) => route.id === this.selectedRouteId);
  }

  protected drawName(draw: Draw): string {
    return drawLabel(draw);
  }

  protected selectedContext(): string {
    const route = this.selectedRoute();
    const routeContext = route ? ` · ${route.name}` : '';
    if (!this.allDrawsSelected && this.selectedDrawIds.length === 1) {
      const draw = this.draws().find((item) => item.id === this.selectedDrawIds[0]);
      if (draw) return `${this.drawName(draw)}${routeContext}`;
    }
    if (!this.allDrawsSelected && this.selectedDrawIds.length > 1) {
      return `${this.selectedDrawIds.length} turnos seleccionados${routeContext}`;
    }
    return `${
      this.isSingleDay() ? 'Todos los turnos del día' : 'Todos los turnos del período'
    }${routeContext}`;
  }

  protected ticketsQuery(): Record<string, string> {
    return {
      date: this.fromDate,
      ...(this.selectedDrawIds.length === 1 ? { drawId: this.selectedDrawIds[0] } : {}),
      ...(this.selectedSellerId ? { sellerId: this.selectedSellerId } : {}),
    };
  }

  protected isSingleDay(): boolean {
    return this.fromDate === this.toDate;
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  protected signedMoney(value: number): string {
    return value > 0 ? `+${this.money(value)}` : this.money(value);
  }

  protected resultValue(result: UtilitySummary): number {
    const business = this.businessSummary();
    if (this.auth.isAdmin() && business) return business.businessResult;
    return this.includeCommissions ? result.netAfterCommission : result.netResult;
  }

  protected resultDescription(): string {
    const base = this.includeCommissions ? 'Ventas − premios − comisión' : 'Ventas − premios';
    if (!this.auth.isAdmin() || !this.businessSummary()) return base;
    return `${base} − montadas + premios externos${
      this.includeMovements ? ' − gastos + otros ingresos' : ''
    }`;
  }

  protected mountingResult(mounting: BusinessMountingDetail): number {
    return mounting.externalPrize - mounting.totalStake;
  }

  protected mountingDraw(mounting: BusinessMountingDetail): string {
    const date = new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      timeZone: 'America/Managua',
    }).format(new Date(mounting.scheduledAt));
    return `${mounting.drawType === 'NATIONAL_LOTTERY' ? 'Lotería' : 'LOTO'} · ${date} · ${this.hourLabel(mounting.scheduledAt)}`;
  }

  protected sellerResultValue(seller: UtilitySummary['sellers'][number]): number {
    return this.includeCommissions ? seller.netAfterCommission : seller.netBeforeCommission;
  }

  protected days(seller: UtilitySellerSummary): UtilityDay[] {
    return groupUtilitiesByDay(seller);
  }

  protected dayResultValue(day: UtilityDay): number {
    return this.includeCommissions ? day.netAfterCommission : day.netBeforeCommission;
  }

  protected entryResultValue(entry: UtilityDrawSummary): number {
    return this.includeCommissions ? entry.netAfterCommission : entry.netBeforeCommission;
  }

  protected draw(entry: UtilityDrawSummary): string {
    return drawLabel(entry);
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
          this.draws.set(
            [...draws].sort(
              (left, right) =>
                new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime(),
            ),
          );
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
        this.allDrawsSelected ? [] : this.selectedDrawIds,
        this.selectedSellerId || undefined,
        this.selectedRouteId || undefined,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.summary.set(summary);
          this.loading.set(false);
          this.loadBusinessSummary();
        },
        error: (error: HttpErrorResponse) => {
          this.summary.set(null);
          this.businessSummary.set(null);
          this.businessDetails.set(null);
          this.loading.set(false);
          if (error.status !== 404)
            this.errorMessage.set(apiErrorMessage(error, 'No pudimos calcular las utilidades.'));
        },
      });
  }

  private loadBusinessSummary(): void {
    if (
      !this.auth.isAdmin() ||
      this.selectedRouteId ||
      this.selectedSellerId ||
      !this.allDrawsSelected
    ) {
      this.businessSummary.set(null);
      this.businessDetails.set(null);
      return;
    }
    forkJoin({
      summary: this.api
        .getBusinessFinanceSummary(
          this.fromDate,
          this.toDate,
          this.includeCommissions,
          this.includeMovements,
        )
        .pipe(catchError(() => of(null))),
      details: this.api
        .getBusinessFinanceDetails(this.fromDate, this.toDate)
        .pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ summary, details }) => {
        this.businessSummary.set(summary);
        this.businessDetails.set(details);
      });
  }

  private isNativeRuntime(): boolean {
    const runtime = (
      globalThis as typeof globalThis & {
        Capacitor?: { isNativePlatform?: () => boolean };
      }
    ).Capacitor;
    return runtime?.isNativePlatform?.() === true;
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

  private hourLabel(scheduledAt: string): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: true,
      timeZone: 'America/Managua',
    })
      .format(new Date(scheduledAt))
      .replace(' ', '');
  }

  private resetDrawSelection(): void {
    this.allDrawsSelected = true;
    this.selectedDrawIds = [];
  }
}
