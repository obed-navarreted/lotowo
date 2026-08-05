import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ReceiptOutputService } from '../../core/receipts/receipt-output.service';
import { ApiProblem, Ticket } from '../../core/models/api.models';
import { drawLabel } from '../../shared/draw-label';
import { Icon } from '../../shared/icon/icon';

interface RevisionChange {
  number: string;
  type: 'ADDED' | 'REMOVED' | 'UPDATED';
  before: number | null;
  after: number | null;
}

@Component({
  selector: 'lo-ticket-detail-page',
  imports: [RouterLink, Icon],
  templateUrl: './ticket-detail.page.html',
  styleUrl: './ticket-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketDetailPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(LotoApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly receiptOutput = inject(ReceiptOutputService);
  private readonly ticketId = this.route.snapshot.paramMap.get('id') ?? '';

  protected readonly ticket = signal<Ticket | null>(null);
  protected readonly previousVersion = signal<Ticket | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly deleteDialogOpen = signal(false);
  protected readonly deletionReason = signal('');
  protected readonly deleting = signal(false);
  protected readonly actionError = signal('');
  protected readonly printing = signal(false);
  protected readonly printError = signal('');

  protected readonly canEdit = computed(() => {
    const ticket = this.ticket();
    return Boolean(
      ticket &&
      ticket.status === 'ACTIVE' &&
      this.auth.user()?.role === 'SELLER' &&
      this.auth.user()?.id === ticket.sellerId &&
      new Date(ticket.salesCloseAt).getTime() > Date.now(),
    );
  });
  protected readonly canDelete = computed(() => {
    const ticket = this.ticket();
    const user = this.auth.user();
    if (
      !ticket ||
      !user ||
      ticket.status !== 'ACTIVE' ||
      new Date(ticket.salesCloseAt).getTime() <= Date.now()
    )
      return false;
    return user.role === 'ADMIN' || (user.role === 'SELLER' && user.id === ticket.sellerId);
  });
  protected readonly canPrint = computed(() => this.ticket()?.status === 'ACTIVE');
  protected readonly maximumExposure = computed(
    () =>
      this.ticket()?.items.reduce<Ticket['items'][number] | null>(
        (maximum, item) =>
          !maximum || item.potentialPayout > maximum.potentialPayout ? item : maximum,
        null,
      ) ?? null,
  );
  protected readonly containsWinner = computed(() => {
    const ticket = this.ticket();
    return Boolean(
      ticket?.status === 'ACTIVE' &&
      ticket.winningNumber &&
      ticket.items.some((item) => item.number === ticket.winningNumber),
    );
  });
  protected readonly revisionChanges = computed<RevisionChange[]>(() => {
    const current = this.ticket();
    const previous = this.previousVersion();
    if (!current || !previous) return [];
    const before = new Map(previous.items.map((item) => [item.number, item.stake]));
    const after = new Map(current.items.map((item) => [item.number, item.stake]));
    return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap((number) => {
      const oldStake = before.get(number) ?? null;
      const newStake = after.get(number) ?? null;
      if (oldStake === newStake) return [];
      return [
        {
          number,
          type: oldStake === null ? 'ADDED' : newStake === null ? 'REMOVED' : 'UPDATED',
          before: oldStake,
          after: newStake,
        },
      ];
    });
  });

  constructor() {
    this.load();
  }

  protected openDeleteDialog(): void {
    if (!this.canDelete()) return;
    this.deletionReason.set('');
    this.actionError.set('');
    this.deleteDialogOpen.set(true);
  }

  protected closeDeleteDialog(): void {
    if (!this.deleting()) this.deleteDialogOpen.set(false);
  }

  protected updateDeletionReason(value: string): void {
    this.deletionReason.set(value.slice(0, 300));
    this.actionError.set('');
  }

  protected confirmDelete(): void {
    const reason = this.deletionReason().trim();
    if (!reason || this.deleting()) {
      this.actionError.set('Escribe el motivo de la eliminación.');
      return;
    }
    this.deleting.set(true);
    this.actionError.set('');
    this.api
      .deleteTicket(this.ticketId, reason)
      .pipe(
        finalize(() => this.deleting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.deleteDialogOpen.set(false);
          this.load();
        },
        error: (error: HttpErrorResponse) => {
          const problem = error.error as ApiProblem | null;
          this.actionError.set(problem?.detail || 'No pudimos eliminar el boleto.');
        },
      });
  }

  protected printTicket(): void {
    const ticket = this.ticket();
    if (!ticket || !this.canPrint() || this.printing()) return;
    this.printing.set(true);
    this.printError.set('');
    void this.receiptOutput
      .print(ticket)
      .then((print) => {
        if (print)
          this.ticket.set({
            ...ticket,
            printCount: print.printNumber,
            lastPrintedAt: print.printedAt,
          });
      })
      .catch(() => this.printError.set('No pudimos generar o enviar el recibo.'))
      .finally(() => this.printing.set(false));
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  protected dateTime(value: string | null): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Managua',
    }).format(new Date(value));
  }

  protected draw(ticket: Ticket): string {
    return drawLabel({ drawType: ticket.drawType, scheduledAt: ticket.drawScheduledAt });
  }

  protected statusLabel(status: Ticket['status']): string {
    return ({ ACTIVE: 'Activo', REPLACED: 'Reemplazado', DELETED: 'Eliminado' } as const)[status];
  }

  protected isWinner(number: string): boolean {
    return Boolean(this.ticket()?.winningNumber && this.ticket()?.winningNumber === number);
  }

  protected changeLabel(type: RevisionChange['type']): string {
    return ({ ADDED: 'Agregado', REMOVED: 'Quitado', UPDATED: 'Modificado' } as const)[type];
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');
    this.previousVersion.set(null);
    this.api
      .getTicket(this.ticketId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ticket) => {
          this.ticket.set(ticket);
          this.loading.set(false);
          if (ticket.previousTicketId) {
            this.api
              .getTicket(ticket.previousTicketId)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: (previous) => this.previousVersion.set(previous),
                error: () => this.previousVersion.set(null),
              });
          }
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          const problem = error.error as ApiProblem | null;
          this.error.set(problem?.detail || 'No pudimos cargar el detalle del boleto.');
        },
      });
  }
}
