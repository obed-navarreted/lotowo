import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ApiProblem, WinnerDrawSummary } from '../../core/models/api.models';
import { OperationalReportPdfService } from '../../core/reports/operational-report-pdf.service';
import { FilterStateService } from '../../core/navigation/filter-state.service';
import { drawLabel } from '../../shared/draw-label';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'lo-winner-detail-page',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './winner-detail.page.html',
  styleUrl: './winner-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WinnerDetailPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(LotoApiService);
  private readonly pdf = inject(OperationalReportPdfService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filterState = inject(FilterStateService);
  protected readonly winners = signal<WinnerDrawSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly exportingDrawId = signal<string | null>(null);
  protected readonly page = signal(0);
  protected readonly totalPages = signal(0);
  protected readonly totalElements = signal(0);
  protected readonly historyMinDate: string;
  protected from = '';
  protected to = '';

  constructor() {
    const stored = this.filterState.restore<WinnerFilterState>('winner-detail');
    this.from = stored?.from ?? '';
    this.to = stored?.to ?? '';
    this.page.set(Math.max(0, stored?.page ?? 0));
    const earliest = new Date();
    earliest.setDate(earliest.getDate() - 14);
    this.historyMinDate = this.auth.isAdmin() ? '' : this.localDate(earliest);
    this.load();
  }

  protected search(): void {
    if ((this.from && !this.to) || (!this.from && this.to)) {
      this.error.set('Indica ambas fechas para aplicar el rango.');
      return;
    }
    if (this.from && this.to && this.to < this.from) {
      this.error.set('La fecha final debe ser igual o posterior a la inicial.');
      return;
    }
    this.page.set(0);
    this.rememberFilters();
    this.load();
  }

  protected clear(): void {
    this.from = '';
    this.to = '';
    this.page.set(0);
    this.rememberFilters();
    this.load();
  }

  protected previous(): void {
    if (this.page() === 0) return;
    this.page.update((value) => value - 1);
    this.rememberFilters();
    this.load();
  }

  protected next(): void {
    if (this.page() + 1 >= this.totalPages()) return;
    this.page.update((value) => value + 1);
    this.rememberFilters();
    this.load();
  }

  protected export(item: WinnerDrawSummary): void {
    if (this.exportingDrawId()) return;
    this.exportingDrawId.set(item.drawId);
    this.error.set('');
    this.api
      .getDrawSettlementReport(item.drawId)
      .pipe(
        finalize(() => this.exportingDrawId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (report) => {
          void this.pdf
            .exportWinnerDetail(report, this.scopeLabel())
            .catch(() => this.error.set('No pudimos generar el PDF. Intenta nuevamente.'));
        },
        error: (error: HttpErrorResponse) =>
          this.error.set(this.message(error, 'No pudimos cargar el detalle.')),
      });
  }

  protected draw(item: WinnerDrawSummary): string {
    return drawLabel(item);
  }

  protected date(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(value));
  }

  protected queryDate(value: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'America/Managua',
    }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values['year']}-${values['month']}-${values['day']}`;
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  protected absolute(value: number): number {
    return Math.abs(value);
  }

  private load(): void {
    this.rememberFilters();
    this.loading.set(true);
    this.error.set('');
    this.api
      .getWinnerReports(this.page(), 20, this.from || undefined, this.to || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.winners.set(response.content);
          this.totalPages.set(response.totalPages);
          this.totalElements.set(response.totalElements);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.winners.set([]);
          this.totalPages.set(0);
          this.totalElements.set(0);
          this.loading.set(false);
          if (error.status !== 404)
            this.error.set(this.message(error, 'No pudimos cargar los ganadores.'));
        },
      });
  }

  private rememberFilters(): void {
    this.filterState.save<WinnerFilterState>('winner-detail', {
      from: this.from,
      to: this.to,
      page: this.page(),
    });
  }

  private scopeLabel(): string {
    const role = this.auth.user()?.role;
    return role === 'SELLER'
      ? (this.auth.user()?.fullName ?? 'Vendedor')
      : role === 'SUPERVISOR'
        ? 'Rutas supervisadas'
        : 'Todos los vendedores';
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

interface WinnerFilterState {
  from: string;
  to: string;
  page: number;
}
