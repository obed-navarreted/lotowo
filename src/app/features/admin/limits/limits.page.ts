import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { LotoApiService } from '../../../core/api/loto-api.service';
import {
  LimitDrawType,
  ManagedRoute,
  ManagedUser,
  SystemNumberLimitPolicy,
} from '../../../core/models/admin.models';
import { PageResponse } from '../../../core/models/api.models';
import { apiErrorMessage } from '../../../shared/api-error';
import { Icon } from '../../../shared/icon/icon';

type LimitScope = 'GENERAL' | 'ROUTES' | 'SELLERS';

interface GeneralLimitDraft {
  enabled: boolean;
  defaultLimit: number | null;
  overrides: Record<string, string | number>;
  excludedSellerIds: Set<string>;
}

@Component({
  selector: 'lo-limits-page',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './limits.page.html',
  styleUrl: './limits.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LimitsPage implements OnInit {
  private readonly api = inject(LotoApiService);
  protected readonly numbers = Array.from({ length: 100 }, (_, index) =>
    String(index).padStart(2, '0'),
  );
  protected readonly selectedScope = signal<LimitScope>('GENERAL');
  protected readonly selectedType = signal<LimitDrawType>('DAILY');
  protected readonly drafts = signal<Record<LimitDrawType, GeneralLimitDraft>>({
    DAILY: this.emptyDraft(),
    NATIONAL_LOTTERY: this.emptyDraft(),
  });
  protected readonly current = computed(() => this.drafts()[this.selectedType()]);
  protected readonly routes = signal<ManagedRoute[]>([]);
  protected readonly sellers = signal<ManagedUser[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly query = signal('');

  protected readonly filteredRoutes = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('es');
    if (!query) return this.routes();
    return this.routes().filter((route) =>
      `${route.code} ${route.name}`.toLocaleLowerCase('es').includes(query),
    );
  });

  protected readonly filteredSellers = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('es');
    if (!query) return this.sellers();
    return this.sellers().filter((seller) =>
      `${seller.fullName} ${seller.username} ${seller.routeName ?? ''}`
        .toLocaleLowerCase('es')
        .includes(query),
    );
  });

  ngOnInit(): void {
    forkJoin({
      limits: this.api.getSystemNumberLimits(),
      routes: this.api
        .getManagedRoutes(0, 200)
        .pipe(catchError((error: unknown) => this.emptyPage<ManagedRoute>(error))),
      users: this.api
        .getUsers(0, 500)
        .pipe(catchError((error: unknown) => this.emptyPage<ManagedUser>(error))),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ limits, routes, users }) => {
          const policies = Object.fromEntries(
            limits.policies.map((policy) => [policy.drawType, this.toDraft(policy)]),
          ) as Partial<Record<LimitDrawType, GeneralLimitDraft>>;
          this.drafts.set({
            DAILY: policies.DAILY ?? this.emptyDraft(),
            NATIONAL_LOTTERY: policies.NATIONAL_LOTTERY ?? this.emptyDraft(),
          });
          this.routes.set(
            [...routes.content].sort((left, right) =>
              `${left.code} ${left.name}`.localeCompare(`${right.code} ${right.name}`, 'es'),
            ),
          );
          this.sellers.set(
            users.content
              .filter((user) => user.role === 'SELLER')
              .sort((left, right) => left.fullName.localeCompare(right.fullName, 'es')),
          );
        },
        error: (apiError: unknown) =>
          this.error.set(apiErrorMessage(apiError, 'No pudimos cargar la gestión de límites.')),
      });
  }

  protected selectScope(scope: LimitScope): void {
    this.selectedScope.set(scope);
    this.query.set('');
    this.error.set('');
    this.notice.set('');
  }

  protected setQuery(value: string): void {
    this.query.set(value);
  }

  protected selectGeneralMode(enabled: boolean): void {
    this.updateCurrent((draft) => ({ ...draft, enabled }));
    this.error.set('');
    this.notice.set('');
  }

  protected selectType(type: LimitDrawType): void {
    if (this.saving()) return;
    this.selectedType.set(type);
    this.error.set('');
    this.notice.set('');
  }

  protected setDefaultLimit(value: number | null): void {
    this.updateCurrent((draft) => ({ ...draft, defaultLimit: this.normalize(value) }));
  }

  protected setNumberLimit(number: string, rawValue: string | number | null): void {
    this.updateCurrent((draft) => ({
      ...draft,
      overrides: {
        ...draft.overrides,
        [number]: rawValue === null || rawValue === undefined ? '' : rawValue,
      },
    }));
    this.notice.set('');
  }

  protected clearNumber(number: string): void {
    const next = { ...this.current().overrides };
    delete next[number];
    this.updateCurrent((draft) => ({ ...draft, overrides: next }));
  }

  protected clearOverrides(): void {
    this.updateCurrent((draft) => ({ ...draft, overrides: {} }));
    this.notice.set('');
  }

  protected isOverride(number: string): boolean {
    const val = this.current().overrides[number];
    return val !== null && val !== undefined && Boolean(String(val).trim());
  }

  protected isBlocked(number: string): boolean {
    const val = this.current().overrides[number];
    if (val === null || val === undefined) return false;
    const value = String(val).trim();
    return value !== '' && Number(value) === 0;
  }

  protected overrideCount(): number {
    return Object.values(this.current().overrides).filter((value) => value !== null && value !== undefined && String(value).trim() !== '').length;
  }

  protected toggleExcluded(sellerId: string, checked: boolean): void {
    const next = new Set(this.current().excludedSellerIds);
    if (checked) next.add(sellerId);
    else next.delete(sellerId);
    this.updateCurrent((draft) => ({ ...draft, excludedSellerIds: next }));
    this.notice.set('');
  }

  protected saveGeneral(): void {
    const current = this.current();
    this.error.set('');
    this.notice.set('');

    const defaultLimit = this.normalize(current.defaultLimit);
    const limitOverrides: { number: string; limit: number }[] = [];
    for (const number of this.numbers) {
      const entry = current.overrides[number];
      if (entry === null || entry === undefined) continue;
      const raw = String(entry).trim();
      if (!raw) continue;
      const limit = Number(raw);
      if (!Number.isFinite(limit) || limit < 0) {
        this.error.set(`El límite del número ${number} no es válido.`);
        return;
      }
      limitOverrides.push({ number, limit });
    }
    if (current.enabled && defaultLimit === null && limitOverrides.length === 0) {
      this.error.set('Indica un límite general o al menos un número específico.');
      return;
    }

    this.saving.set(true);
    this.api
      .updateSystemNumberLimits(this.selectedType(), {
        enabled: current.enabled,
        defaultLimit,
        overrides: limitOverrides,
        excludedSellerIds: [...current.excludedSellerIds],
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (response) => {
          const policy = response.policies.find((item) => item.drawType === this.selectedType());
          if (policy) this.setPolicy(policy);
          this.notice.set(
            `La regla general de ${this.typeLabel(this.selectedType())} fue guardada correctamente.`,
          );
        },
        error: (apiError: unknown) =>
          this.error.set(apiErrorMessage(apiError, 'No pudimos guardar la regla general.')),
      });
  }

  protected typeLabel(type: LimitDrawType): string {
    return type === 'DAILY' ? 'sorteos diarios' : 'Lotería Nacional';
  }

  private updateCurrent(update: (draft: GeneralLimitDraft) => GeneralLimitDraft): void {
    const type = this.selectedType();
    this.drafts.update((drafts) => ({ ...drafts, [type]: update(drafts[type]) }));
    this.notice.set('');
  }

  private setPolicy(policy: SystemNumberLimitPolicy): void {
    this.drafts.update((drafts) => ({ ...drafts, [policy.drawType]: this.toDraft(policy) }));
  }

  private toDraft(policy: SystemNumberLimitPolicy): GeneralLimitDraft {
    return {
      enabled: policy.enabled,
      defaultLimit: policy.defaultLimit,
      overrides: Object.fromEntries(
        policy.overrides.map((item) => [item.number, String(item.limit)]),
      ),
      excludedSellerIds: new Set(policy.excludedSellerIds),
    };
  }

  private emptyDraft(): GeneralLimitDraft {
    return { enabled: false, defaultLimit: null, overrides: {}, excludedSellerIds: new Set() };
  }

  private emptyPage<T>(error: unknown) {
    if (!(error instanceof HttpErrorResponse) || error.status !== 404) throw error;
    return of<PageResponse<T>>({
      content: [],
      page: 0,
      size: 0,
      totalElements: 0,
      totalPages: 0,
    });
  }

  private normalize(value: number | null): number | null {
    if (value === null || value === undefined || `${value}`.trim() === '') return null;
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
  }
}
