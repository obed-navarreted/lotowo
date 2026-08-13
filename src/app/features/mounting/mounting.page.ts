import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { Draw, MountingReport } from '../../core/models/api.models';
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
  protected selectedDrawId = '';
  protected assumedPayout: number | null = 25_000;

  constructor() {
    this.api
      .getSaleableDraws()
      .pipe(
        finalize(() => this.loadingDraws.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (draws) => {
          const ordered = [...draws].sort(
            (left, right) =>
              new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime(),
          );
          this.draws.set(ordered);
          this.selectedDrawId = ordered[0]?.id ?? '';
          if (this.selectedDrawId) this.calculate();
        },
        error: (error: unknown) =>
          this.errorMessage.set(apiErrorMessage(error, 'No pudimos cargar los sorteos vigentes.')),
      });
  }

  protected calculate(): void {
    if (this.calculating()) return;
    this.errorMessage.set(null);
    if (!this.selectedDrawId) {
      this.report.set(null);
      this.errorMessage.set('Selecciona un sorteo vigente.');
      return;
    }
    if (
      this.assumedPayout === null ||
      !Number.isFinite(this.assumedPayout) ||
      this.assumedPayout < 0
    ) {
      this.report.set(null);
      this.errorMessage.set('Ingresa un premio a asumir igual o mayor que cero.');
      return;
    }
    this.calculating.set(true);
    this.api
      .getMountingReport(this.selectedDrawId, this.assumedPayout)
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

  protected scopeLabel(): string {
    return this.auth.isAdmin()
      ? 'Vista general'
      : this.auth.user()?.role === 'SUPERVISOR'
        ? 'Rutas asignadas'
        : 'Mis ventas';
  }
}
