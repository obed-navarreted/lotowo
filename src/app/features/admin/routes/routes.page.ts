import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { LotoApiService } from '../../../core/api/loto-api.service';
import { ManagedRoute } from '../../../core/models/admin.models';
import { PageResponse } from '../../../core/models/api.models';
import { apiErrorMessage } from '../../../shared/api-error';
import { Icon } from '../../../shared/icon/icon';

@Component({
  selector: 'lo-routes-page',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './routes.page.html',
  styleUrl: './routes.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoutesPage implements OnInit {
  private readonly api = inject(LotoApiService);
  protected readonly routes = signal<PageResponse<ManagedRoute> | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly modalOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly formError = signal('');
  protected readonly notice = signal('');
  protected search = '';
  protected page = 0;
  protected draft = { code: '', name: '' };

  ngOnInit(): void {
    this.load();
  }

  protected load(page = this.page): void {
    this.loading.set(true);
    this.error.set('');
    this.api.getManagedRoutes(page, 20, this.search).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (response) => { this.page = response.page; this.routes.set(response); },
      error: (apiError: unknown) => {
        if (apiError instanceof HttpErrorResponse && apiError.status === 404) {
          this.routes.set({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
          return;
        }
        this.error.set(apiErrorMessage(apiError, 'No fue posible cargar las rutas.'));
      }
    });
  }

  protected searchRoutes(): void {
    this.load(0);
  }

  protected openCreate(): void {
    this.editingId.set(null);
    this.draft = { code: '', name: '' };
    this.formError.set('');
    this.modalOpen.set(true);
  }

  protected openEdit(route: ManagedRoute): void {
    this.editingId.set(route.id);
    this.draft = { code: route.code, name: route.name };
    this.formError.set('');
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    if (!this.saving()) this.modalOpen.set(false);
  }

  protected save(): void {
    if (!this.draft.code.trim() || !this.draft.name.trim()) {
      this.formError.set('El código y el nombre son obligatorios.');
      return;
    }
    const request = { code: this.draft.code.trim(), name: this.draft.name.trim() };
    const id = this.editingId();
    const operation = id ? this.api.updateRoute(id, request) : this.api.createRoute(request);
    this.saving.set(true);
    this.formError.set('');
    operation.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (route) => {
        this.modalOpen.set(false);
        this.notice.set(id ? `La ruta ${route.code} fue actualizada.` : `La ruta ${route.code} fue creada.`);
        this.load(id ? this.page : 0);
      },
      error: (apiError: unknown) => this.formError.set(apiErrorMessage(apiError, 'No fue posible guardar la ruta.'))
    });
  }

  protected deactivate(route: ManagedRoute): void {
    if (!confirm(`¿Desactivar la ruta ${route.code} · ${route.name}?`)) return;
    this.error.set('');
    this.api.deactivateRoute(route.id).subscribe({
      next: () => { this.notice.set(`La ruta ${route.code} fue desactivada.`); this.load(); },
      error: (apiError: unknown) => this.error.set(apiErrorMessage(apiError, 'No fue posible desactivar la ruta.'))
    });
  }

  protected restore(route: ManagedRoute): void {
    this.error.set('');
    this.api.restoreRoute(route.id).subscribe({
      next: () => { this.notice.set(`La ruta ${route.code} fue restaurada.`); this.load(); },
      error: (apiError: unknown) => this.error.set(apiErrorMessage(apiError, 'No fue posible restaurar la ruta.'))
    });
  }
}
