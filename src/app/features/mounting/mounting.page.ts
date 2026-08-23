import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, of } from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { Draw, MountingMode, MountingReport } from '../../core/models/api.models';
import { MountingImageService } from '../../core/reports/mounting-image.service';
import { apiErrorMessage } from '../../shared/api-error';
import { drawLabel } from '../../shared/draw-label';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'lo-mounting-page',
  imports: [FormsModule, Icon],
  templateUrl: './mounting.page.html',
  styleUrl: './mounting.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MountingPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(LotoApiService);
  private readonly images = inject(MountingImageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly draws = signal<Draw[]>([]);
  protected readonly report = signal<MountingReport | null>(null);
  protected readonly loadingDraws = signal(true);
  protected readonly calculating = signal(false);
  protected readonly exporting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly historyMinDate: string;
  protected readonly today: string;
  protected selectedDate: string;
  protected selectedDrawId = '';
  protected assumedPayout: number | null = 25_000;
  protected selectedMode: MountingMode = 'FREE';
  private drawLoadSequence = 0;

  constructor() {
    this.today = this.localDate(new Date());
    this.selectedDate = this.today;
    const earliest = new Date();
    earliest.setDate(earliest.getDate() - 15);
    this.historyMinDate = this.auth.isAdmin() ? '' : this.localDate(earliest);
    this.loadDraws();
  }

  protected onDateChanged(): void {
    this.selectedDrawId = '';
    this.report.set(null);
    this.loadDraws();
  }

  private loadDraws(): void {
    if (this.historyMinDate && this.selectedDate < this.historyMinDate) {
      this.draws.set([]);
      this.report.set(null);
      this.errorMessage.set('Solo puedes consultar sorteos de los últimos 15 días.');
      return;
    }
    const sequence = ++this.drawLoadSequence;
    const from = new Date(`${this.selectedDate}T00:00:00-06:00`);
    const to = new Date(from.getTime() + 86_400_000 - 1);
    this.loadingDraws.set(true);
    this.errorMessage.set(null);
    this.draws.set([]);
    this.api
      .getDraws(from, to)
      .pipe(
        catchError((error: HttpErrorResponse) => {
          if (error.status === 404) return of([] as Draw[]);
          throw error;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (draws) => {
          if (sequence !== this.drawLoadSequence) return;
          const ordered = [...draws].sort(
            (left, right) =>
              new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime(),
          );
          this.draws.set(ordered);
          this.selectedDrawId = this.defaultDraw(ordered)?.id ?? '';
          this.loadingDraws.set(false);
          if (this.selectedDrawId) this.calculate();
          else this.errorMessage.set('No hay sorteos registrados para la fecha seleccionada.');
        },
        error: (error: unknown) => {
          if (sequence !== this.drawLoadSequence) return;
          this.loadingDraws.set(false);
          this.errorMessage.set(
            apiErrorMessage(error, 'No pudimos cargar los sorteos de ese día.'),
          );
        },
      });
  }

  protected calculate(): void {
    if (this.calculating()) return;
    this.errorMessage.set(null);
    if (!this.selectedDrawId) {
      this.report.set(null);
      this.errorMessage.set('Selecciona un sorteo.');
      return;
    }
    if (this.selectedMode === 'FREE' && !this.validAssumedPayout()) {
      this.report.set(null);
      this.errorMessage.set('Ingresa un premio a asumir igual o mayor que cero.');
      return;
    }
    this.calculating.set(true);
    this.api
      .getMountingReport(
        this.selectedDrawId,
        this.selectedMode === 'FREE' ? this.assumedPayout : null,
        this.selectedMode,
      )
      .pipe(
        finalize(() => this.calculating.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (report) => this.report.set(report),
        error: (error: HttpErrorResponse) => {
          this.report.set(null);
          this.errorMessage.set(apiErrorMessage(error, 'No pudimos calcular los números a pedir.'));
        },
      });
  }

  protected onDrawChanged(): void {
    this.calculate();
  }

  protected selectMode(mode: MountingMode): void {
    if (this.calculating() || this.selectedMode === mode) return;
    this.selectedMode = mode;
    this.report.set(null);
    this.calculate();
  }

  protected modeLabel(mode: MountingMode): string {
    return {
      FREE: 'Libre',
      ZERO_LOSS_WITH_COST: 'Cero pérdida',
      ZERO_LOSS_WITHOUT_COST: 'Ventas vs. premios',
    }[mode];
  }

  protected resultClass(value: number): string {
    return value < 0 ? 'loss' : value > 0 ? 'profit' : '';
  }

  protected async exportImage(): Promise<void> {
    const report = this.report();
    if (!report || this.exporting()) return;
    this.exporting.set(true);
    this.errorMessage.set(null);
    try {
      await this.images.export(report);
    } catch {
      this.errorMessage.set('No pudimos generar la imagen. Intenta nuevamente.');
    } finally {
      this.exporting.set(false);
    }
  }

  protected drawName(draw: Draw | MountingReport): string {
    return drawLabel(draw);
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  protected generatedAt(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Managua',
    }).format(new Date(value));
  }

  protected filterDateLabel(): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(`${this.selectedDate}T12:00:00-06:00`));
  }

  protected scopeLabel(): string {
    return this.auth.isAdmin()
      ? 'Vista general'
      : this.auth.user()?.role === 'SUPERVISOR'
        ? 'Rutas asignadas'
        : 'Mis ventas';
  }

  private defaultDraw(draws: Draw[]): Draw | undefined {
    if (!draws.length) return undefined;
    if (this.selectedDate !== this.today) return draws[0];
    const now = Date.now();
    return (
      draws.find(
        (draw) => draw.status !== 'CANCELLED' && new Date(draw.salesCloseAt).getTime() > now,
      ) ??
      [...draws]
        .reverse()
        .find(
          (draw) => draw.status !== 'CANCELLED' && new Date(draw.scheduledAt).getTime() <= now,
        ) ??
      draws[0]
    );
  }

  private validAssumedPayout(): boolean {
    return (
      this.assumedPayout !== null && Number.isFinite(this.assumedPayout) && this.assumedPayout >= 0
    );
  }

  private localDate(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'America/Managua',
    }).format(date);
  }
}
