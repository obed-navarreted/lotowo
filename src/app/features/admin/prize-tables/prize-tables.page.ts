import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { LotoApiService } from '../../../core/api/loto-api.service';
import { ManagedUser, SystemSalesSettings } from '../../../core/models/admin.models';
import { NotificationSettings, PageResponse } from '../../../core/models/api.models';
import { apiErrorMessage } from '../../../shared/api-error';
import { Icon } from '../../../shared/icon/icon';

@Component({
  selector: 'lo-prize-tables-page',
  imports: [FormsModule, Icon],
  templateUrl: './prize-tables.page.html',
  styleUrl: './prize-tables.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrizeTablesPage implements OnInit {
  private readonly api = inject(LotoApiService);
  protected readonly numbers = Array.from({ length: 100 }, (_, index) =>
    index.toString().padStart(2, '0'),
  );
  protected readonly sellers = signal<ManagedUser[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected defaultMultiplier = 80;
  protected numberLimitsEnabled = false;
  protected defaultLimit: number | null = null;
  protected maxTicketPrints = 2;
  protected alertEnabled = false;
  protected alertThreshold = 40_000;
  protected multiplierValues: Record<string, string> = {};
  protected limitValues: Record<string, string> = {};
  protected excludedSellerIds = new Set<string>();

  ngOnInit(): void {
    forkJoin({
      settings: this.api.getSystemSettings(),
      notifications: this.api.getNotificationSettings(),
      users: this.api
        .getUsers(0, 100)
        .pipe(
          catchError(() =>
            of<PageResponse<ManagedUser>>({
              content: [],
              page: 0,
              size: 100,
              totalElements: 0,
              totalPages: 0,
            }),
          ),
        ),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ settings, notifications, users }) => {
          this.apply(settings);
          this.applyNotifications(notifications);
          this.sellers.set(
            users.content
              .filter((user) => user.role === 'SELLER')
              .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')),
          );
        },
        error: (apiError: unknown) =>
          this.error.set(apiErrorMessage(apiError, 'No pudimos cargar la configuración.')),
      });
  }

  protected toggleExcluded(sellerId: string, checked: boolean): void {
    const next = new Set(this.excludedSellerIds);
    if (checked) next.add(sellerId);
    else next.delete(sellerId);
    this.excludedSellerIds = next;
  }

  protected overrideCount(values: Record<string, string>): number {
    return Object.values(values).filter((value) => value.trim() !== '').length;
  }

  protected save(): void {
    this.error.set('');
    this.notice.set('');
    if (!Number.isFinite(this.defaultMultiplier) || this.defaultMultiplier <= 0) {
      this.error.set('El multiplicador general debe ser mayor que cero.');
      return;
    }
    if (this.numberLimitsEnabled && this.defaultLimit === null && !this.overrideCount(this.limitValues)) {
      this.error.set('Indica un límite general o al menos un límite por número.');
      return;
    }
    if (this.maxTicketPrints < 1 || this.maxTicketPrints > 20) {
      this.error.set('El máximo de impresiones debe estar entre 1 y 20.');
      return;
    }
    if (this.alertEnabled && (!Number.isFinite(this.alertThreshold) || this.alertThreshold <= 0)) {
      this.error.set('El monto de alerta debe ser mayor que cero.');
      return;
    }
    const payoutOverrides = this.numberEntries(this.multiplierValues, 'multiplicador').map(
      ({ number, value }) => ({ number, multiplier: value }),
    );
    const limitOverrides = this.numberEntries(this.limitValues, 'límite').map(
      ({ number, value }) => ({ number, limit: value }),
    );
    if (this.error()) return;
    this.saving.set(true);
    forkJoin({
      settings: this.api.updateSystemSettings({
          defaultPayoutMultiplier: Number(this.defaultMultiplier),
          payoutOverrides,
          numberLimitsEnabled: this.numberLimitsEnabled,
          defaultPayoutLimit: this.defaultLimit === null ? null : Number(this.defaultLimit),
          limitOverrides,
          excludedSellerIds: [...this.excludedSellerIds],
          maxTicketPrints: Number(this.maxTicketPrints),
        }),
      notifications: this.api.updateNotificationSettings(
        this.alertEnabled,
        Number(this.alertThreshold),
      ),
    })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: ({ settings, notifications }) => {
          this.apply(settings);
          this.applyNotifications(notifications);
          this.notice.set('Configuración guardada. Las próximas ventas usarán estas reglas.');
        },
        error: (apiError: unknown) =>
          this.error.set(apiErrorMessage(apiError, 'No pudimos guardar la configuración.')),
      });
  }

  private numberEntries(values: Record<string, string>, label: string) {
    const result: { number: string; value: number }[] = [];
    for (const number of this.numbers) {
      const raw = values[number]?.trim();
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || (label === 'multiplicador' && value === 0)) {
        this.error.set(`El ${label} del número ${number} no es válido.`);
        return [];
      }
      result.push({ number, value });
    }
    return result;
  }

  private apply(settings: SystemSalesSettings): void {
    this.defaultMultiplier = settings.defaultPayoutMultiplier;
    this.numberLimitsEnabled = settings.numberLimitsEnabled;
    this.defaultLimit = settings.defaultPayoutLimit;
    this.maxTicketPrints = settings.maxTicketPrints;
    this.multiplierValues = Object.fromEntries(
      settings.payoutOverrides.map((item) => [item.number, String(item.multiplier)]),
    );
    this.limitValues = Object.fromEntries(
      settings.limitOverrides.map((item) => [item.number, String(item.limit)]),
    );
    this.excludedSellerIds = new Set(settings.excludedSellerIds);
  }

  private applyNotifications(settings: NotificationSettings): void {
    this.alertEnabled = settings.numberExposureEnabled;
    this.alertThreshold = settings.numberExposureThreshold;
  }
}
