import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, finalize, Observable, of, switchMap, throwError } from 'rxjs';
import { LotoApiService } from '../../../core/api/loto-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import {
  CreateUserRequest,
  ManagedUser,
  RouteSummary,
} from '../../../core/models/admin.models';
import { PageResponse } from '../../../core/models/api.models';
import { UserRole } from '../../../core/models/auth.models';
import { apiErrorMessage } from '../../../shared/api-error';
import { Icon } from '../../../shared/icon/icon';

interface UserDraft {
  fullName: string;
  username: string;
  role: UserRole;
  hiredOn: string;
  commissionRate: number;
  maxSessions: number;
  routeId: string;
}

@Component({
  selector: 'lo-users-page',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './users.page.html',
  styleUrl: './users.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersPage implements OnInit {
  private readonly api = inject(LotoApiService);
  protected readonly auth = inject(AuthService);
  protected readonly users = signal<PageResponse<ManagedUser> | null>(null);
  protected readonly routes = signal<RouteSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly error = signal('');
  protected readonly formError = signal('');
  protected readonly notice = signal('');
  protected readonly selectedSupervisorRoutes = signal<string[]>([]);
  protected readonly routeCreatorOpen = signal(false);
  protected readonly creatingRoute = signal(false);
  protected readonly assignmentOpen = signal(false);
  protected readonly assignmentLoading = signal(false);
  protected readonly assignmentSaving = signal(false);
  protected readonly assignmentUser = signal<ManagedUser | null>(null);
  protected readonly assignmentRole = signal<UserRole>('SELLER');
  protected readonly actionUser = signal<ManagedUser | null>(null);
  protected readonly actionKind = signal<'DISABLE' | 'ENABLE' | 'DELETE' | null>(null);
  protected readonly actionSaving = signal(false);
  protected readonly openMenuUserId = signal<string | null>(null);
  protected readonly accessUser = signal<ManagedUser | null>(null);
  protected readonly accessOpen = signal(false);
  protected readonly accessSaving = signal(false);
  protected readonly accessShowPassword = signal(false);
  protected readonly commissionUser = signal<ManagedUser | null>(null);
  protected readonly commissionOpen = signal(false);
  protected readonly commissionSaving = signal(false);
  protected accessMaxSessions = 1;
  protected accessPassword = '';
  protected accessMustChangePassword = true;
  protected commissionRate = 0;
  protected commissionRecalculate = false;
  protected commissionFrom = '';
  protected commissionTo = '';
  protected search = '';
  protected page = 0;
  protected routeDraft = { code: '', name: '' };
  protected assignmentRouteId = '';
  protected form: UserDraft = this.emptyForm();

  ngOnInit(): void {
    this.loadReferences();
    this.loadUsers();
  }

  protected loadUsers(page = this.page): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .getUsers(page, 20, this.search)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          this.page = response.page;
          this.users.set(response);
        },
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.users.set({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
            return;
          }
          this.error.set(apiErrorMessage(error, 'No fue posible cargar los usuarios.'));
        },
      });
  }

  protected searchUsers(): void {
    this.loadUsers(0);
  }

  protected openCreate(): void {
    this.form = this.emptyForm();
    this.formError.set('');
    this.notice.set('');
    this.selectedSupervisorRoutes.set([]);
    this.routeCreatorOpen.set(false);
    this.formOpen.set(true);
  }

  protected closeCreate(): void {
    if (!this.saving()) this.formOpen.set(false);
  }

  protected saveUser(): void {
    const error = this.validateUser();
    if (error) {
      this.formError.set(error);
      return;
    }
    const seller = this.form.role === 'SELLER';
    const request: CreateUserRequest = {
      fullName: this.form.fullName.trim(),
      username: this.form.username.trim().toLowerCase(),
      role: this.form.role,
      hiredOn: this.form.hiredOn ? this.isoDate(this.form.hiredOn) : null,
      commissionRate: seller ? Number(this.form.commissionRate) : 0,
      maxSessions: Number(this.form.maxSessions),
      routeId: seller ? this.form.routeId : null,
      routeIds: this.form.role === 'SUPERVISOR' ? this.selectedSupervisorRoutes() : [],
    };
    this.saving.set(true);
    this.formError.set('');
    this.api
      .createUser(request)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (user) => {
          this.formOpen.set(false);
          this.notice.set(`${user.fullName} fue creado con la contraseña temporal 1234567890.`);
          this.loadUsers(0);
        },
        error: (apiError: unknown) =>
          this.formError.set(apiErrorMessage(apiError, 'No fue posible crear el usuario.')),
      });
  }

  protected createRoute(): void {
    if (!this.routeDraft.code.trim() || !this.routeDraft.name.trim()) {
      this.formError.set('Ingrese el código y el nombre de la nueva ruta.');
      return;
    }
    this.creatingRoute.set(true);
    this.formError.set('');
    this.api
      .createRoute({ code: this.routeDraft.code.trim(), name: this.routeDraft.name.trim() })
      .pipe(finalize(() => this.creatingRoute.set(false)))
      .subscribe({
        next: (route) => {
          this.routes.update((routes) =>
            [...routes, route].sort((a, b) => a.code.localeCompare(b.code)),
          );
          this.form.routeId = route.id;
          this.routeDraft = { code: '', name: '' };
          this.routeCreatorOpen.set(false);
        },
        error: (apiError: unknown) =>
          this.formError.set(apiErrorMessage(apiError, 'No fue posible crear la ruta.')),
      });
  }

  protected openUserAction(user: ManagedUser, kind: 'DISABLE' | 'ENABLE' | 'DELETE'): void {
    this.openMenuUserId.set(null);
    this.actionUser.set(user);
    this.actionKind.set(kind);
    this.formError.set('');
  }

  protected closeUserAction(): void {
    if (!this.actionSaving()) {
      this.actionUser.set(null);
      this.actionKind.set(null);
    }
  }

  protected confirmUserAction(): void {
    const user = this.actionUser();
    const kind = this.actionKind();
    if (!user || !kind) return;
    this.actionSaving.set(true);
    this.formError.set('');
    const operation: Observable<unknown> =
      kind === 'DELETE'
        ? this.api.deleteUser(user.id)
        : this.api.updateUserEnabled(user.id, kind === 'ENABLE');
    operation.pipe(finalize(() => this.actionSaving.set(false))).subscribe({
      next: () => {
        this.closeUserAction();
        this.notice.set(
          kind === 'DELETE'
            ? `${user.fullName} fue eliminado.`
            : kind === 'ENABLE'
              ? `${user.fullName} fue rehabilitado.`
              : `${user.fullName} fue desactivado.`,
        );
        this.loadUsers();
      },
      error: (apiError: unknown) =>
        this.formError.set(apiErrorMessage(apiError, 'No fue posible actualizar el usuario.')),
    });
  }

  protected openAssignments(user: ManagedUser): void {
    this.openMenuUserId.set(null);
    this.assignmentUser.set(user);
    this.assignmentOpen.set(true);
    this.assignmentLoading.set(true);
    this.formError.set('');
    this.selectedSupervisorRoutes.set([]);
    this.assignmentRole.set(user.role);
    this.api
      .getUserAssignments(user.id)
      .pipe(finalize(() => this.assignmentLoading.set(false)))
      .subscribe({
        next: (assignments) => {
          this.assignmentRole.set(assignments.role);
          this.assignmentRouteId = assignments.routeId ?? '';
          this.selectedSupervisorRoutes.set(assignments.routeIds ?? []);
        },
        error: (apiError: unknown) =>
          this.formError.set(apiErrorMessage(apiError, 'No fue posible cargar las asignaciones.')),
      });
  }

  protected openAccess(user: ManagedUser): void {
    this.openMenuUserId.set(null);
    this.accessUser.set(user);
    this.accessMaxSessions = user.maxSessions;
    this.accessPassword = '';
    this.accessMustChangePassword = true;
    this.accessShowPassword.set(false);
    this.formError.set('');
    this.accessOpen.set(true);
  }

  protected closeAccess(): void {
    if (!this.accessSaving()) this.accessOpen.set(false);
  }

  protected saveAccess(): void {
    const user = this.accessUser();
    if (!user) return;
    const sessions = Number(this.accessMaxSessions);
    if (!Number.isInteger(sessions) || sessions < 1 || sessions > 20) {
      this.formError.set('Las sesiones concurrentes deben estar entre 1 y 20.');
      return;
    }
    if (this.accessPassword && this.accessPassword.length < 5) {
      this.formError.set('La nueva contraseña debe tener al menos 5 caracteres.');
      return;
    }
    const operation = this.api
      .updateUserSessions(user.id, sessions)
      .pipe(
        switchMap(() =>
          this.accessPassword
            ? this.api.resetUserPassword(
                user.id,
                this.accessPassword,
                this.accessMustChangePassword,
              )
            : of(null),
        ),
      );
    this.accessSaving.set(true);
    this.formError.set('');
    operation.pipe(finalize(() => this.accessSaving.set(false))).subscribe({
      next: () => {
        this.accessOpen.set(false);
        this.notice.set(`El acceso de ${user.fullName} fue actualizado.`);
        this.loadUsers();
      },
      error: (apiError: unknown) =>
        this.formError.set(apiErrorMessage(apiError, 'No fue posible actualizar el acceso.')),
    });
  }

  protected openCommission(user: ManagedUser): void {
    this.openMenuUserId.set(null);
    this.commissionUser.set(user);
    this.commissionRate = Number(user.commissionRate);
    this.commissionRecalculate = false;
    const today = this.isoToday();
    this.commissionTo = today;
    this.commissionFrom = `${today.slice(0, 8)}01`;
    this.formError.set('');
    this.commissionOpen.set(true);
  }

  protected closeCommission(): void {
    if (!this.commissionSaving()) this.commissionOpen.set(false);
  }

  protected saveCommission(): void {
    const user = this.commissionUser();
    if (!user) return;
    const rate = Number(this.commissionRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      this.formError.set('La comisión debe estar entre 0% y 100%.');
      return;
    }
    if (this.commissionRecalculate) {
      if (!this.commissionFrom || !this.commissionTo) {
        this.formError.set('Indica el rango de fechas a recalcular.');
        return;
      }
      if (this.commissionTo < this.commissionFrom) {
        this.formError.set('La fecha final debe ser igual o posterior a la inicial.');
        return;
      }
    }
    this.commissionSaving.set(true);
    this.formError.set('');
    this.api
      .updateUserCommission(user.id, {
        commissionRate: rate,
        recalculateFrom: this.commissionRecalculate ? this.commissionFrom : null,
        recalculateTo: this.commissionRecalculate ? this.commissionTo : null,
      })
      .pipe(finalize(() => this.commissionSaving.set(false)))
      .subscribe({
        next: (result) => {
          this.commissionOpen.set(false);
          this.notice.set(
            `${user.fullName} ahora tiene ${rate}% de comisión.` +
              (result.recalculatedClosures
                ? ` Se recalcularon ${result.recalculatedClosures} cierres del rango.`
                : ''),
          );
          this.loadUsers();
        },
        error: (apiError: unknown) =>
          this.formError.set(apiErrorMessage(apiError, 'No fue posible actualizar la comisión.')),
      });
  }

  protected closeAssignments(): void {
    if (!this.assignmentSaving()) this.assignmentOpen.set(false);
  }

  protected saveAssignments(): void {
    const user = this.assignmentUser();
    if (!user) return;
    const role = this.assignmentRole();
    const seller = role === 'SELLER';
    if (seller && !this.assignmentRouteId) {
      this.formError.set('Seleccione una ruta para el vendedor.');
      return;
    }
    this.assignmentSaving.set(true);
    this.formError.set('');
    this.api
      .updateUserRole(user.id, {
        role,
        routeId: seller ? this.assignmentRouteId : null,
        routeIds: role === 'SUPERVISOR' ? this.selectedSupervisorRoutes() : [],
      })
      .pipe(finalize(() => this.assignmentSaving.set(false)))
      .subscribe({
        next: () => {
          this.assignmentOpen.set(false);
          this.notice.set(
            `${user.fullName} ahora tiene el rol ${this.roleLabel(role)} y sus asignaciones fueron actualizadas.`,
          );
          this.loadUsers();
        },
        error: (apiError: unknown) =>
          this.formError.set(
            apiErrorMessage(apiError, 'No fue posible actualizar las asignaciones.'),
          ),
      });
  }

  protected toggleSupervisorRoute(routeId: string, checked: boolean): void {
    this.selectedSupervisorRoutes.update((selected) =>
      checked ? [...new Set([...selected, routeId])] : selected.filter((id) => id !== routeId),
    );
  }

  protected isSupervisorRouteSelected(routeId: string): boolean {
    return this.selectedSupervisorRoutes().includes(routeId);
  }

  protected roleLabel(role: UserRole): string {
    return ({ ADMIN: 'Administrador', SUPERVISOR: 'Supervisor', SELLER: 'Vendedor' } as const)[
      role
    ];
  }

  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  protected dateInput(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  private loadReferences(): void {
    const routes$ = this.api
      .getRoutes()
      .pipe(
        catchError((error: HttpErrorResponse) =>
          error.status === 404 ? of([] as RouteSummary[]) : throwError(() => error),
        ),
      );
    routes$.subscribe({
      next: (routes) => this.routes.set(routes),
      error: (apiError: unknown) =>
        this.error.set(apiErrorMessage(apiError, 'No fue posible cargar las rutas.')),
    });
  }

  private validateUser(): string {
    if (!this.form.fullName.trim() || !this.form.username.trim())
      return 'Nombre y usuario son obligatorios.';
    if (this.form.maxSessions < 1 || this.form.maxSessions > 20)
      return 'Las sesiones deben estar entre 1 y 20.';
    if (this.form.hiredOn && !this.isoDate(this.form.hiredOn))
      return 'La fecha de ingreso debe usar el formato DD/MM/AAAA.';
    if (this.form.commissionRate < 0 || this.form.commissionRate > 100)
      return 'La comisión debe estar entre 0% y 100%.';
    if (
      this.form.role === 'SELLER' &&
      !this.form.routeId
    ) {
      return 'Para crear un vendedor seleccione una ruta.';
    }
    return '';
  }

  private emptyForm(): UserDraft {
    return {
      fullName: '',
      username: '',
      role: 'SELLER',
      hiredOn: this.todayInNicaragua(),
      commissionRate: 10,
      maxSessions: 1,
      routeId: '',
    };
  }

  private isoToday(): string {
    const [day, month, year] = this.todayInNicaragua().split('/');
    return `${year}-${month}-${day}`;
  }

  private todayInNicaragua(): string {
    const parts = new Intl.DateTimeFormat('es-NI', {
      timeZone: 'America/Managua',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value['day']}/${value['month']}/${value['year']}`;
  }

  private isoDate(value: string): string | null {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!match) return null;
    const [, day, month, year] = match;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      parsed.getUTCFullYear() !== Number(year) ||
      parsed.getUTCMonth() !== Number(month) - 1 ||
      parsed.getUTCDate() !== Number(day)
    )
      return null;
    return `${year}-${month}-${day}`;
  }
}
