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
import { EMPTY, Observable, catchError, expand, finalize, forkJoin, map, of, reduce } from 'rxjs';
import { LotoApiService } from '../../../core/api/loto-api.service';
import {
  LimitDrawType,
  ManagedRoute,
  ManagedUser,
  NumberControl,
  NumberControlSeller,
  SystemNumberLimitPolicy,
} from '../../../core/models/admin.models';
import { PageResponse } from '../../../core/models/api.models';
import { apiErrorMessage } from '../../../shared/api-error';
import { Icon } from '../../../shared/icon/icon';

type LimitScope = 'GENERAL' | 'ROUTES' | 'SELLERS' | 'NUMBER';

const PAGE_SIZE = 100;

interface GeneralLimitDraft {
  enabled: boolean;
  defaultLimit: number | null;
  overrides: Record<string, string | number>;
  excludedSellerIds: Set<string>;
}

interface NumberControlDraft {
  globalBlocked: boolean;
  blockedRouteIds: Set<string>;
  sellerLimits: Record<string, string>;
  initialSellerLimits: Record<string, string>;
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
  protected readonly selectedNumber = signal('03');
  protected readonly numberControl = signal<NumberControl | null>(null);
  protected readonly numberDraft = signal<NumberControlDraft | null>(null);
  protected readonly numberLoading = signal(false);
  protected readonly numberQuery = signal('');

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

  protected readonly filteredNumberSellers = computed(() => {
    const query = this.numberQuery().trim().toLocaleLowerCase('es');
    const sellers = this.numberControl()?.sellers ?? [];
    if (!query) return sellers;
    return sellers.filter((seller) =>
      `${seller.fullName} ${seller.username} ${seller.routeName ?? ''}`
        .toLocaleLowerCase('es')
        .includes(query),
    );
  });

