import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, forkJoin, of, throwError } from 'rxjs';
import { LotoApiService } from '../../../core/api/loto-api.service';
import { Draw } from '../../../core/models/api.models';
import { apiErrorMessage } from '../../../shared/api-error';
import { Icon } from '../../../shared/icon/icon';
import { newestDrawFirst } from '../../../shared/result-order';

@Component({
  selector: 'lo-national-draws-page',
  imports: [FormsModule, Icon],
  templateUrl: './national-draws.page.html',
  styleUrl: './national-draws.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NationalDrawsPage implements OnInit {
  private readonly api = inject(LotoApiService);
  protected readonly draws = signal<Draw[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly sequenceLocked = signal(false);
  protected readonly error = signal('');
  protected readonly formError = signal('');
  protected readonly notice = signal('');
  protected name = '';
  protected nationalSequence: number | null = null;
  protected readonly today = this.defaultLocalDate(0);
  protected scheduledDate = this.defaultLocalDate(7);
  protected scheduledTime = '20:00';
  protected salesCloseDate = this.defaultLocalDate(7);
  protected salesCloseTime = '20:00';

  ngOnInit(): void {
    this.load();
  }

  protected save(): void {
    if (!this.name.trim()) {
      this.formError.set('Ingrese el nombre del sorteo.');
      return;
    }
    if (!Number.isInteger(Number(this.nationalSequence)) || Number(this.nationalSequence) <= 0) {
      this.formError.set('Ingrese un consecutivo válido mayor que cero.');
      return;
    }
    const scheduled = this.nicaraguaInstant(this.scheduledDate, this.scheduledTime);
    const closes = this.nicaraguaInstant(this.salesCloseDate, this.salesCloseTime);
    if (!scheduled || !closes) {
      this.formError.set('Ingrese fechas válidas con formato DD/MM/AAAA y sus respectivas horas.');
      return;
    }
    if (new Date(closes) > new Date(scheduled)) {
      this.formError.set('El cierre de ventas no puede ser posterior al sorteo.');
      return;
    }

    this.saving.set(true);
    this.formError.set('');
    this.notice.set('');
    this.api
      .createNationalDraw({
        name: this.name.trim(),
        nationalSequence: Number(this.nationalSequence),
        scheduledAt: scheduled,
        salesCloseAt: closes,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (draw) => {
          this.draws.update((draws) =>
            [draw, ...draws].sort(
              (left, right) => (right.nationalSequence ?? 0) - (left.nationalSequence ?? 0),
            ),
          );
          this.nationalSequence = (draw.nationalSequence ?? 0) + 1;
          this.sequenceLocked.set(true);
          this.name = '';
          this.notice.set(
            `El sorteo #${draw.nationalSequence} quedó creado y disponible hasta su cierre.`,
          );
        },
        error: (apiError: unknown) =>
          this.formError.set(
            apiErrorMessage(apiError, 'No fue posible crear el sorteo de lotería.'),
          ),
      });
  }

  protected dateTime(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Managua',
    }).format(new Date(value));
  }

  protected dateLabel(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Selecciona una fecha';
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(`${value}T12:00:00-06:00`));
  }

  protected statusLabel(status: Draw['status']): string {
    return (
      {
        OPEN: 'Abierto',
        SCHEDULED: 'Programado',
        CLOSED: 'Cerrado',
        RESULT_ENTERED: 'Con resultado',
        SETTLED: 'Liquidado',
        CANCELLED: 'Cancelado',
      } as const
    )[status];
  }

  private load(): void {
    this.loading.set(true);
    const draws$ = this.api
      .getNationalDraws()
      .pipe(
        catchError((error: HttpErrorResponse) =>
          error.status === 404 ? of([] as Draw[]) : throwError(() => error),
        ),
      );
    forkJoin({ draws: draws$, sequence: this.api.getNationalSequence() })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ draws, sequence }) => {
          this.draws.set([...draws].sort(newestDrawFirst));
          this.nationalSequence = sequence.nextSequence;
          this.sequenceLocked.set(sequence.nextSequence !== null);
        },
        error: (apiError: unknown) =>
          this.error.set(
            apiErrorMessage(apiError, 'No fue posible cargar los sorteos de lotería.'),
          ),
      });
  }

  private nicaraguaInstant(dateValue: string, timeValue: string): string | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
    if (!match || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue)) return null;
    const [, year, month, day] = match;
    const calendarDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      calendarDate.getUTCFullYear() !== Number(year) ||
      calendarDate.getUTCMonth() !== Number(month) - 1 ||
      calendarDate.getUTCDate() !== Number(day)
    )
      return null;
    const parsed = new Date(`${year}-${month}-${day}T${timeValue}:00-06:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private defaultLocalDate(daysAhead: number): string {
    const date = new Date(Date.now() + daysAhead * 86_400_000);
    const parts = new Intl.DateTimeFormat('es-NI', {
      timeZone: 'America/Managua',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values['year']}-${values['month']}-${values['day']}`;
  }
}
