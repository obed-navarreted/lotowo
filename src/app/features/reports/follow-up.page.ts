import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LotoApiService } from '../../core/api/loto-api.service';
import { RouteSummary } from '../../core/models/admin.models';
import { OperationalReportPdfService } from '../../core/reports/operational-report-pdf.service';
import { apiErrorMessage } from '../../shared/api-error';
import { followUpDrawTimes, followUpTurns, isWeekendDate } from '../../shared/follow-up-sheet';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'lo-follow-up-page',
  imports: [FormsModule, Icon],
  templateUrl: './follow-up.page.html',
  styleUrl: './follow-up.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FollowUpPage {
  private readonly api = inject(LotoApiService);
  private readonly pdf = inject(OperationalReportPdfService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly routes = signal<RouteSummary[]>([]);
  protected readonly loadingRoutes = signal(true);
  protected readonly exporting = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected date = this.localDate(new Date());
  protected routeId = '';

  constructor() {
    this.api
      .getRoutes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (routes) => {
          this.routes.set(routes);
          this.routeId = routes[0]?.id ?? '';
          this.loadingRoutes.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loadingRoutes.set(false);
          this.error.set(apiErrorMessage(error, 'No pudimos cargar las rutas disponibles.'));
        },
      });
  }

  protected generate(): void {
    if (!this.date || !this.routeId || this.exporting()) {
      this.error.set('Selecciona una fecha y una ruta para generar la hoja.');
      return;
    }
    this.exporting.set(true);
    this.error.set('');
    this.notice.set('');
    this.api
      .getFollowUpSheet(this.date, this.routeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sheet) => {
          void this.pdf
            .exportFollowUpSheet(sheet)
            .then(() =>
              this.notice.set(
                `Hoja preparada para ${sheet.routeCode} con ${sheet.sellers.length} vendedores.`,
              ),
            )
            .catch(() => this.error.set('No pudimos crear el PDF de seguimiento.'))
            .finally(() => this.exporting.set(false));
        },
        error: (error: HttpErrorResponse) => {
          this.exporting.set(false);
          this.error.set(apiErrorMessage(error, 'No pudimos preparar la hoja de seguimiento.'));
        },
      });
  }

  protected selectedRoute(): RouteSummary | undefined {
    return this.routes().find((route) => route.id === this.routeId);
  }

  protected dateLabel(): string {
    return new Intl.DateTimeFormat('es-NI', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(`${this.date}T12:00:00-06:00`));
  }

  protected journeyLabel(): string {
    return isWeekendDate(this.date) ? 'Jornada de fin de semana' : 'Jornada regular';
  }

  protected turnsLabel(): string {
    return followUpTurns(this.date).join(' · ');
  }

  protected drawsLabel(): string {
    return followUpDrawTimes(this.date).join(' · ');
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
