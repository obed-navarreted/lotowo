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
import { finalize, forkJoin } from 'rxjs';
import { LotoApiService } from '../../../core/api/loto-api.service';
import { LimitDrawType, ManagedUser, NumberLimitPolicy } from '../../../core/models/admin.models';
import { apiErrorMessage } from '../../../shared/api-error';
import { Icon } from '../../../shared/icon/icon';

interface LimitDraft {
  configured: boolean;
  enabled: boolean;
  source: NumberLimitPolicy['source'];
  defaultLimit: number | null;
  overrides: Map<string, number>;
  inheritedFromRoute: boolean;
  sourceRouteName: string | null;
}

type LimitMode = 'INHERIT' | 'UNLIMITED' | 'LIMITED';

@Component({
  selector: 'lo-seller-limits-page',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './seller-limits.page.html',
  styleUrl: './seller-limits.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellerLimitsPage implements OnInit {
  private readonly api = inject(LotoApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly sellerId = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly numbers = Array.from({ length: 100 }, (_, index) =>
    String(index).padStart(2, '0'),
  );
  protected readonly user = signal<ManagedUser | null>(null);
  protected readonly selectedType = signal<LimitDrawType>('DAILY');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly drafts = signal<Record<LimitDrawType, LimitDraft>>({
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
    forkJoin({
      user: this.api.getUser(this.sellerId),
      limits: this.api.getSellerNumberLimits(this.sellerId),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ user, limits }) => {
          this.user.set(user);
          const policies = Object.fromEntries(
            limits.policies.map((policy) => [policy.drawType, this.toDraft(policy)]),
          ) as Partial<Record<LimitDrawType, LimitDraft>>;
          this.drafts.set({
            DAILY: policies['DAILY'] ?? this.emptyDraft(),
            NATIONAL_LOTTERY: policies['NATIONAL_LOTTERY'] ?? this.emptyDraft(),
          });
        },
        error: (apiError: unknown) =>
          this.error.set(
            apiErrorMessage(apiError, 'No fue posible cargar los límites del vendedor.'),
          ),
      });
  }

  protected selectType(type: LimitDrawType): void {
    if (!this.saving()) {
      this.selectedType.set(type);
      this.notice.set('');
      this.error.set('');
    }
  }

  protected setDefaultLimit(rawValue: number | null): void {
    const value = this.normalize(rawValue);
    this.updateCurrent((draft) => ({ ...draft, defaultLimit: value }));
  }

  protected selectMode(mode: LimitMode): void {
    this.updateCurrent((draft) => ({
      ...draft,
      configured: mode !== 'INHERIT',
      enabled: mode === 'LIMITED',
    }));
    this.error.set('');
  }

  protected effectiveLimit(number: string): number | null {
    const draft = this.current();
    return draft.overrides.has(number) ? draft.overrides.get(number)! : draft.defaultLimit;
  }

  protected setNumberLimit(number: string, rawValue: number | null): void {
    const value = this.normalize(rawValue);
    this.updateCurrent((draft) => {
      const overrides = new Map(draft.overrides);
      if (value === draft.defaultLimit || (value === null && draft.defaultLimit === null))
        overrides.delete(number);
      else if (value !== null) overrides.set(number, value);
      else overrides.delete(number);
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
        ? this.api.inheritSellerNumberLimits(this.sellerId, this.selectedType())
        : this.api.updateSellerNumberLimits(this.sellerId, this.selectedType(), {
            enabled: this.mode() === 'LIMITED',
            defaultLimit: draft.defaultLimit,
            overrides: [...draft.overrides.entries()]
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([number, limit]) => ({ number, limit })),
          });
    operation.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (response) => {
        const policy = response.policies.find((item) => item.drawType === this.selectedType());
        if (policy) this.setPolicy(policy);
        this.notice.set(`La regla de ${this.typeLabel(this.selectedType())} fue guardada.`);
      },
      error: (apiError: unknown) =>
        this.error.set(apiErrorMessage(apiError, 'No fue posible guardar los límites.')),
    });
  }

  protected typeLabel(type: LimitDrawType): string {
    return type === 'DAILY' ? 'sorteos diarios' : 'Lotería Nacional';
  }

  protected inheritedLabel(): string {
    const draft = this.current();
    if (draft.source === 'ROUTE') return `Ruta ${draft.sourceRouteName ?? ''}`.trim();
    if (draft.source === 'SYSTEM') return 'Configuración general';
    return 'Sin límites heredados';
  }

  private updateCurrent(update: (draft: LimitDraft) => LimitDraft): void {
    const type = this.selectedType();
    this.drafts.update((drafts) => ({ ...drafts, [type]: update(drafts[type]) }));
    this.notice.set('');
  }

  private setPolicy(policy: NumberLimitPolicy): void {
    this.drafts.update((drafts) => ({ ...drafts, [policy.drawType]: this.toDraft(policy) }));
  }

  private toDraft(policy: NumberLimitPolicy): LimitDraft {
    return {
      configured: policy.configured,
      enabled: policy.enabled,
      source: policy.source,
      defaultLimit: policy.defaultLimit ?? null,
      overrides: new Map(policy.overrides.map((item) => [item.number, item.limit])),
      inheritedFromRoute: policy.inheritedFromRoute ?? false,
      sourceRouteName: policy.sourceRouteName ?? null,
    };
  }

  private emptyDraft(): LimitDraft {
    return {
      configured: false,
      enabled: false,
      source: 'NONE',
      defaultLimit: null,
      overrides: new Map(),
      inheritedFromRoute: false,
      sourceRouteName: null,
    };
  }

  private normalize(value: number | null): number | null {
    if (value === null || value === undefined || `${value}`.trim() === '') return null;
    return Math.round(Number(value) * 100) / 100;
  }
}
