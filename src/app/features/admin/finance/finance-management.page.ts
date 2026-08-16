import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, of } from 'rxjs';
import { LotoApiService } from '../../../core/api/loto-api.service';
import { ManagedUser } from '../../../core/models/admin.models';
import {
  BusinessMovement,
  BusinessMovementInput,
  BusinessMovementType,
} from '../../../core/models/api.models';
import { apiErrorMessage } from '../../../shared/api-error';
import { Icon } from '../../../shared/icon/icon';

interface MovementDraft {
  type: BusinessMovementType;
  amount: number | null;
  description: string;
  userId: string;
}

@Component({
  selector: 'lo-finance-management-page',
  imports: [FormsModule, Icon],
  templateUrl: './finance-management.page.html',
  styleUrl: './finance-management.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinanceManagementPage {
  private readonly api = inject(LotoApiService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly users = signal<ManagedUser[]>([]);
  protected readonly movements = signal<BusinessMovement[]>([]);
  protected readonly drafts = signal<MovementDraft[]>([this.emptyDraft()]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly deleting = signal<BusinessMovement | null>(null);
  protected readonly today = this.localDate(new Date());
  protected selectedDate = this.today;
  protected editDate = this.today;
  protected editAmount: number | null = null;
  protected editDescription = '';
  protected editUserId = '';
  protected editType: BusinessMovementType = 'EXPENSE';

  constructor() {
    this.api
      .getUsers(0, 100)
      .pipe(
        catchError(() => of({ content: [] as ManagedUser[] })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) =>
        this.users.set(
          [...response.content].sort((left, right) =>
            left.fullName.localeCompare(right.fullName, 'es'),
          ),
        ),
      );
    this.loadMovements();
  }

  protected addDraft(): void {
    this.drafts.update((items) => [...items, this.emptyDraft()]);
  }

  protected removeDraft(index: number): void {
    this.drafts.update((items) =>
      items.length === 1 ? [this.emptyDraft()] : items.filter((_, current) => current !== index),
    );
  }

  protected onDateChanged(): void {
    this.message.set(null);
    this.loadMovements();
  }

  protected saveBatch(): void {
    const payload: BusinessMovementInput[] = this.drafts().map((item) => ({
      type: item.type,
      amount: Number(item.amount),
      description: item.description.trim(),
      userId: item.userId || null,
    }));
    if (payload.some((item) => !(item.amount > 0) || !item.description)) {
      this.error.set('Cada movimiento necesita un monto mayor que cero y una descripción.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.api
      .createBusinessMovements(this.selectedDate, payload)
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.drafts.set([this.emptyDraft()]);
          this.message.set('Movimientos registrados correctamente.');
          this.loadMovements();
        },
        error: (error: unknown) =>
          this.error.set(apiErrorMessage(error, 'No pudimos registrar los movimientos.')),
      });
  }

  protected startEdit(movement: BusinessMovement): void {
    if (!movement.active) return;
    this.editingId.set(movement.id);
    this.editDate = movement.date;
    this.editAmount = movement.amount;
    this.editDescription = movement.description;
    this.editUserId = movement.userId ?? '';
    this.editType = movement.type;
    this.error.set(null);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected saveEdit(): void {
    const id = this.editingId();
    if (!id || !(Number(this.editAmount) > 0) || !this.editDescription.trim()) {
      this.error.set('El movimiento necesita un monto mayor que cero y una descripción.');
      return;
    }
    this.saving.set(true);
    this.api
      .updateBusinessMovement(id, this.editDate, {
        type: this.editType,
        amount: Number(this.editAmount),
        description: this.editDescription.trim(),
        userId: this.editUserId || null,
      })
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.editingId.set(null);
          this.selectedDate = this.editDate;
          this.message.set('Movimiento actualizado correctamente.');
          this.loadMovements();
        },
        error: (error: unknown) =>
          this.error.set(apiErrorMessage(error, 'No pudimos actualizar el movimiento.')),
      });
  }

  protected confirmDelete(): void {
    const movement = this.deleting();
    if (!movement) return;
    this.saving.set(true);
    this.api
      .deleteBusinessMovement(movement.id)
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.deleting.set(null);
          this.message.set('Movimiento eliminado. Su auditoría permanece disponible.');
          this.loadMovements();
        },
        error: (error: unknown) =>
          this.error.set(apiErrorMessage(error, 'No pudimos eliminar el movimiento.')),
      });
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  protected dateLabel(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(`${value}T12:00:00-06:00`));
  }

  private loadMovements(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .getBusinessMovements(this.selectedDate, true)
      .pipe(
        catchError((error: HttpErrorResponse) =>
          error.status === 404
            ? of([] as BusinessMovement[])
            : (() => {
                throw error;
              })(),
        ),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (movements) => this.movements.set(movements),
        error: (error: unknown) =>
          this.error.set(apiErrorMessage(error, 'No pudimos cargar los movimientos.')),
      });
  }

  private emptyDraft(): MovementDraft {
    return { type: 'EXPENSE', amount: null, description: '', userId: '' };
  }

  private localDate(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Managua',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value['year']}-${value['month']}-${value['day']}`;
  }
}