  ngOnInit(): void {
    forkJoin({
      limits: this.api.getSystemNumberLimits(),
      routes: this.loadAll((page) => this.api.getManagedRoutes(page, PAGE_SIZE)),
      users: this.loadAll((page) => this.api.getUsers(page, PAGE_SIZE)),
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
            [...routes].sort((left, right) =>
              `${left.code} ${left.name}`.localeCompare(`${right.code} ${right.name}`, 'es'),
            ),
          );
          this.sellers.set(
            users
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
    if (scope === 'NUMBER') this.loadNumberControl();
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
    if (this.selectedScope() === 'NUMBER') this.loadNumberControl();
  }

  protected selectNumber(number: string): void {
    if (this.saving() || !/^\d{2}$/.test(number)) return;
    this.selectedNumber.set(number);
    this.loadNumberControl();
  }

  protected setGlobalBlock(blocked: boolean): void {
    this.updateNumberDraft((draft) => ({
      ...draft,
      globalBlocked: blocked,
      blockedRouteIds: blocked ? new Set<string>() : draft.blockedRouteIds,
    }));
  }

  protected toggleRouteBlock(routeId: string, blocked: boolean): void {
    this.updateNumberDraft((draft) => {
      const blockedRouteIds = new Set(draft.blockedRouteIds);
      if (blocked) blockedRouteIds.add(routeId);
      else blockedRouteIds.delete(routeId);
      return { ...draft, blockedRouteIds };
    });
  }

  protected setSellerLimit(sellerId: string, value: string | number | null): void {
    this.updateNumberDraft((draft) => ({
      ...draft,
      sellerLimits: {
        ...draft.sellerLimits,
        [sellerId]: value === null || value === undefined ? '' : String(value),
      },
    }));
  }

  protected blockSeller(sellerId: string): void {
    this.setSellerLimit(sellerId, '0');
  }

  protected restoreSellerLimit(sellerId: string): void {
    this.updateNumberDraft((draft) => ({
      ...draft,
      sellerLimits: {
        ...draft.sellerLimits,
        [sellerId]: draft.initialSellerLimits[sellerId] ?? '',
      },
    }));
  }

  protected sellerLimitChanged(sellerId: string): boolean {
    const draft = this.numberDraft();
    if (!draft) return false;
    return (
      this.comparableLimit(draft.sellerLimits[sellerId]) !==
      this.comparableLimit(draft.initialSellerLimits[sellerId])
    );
  }

  protected sellerHardBlocked(seller: NumberControlSeller): boolean {
    const draft = this.numberDraft();
    return Boolean(
      draft?.globalBlocked || (seller.routeId && draft?.blockedRouteIds.has(seller.routeId)),
    );
  }

  protected sellerLimitBlocked(sellerId: string): boolean {
    const value = this.numberDraft()?.sellerLimits[sellerId];
    return value !== undefined && value.trim() !== '' && Number(value) === 0;
  }

  protected sourceLabel(source: NumberControlSeller['source']): string {
    return { SELLER: 'Propio', ROUTE: 'Ruta', SYSTEM: 'General', NONE: 'Sin límite' }[source];
  }

  protected saveNumberControl(): void {
    const draft = this.numberDraft();
    if (!draft) return;
    this.error.set('');
    this.notice.set('');
    const sellerLimits: { sellerId: string; limit: number }[] = [];
    for (const seller of this.numberControl()?.sellers ?? []) {
      if (!this.sellerLimitChanged(seller.id)) continue;
      const raw = draft.sellerLimits[seller.id]?.trim() ?? '';
      const limit = Number(raw);
      if (!raw || !Number.isFinite(limit) || limit < 0) {
        this.error.set(`El límite de ${seller.fullName} no es válido.`);
        return;
      }
      sellerLimits.push({ sellerId: seller.id, limit });
    }
    this.saving.set(true);
    this.api
      .updateNumberControl(this.selectedNumber(), this.selectedType(), {
        globalBlocked: draft.globalBlocked,
        blockedRouteIds: [...draft.blockedRouteIds],
        sellerLimits,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (control) => {
          this.setNumberControl(control);
          this.notice.set(`El control del número ${control.number} fue guardado correctamente.`);
        },
        error: (apiError: unknown) =>
          this.error.set(apiErrorMessage(apiError, 'No pudimos guardar el control del número.')),
      });
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
    return Object.values(this.current().overrides).filter(
      (value) => value !== null && value !== undefined && String(value).trim() !== '',
    ).length;
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

  private loadNumberControl(): void {
    this.numberLoading.set(true);
    this.numberControl.set(null);
    this.numberDraft.set(null);
    this.error.set('');
    this.api
      .getNumberControl(this.selectedNumber(), this.selectedType())
      .pipe(finalize(() => this.numberLoading.set(false)))
      .subscribe({
        next: (control) => this.setNumberControl(control),
        error: (apiError: unknown) =>
          this.error.set(apiErrorMessage(apiError, 'No pudimos cargar el control del número.')),
      });
  }

  private setNumberControl(control: NumberControl): void {
    const sellerLimits = Object.fromEntries(
      control.sellers.map((seller) => [
        seller.id,
        seller.limit === null ? '' : String(seller.limit),
      ]),
    );
    this.numberControl.set(control);
    this.numberDraft.set({
      globalBlocked: control.globalBlocked,
      blockedRouteIds: new Set(
        control.routes.filter((route) => route.blocked).map((route) => route.id),
      ),
      sellerLimits,
      initialSellerLimits: { ...sellerLimits },
    });
  }

  private updateNumberDraft(update: (draft: NumberControlDraft) => NumberControlDraft): void {
    this.numberDraft.update((draft) => (draft ? update(draft) : draft));
    this.notice.set('');
  }

  private comparableLimit(value: string | undefined): string {
    const raw = value?.trim() ?? '';
    if (!raw) return '';
    const number = Number(raw);
    return Number.isFinite(number) ? String(number) : raw;
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

  // El backend limita el tamaño de página a 100 y responde 404 cuando no hay resultados:
  // se recorren todas las páginas y un fallo aquí no debe impedir cargar la regla general.
  private loadAll<T>(fetchPage: (page: number) => Observable<PageResponse<T>>): Observable<T[]> {
    return fetchPage(0).pipe(
      expand((page) => (page.page + 1 < page.totalPages ? fetchPage(page.page + 1) : EMPTY)),
      map((page) => page.content),
      reduce((all, content) => [...all, ...content], [] as T[]),
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 404) {
          this.error.set('No pudimos cargar rutas y vendedores. Solo verás la regla general.');
        }
        return of<T[]>([]);
      }),
    );
  }

  private normalize(value: number | null): number | null {
    if (value === null || value === undefined || `${value}`.trim() === '') return null;
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
  }
}
