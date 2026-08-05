import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { LotoApiService } from '../../../core/api/loto-api.service';
import {
  LimitDrawType,
  RouteLimitSeller,
  RouteNumberLimitPolicy,
  RouteNumberLimits,
} from '../../../core/models/admin.models';
import { apiErrorMessage } from '../../../shared/api-error';
import { Icon } from '../../../shared/icon/icon';

interface RouteLimitDraft {
  configured: boolean;
  enabled: boolean;
  defaultLimit: number | null;
  overrides: Map<string, number>;
  appliesToAll: boolean;
  sellerIds: Set<string>;
}

type LimitMode = 'INHERIT' | 'UNLIMITED' | 'LIMITED';

@Component({
  selector: 'lo-route-limits-page',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './route-limits.page.html',
  styleUrl: './route-limits.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouteLimitsPage implements OnInit {
  private readonly api = inject(LotoApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly routeId = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly numbers = Array.from({ length: 100 }, (_, index) =>
    String(index).padStart(2, '0'),
  );
  protected readonly routeLimits = signal<RouteNumberLimits | null>(null);
  protected readonly selectedType = signal<LimitDrawType>('DAILY');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly drafts = signal<Record<LimitDrawType, RouteLimitDraft>>({
    DAILY: this.emptyDraft(),
    NATIONAL_LOTTERY: this.emptyDraft(),
  });
  protected readonly current = computed(() => this.drafts()[this.selectedType()]);
  protected readonly mode = computed<LimitMode>(() => {
    const draft = this.current();
    if (!draft.configured) return 'INHERIT';
    return draft.enabled ? 'LIMITED' : 'UNLIMITED';
  });

  ngOnInit(): void {
    this.api
      .getRouteNumberLimits(this.routeId)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => this.applyResponse(response),
        error: (apiError: unknown) =>
          this.error.set(
            apiErrorMessage(apiError, 'No fue posible cargar los límites de la ruta.'),
          ),
      });
  }

  protected selectType(type: LimitDrawType): void {
    if (this.saving()) return;
    this.selectedType.set(type);
    this.notice.set('');
    this.error.set('');
  }

  protected setScope(appliesToAll: boolean): void {
    this.updateCurrent((draft) => ({
      ...draft,
      appliesToAll,
      sellerIds: appliesToAll
        ? new Set(this.sellers().map((seller) => seller.id))
        : new Set(draft.sellerIds),
    }));
  }

  protected selectMode(mode: LimitMode): void {
    this.updateCurrent((draft) => ({
      ...draft,
      configured: mode !== 'INHERIT',
      enabled: mode === 'LIMITED',
    }));
    this.error.set('');
  }

  protected toggleSeller(sellerId: string, checked: boolean): void {
    this.updateCurrent((draft) => {
      const sellerIds = new Set(draft.sellerIds);
      if (checked) sellerIds.add(sellerId);
      else sellerIds.delete(sellerId);
      return { ...draft, sellerIds };
    });
  }

  protected selectAllSellers(): void {
    this.updateCurrent((draft) => ({
      ...draft,
      sellerIds: new Set(this.sellers().map((seller) => seller.id)),
    }));
  }

  protected clearSellers(): void {
    this.updateCurrent((draft) => ({ ...draft, sellerIds: new Set() }));
  }

  protected isSellerSelected(sellerId: string): boolean {
    return this.current().sellerIds.has(sellerId);
  }

  protected sellers(): RouteLimitSeller[] {
    return this.routeLimits()?.sellers ?? [];
  }

  protected setDefaultLimit(rawValue: number | null): void {
    this.updateCurrent((draft) => ({ ...draft, defaultLimit: this.normalize(rawValue) }));
  }

  protected effectiveLimit(number: string): number | null {
    const draft = this.current();
    return draft.overrides.has(number) ? draft.overrides.get(number)! : draft.defaultLimit;
  }

  protected setNumberLimit(number: string, rawValue: number | null): void {
    const value = this.normalize(rawValue);
    this.updateCurrent((draft) => {
      const overrides = new Map(draft.overrides);
      if (value === draft.defaultLimit || value === null) overrides.delete(number);
      else overrides.set(number, value);
      return { ...draft, overrides };
    });
  }

  protected resetNumber(number: string): void {
    this.updateCurrent((draft) => {
      const overrides = new Map(draft.overrides);
      overrides.delete(number);
      return { ...draft, overrides };
    });
  }

  protected clearOverrides(): void {
    this.updateCurrent((draft) => ({ ...draft, overrides: new Map() }));
  }

  protected isOverride(number: string): boolean {
    return this.current().overrides.has(number);
  }
  protected isBlocked(number: string): boolean {
    return this.effectiveLimit(number) === 0;
  }

  protected save(): void {
    const draft = this.current();
    if (this.mode() !== 'INHERIT' && !draft.appliesToAll && draft.sellerIds.size === 0) {
      this.error.set('Seleccione al menos un vendedor de la ruta.');
      return;
    }
    if (this.mode() === 'LIMITED' && draft.defaultLimit === null && draft.overrides.size === 0) {
      this.error.set('Indica un límite general o al menos un número específico.');
      return;
    }
    const values = [draft.defaultLimit, ...draft.overrides.values()].filter(
      (value) => value !== null,
    );
    if (values.some((value) => !Number.isFinite(value) || value! < 0)) {
      this.error.set('Todos los límites deben ser montos válidos mayores o iguales a cero.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    const operation =
      this.mode() === 'INHERIT'
        ? this.api.inheritRouteNumberLimits(this.routeId, this.selectedType())
        : this.api.updateRouteNumberLimits(this.routeId, this.selectedType(), {
            enabled: this.mode() === 'LIMITED',
            defaultLimit: draft.defaultLimit,
            overrides: [...draft.overrides.entries()]
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([number, limit]) => ({ number, limit })),
            appliesToAll: draft.appliesToAll,
            sellerIds: [...draft.sellerIds],
          });
    operation.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (response) => {
        this.applyResponse(response);
        this.notice.set(
          `Los límites de ${this.typeLabel(this.selectedType())} se aplicaron correctamente.`,
        );
      },
      error: (apiError: unknown) =>
        this.error.set(apiErrorMessage(apiError, 'No fue posible guardar los límites de la ruta.')),
    });
  }

  protected typeLabel(type: LimitDrawType): string {
    return type === 'DAILY' ? 'sorteos diarios' : 'Lotería Nacional';
  }

  private applyResponse(response: RouteNumberLimits): void {
    this.routeLimits.set(response);
    const policies = Object.fromEntries(
      response.policies.map((policy) => [policy.drawType, this.toDraft(policy)]),
    ) as Partial<Record<LimitDrawType, RouteLimitDraft>>;
    this.drafts.set({
      DAILY: policies['DAILY'] ?? this.emptyDraft(response.sellers),
      NATIONAL_LOTTERY: policies['NATIONAL_LOTTERY'] ?? this.emptyDraft(response.sellers),
    });
  }

  private updateCurrent(update: (draft: RouteLimitDraft) => RouteLimitDraft): void {
    const type = this.selectedType();
    this.drafts.update((drafts) => ({ ...drafts, [type]: update(drafts[type]) }));
    this.notice.set('');
  }

  private toDraft(policy: RouteNumberLimitPolicy): RouteLimitDraft {
    return {
      configured: policy.configured,
      enabled: policy.enabled,
      defaultLimit: policy.defaultLimit ?? null,
      overrides: new Map(policy.overrides.map((item) => [item.number, item.limit])),
      appliesToAll: policy.appliesToAll,
      sellerIds: new Set(policy.sellerIds),
    };
  }

  private emptyDraft(sellers: RouteLimitSeller[] = []): RouteLimitDraft {
    return {
      configured: false,
      enabled: false,
      defaultLimit: null,
      overrides: new Map(),
      appliesToAll: true,
      sellerIds: new Set(sellers.map((seller) => seller.id)),
    };
  }

  private normalize(value: number | null): number | null {
    if (value === null || value === undefined || `${value}`.trim() === '') return null;
    return Math.round(Number(value) * 100) / 100;
  }
}
