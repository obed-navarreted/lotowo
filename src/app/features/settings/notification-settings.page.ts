import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { apiErrorMessage } from '../../shared/api-error';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'lo-notification-settings-page',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './notification-settings.page.html',
  styleUrl: './notification-settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationSettingsPage {
  private readonly api = inject(LotoApiService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);
  protected enabled = false;
  protected threshold: number | null = 40_000;

  constructor() {
    this.api
      .getNotificationSettings()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (settings) => {
          this.enabled = settings.numberExposureEnabled;
          this.threshold = settings.numberExposureThreshold;
        },
        error: (error: unknown) =>
          this.errorMessage.set(apiErrorMessage(error, 'No pudimos cargar la configuración.')),
      });
  }

  protected save(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    if (this.threshold === null || !Number.isFinite(this.threshold) || this.threshold < 1) {
      this.errorMessage.set('Ingresa un monto de alerta mayor o igual a C$1.');
      return;
    }
    this.saving.set(true);
    this.api
      .updateNotificationSettings(this.enabled, this.threshold)
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (settings) => {
          this.enabled = settings.numberExposureEnabled;
          this.threshold = settings.numberExposureThreshold;
          this.successMessage.set('La configuración de alertas fue actualizada.');
        },
        error: (error: unknown) =>
          this.errorMessage.set(apiErrorMessage(error, 'No pudimos guardar la configuración.')),
      });
  }
}
