import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, timeout, TimeoutError } from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { createIdempotencyKey } from '../../core/api/idempotency-key';
import { AuthService } from '../../core/auth/auth.service';
import { ReceiptOutputService } from '../../core/receipts/receipt-output.service';
import { SystemSalesSettings } from '../../core/models/admin.models';
import { ApiProblem, Draw, SellerAvailability, Ticket } from '../../core/models/api.models';
import { Icon } from '../../shared/icon/icon';
import { drawLabel } from '../../shared/draw-label';

@Component({
  selector: 'lo-sale-page',
  imports: [Icon],
  templateUrl: './sale.page.html',
  styleUrl: './sale.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalePage {
  private static readonly SALE_TIMEOUT_MS = 20_000;
  protected readonly auth = inject(AuthService);
  private readonly api = inject(LotoApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly router = inject(Router, { optional: true });
  private readonly receiptOutput = inject(ReceiptOutputService);
  private readonly editingTicketId = this.route?.snapshot.paramMap.get('id') ?? null;
  protected readonly isEditing = Boolean(this.editingTicketId);
  protected readonly systemSettings = signal<SystemSalesSettings | null>(null);
  protected readonly draws = signal<Draw[]>([]);
  protected readonly selectedDrawId = signal<string>('');
  protected readonly selections = signal<Map<string, number>>(new Map());
  protected readonly availability = signal<SellerAvailability | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly createdTicket = signal<Ticket | null>(null);
  protected readonly printingReceipt = signal(false);
  protected readonly receiptError = signal<string | null>(null);
  protected readonly manualNumber = signal('');
  protected readonly manualStake = signal('');
  protected readonly manualError = signal<string | null>(null);
  protected readonly customerName = signal('');
  private pendingAttempt: { fingerprint: string; idempotencyKey: string } | null = null;
  private readonly originalPayouts = signal<Map<string, number>>(new Map());
  @ViewChild('manualNumberInput') private manualNumberInput?: ElementRef<HTMLInputElement>;
  @ViewChild('manualStakeInput') private manualStakeInput?: ElementRef<HTMLInputElement>;

  protected readonly selectedDraw = computed(
    () => this.draws().find((draw) => draw.id === this.selectedDrawId()) ?? null,
  );
  protected readonly selectedEntries = computed(() =>
    [...this.selections().entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
  protected readonly total = computed(() =>
    this.selectedEntries().reduce((sum, [, stake]) => sum + stake, 0),
  );
  protected readonly canSubmit = computed(
    () =>
      Boolean(this.selectedDrawId()) &&
      this.selections().size > 0 &&
      this.total() > 0 &&
      !this.saving(),
  );
  protected readonly drawLocked = computed(() => this.selections().size > 0);
  protected readonly canAddManual = computed(() =>
    Boolean(
      this.selectedDrawId() &&
      this.manualNumber().trim() &&
      this.manualStake().trim() &&
      !this.saving(),
    ),
  );
  protected readonly availabilityByNumber = computed(
    () => new Map((this.availability()?.numbers ?? []).map((item) => [item.number, item])),
  );

  constructor() {
    this.loadSystemSettings();
    this.loadDraws();
  }

  protected remaining(number: string | null): number | null {
    if (!number) return null;
    const remaining = this.availabilityByNumber().get(number)?.remainingPotentialPayout ?? null;
    if (remaining === null) return null;
    return remaining + (this.originalPayouts().get(number) ?? 0);
  }

  protected updateManualNumber(value: string): void {
    const normalized = value.replace(/\D/g, '').slice(0, 2);
    this.manualNumber.set(normalized);
    this.manualError.set(null);
    if (normalized.length === 2) this.focusManualStake();
  }

  protected updateManualStake(value: string): void {
    const normalized = value.replace(',', '.').replace(/[^\d.]/g, '');
    const [whole = '', ...decimals] = normalized.split('.');
    this.manualStake.set(decimals.length ? `${whole}.${decimals.join('').slice(0, 2)}` : whole);
    this.manualError.set(null);
  }

  protected updateCustomerName(value: string): void {
    this.customerName.set(value.slice(0, 120));
  }

  protected moveToManualStake(event: Event): void {
    event.preventDefault();
    this.focusManualStake();
  }

  protected addManualEntry(): void {
    if (!this.canAddManual()) return;
    const rawNumber = this.manualNumber().trim();
    const numberValue = Number(rawNumber);
    if (
      !/^\d{1,2}$/.test(rawNumber) ||
      !Number.isInteger(numberValue) ||
      numberValue < 0 ||
      numberValue > 99
    ) {
      this.manualError.set('Digita un número válido entre 00 y 99.');
      return;
    }
    const number = String(numberValue).padStart(2, '0');
    const stake = Number(this.manualStake());
    if (!Number.isFinite(stake) || stake <= 0 || !/^\d+(?:\.\d{1,2})?$/.test(this.manualStake())) {
      this.manualError.set('Digita un monto mayor que cero, con máximo dos decimales.');
      return;
    }
    const available = this.remaining(number);
    if (available === 0) {
      this.manualError.set(`El número ${number} está bloqueado para este sorteo.`);
      return;
    }
    const potentialPrize = this.prizeFor(number, stake);
    if (available !== null && potentialPrize > available) {
      this.manualError.set(
        `El premio de ${this.money(potentialPrize)} supera los ${this.money(available)} disponibles para el número ${number}.`,
      );
      return;
    }

    const updated = new Map(this.selections());
    updated.set(number, stake);
    this.selections.set(updated);
    this.manualNumber.set('');
    this.manualStake.set('');
    this.manualError.set(null);
    this.errorMessage.set(null);
    this.focusManualNumber();
  }

  protected editNumber(number: string): void {
    this.manualNumber.set(number);
    this.manualStake.set(String(this.selections().get(number) ?? ''));
    this.manualError.set(null);
    this.focusManualStake();
  }

  protected removeNumber(number: string): void {
    const updated = new Map(this.selections());
    updated.delete(number);
    this.selections.set(updated);
  }

  protected prizeFor(number: string, stake: number): number {
    const settings = this.systemSettings();
    const multiplier =
      settings?.payoutOverrides.find((item) => item.number === number)?.multiplier ??
      settings?.defaultPayoutMultiplier ??
      80;
    return Math.round(stake * multiplier * 100) / 100;
  }

  protected selectDraw(drawId: string): void {
    if (this.drawLocked() && drawId !== this.selectedDrawId()) return;
    this.selectedDrawId.set(drawId);
    this.availability.set(null);
    this.selections.set(new Map());
    this.manualNumber.set('');
    this.manualStake.set('');
    this.manualError.set(null);
    if (drawId) {
      this.loadAvailability(drawId);
    }
  }

  protected submit(): void {
    if (!this.canSubmit()) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    const request = {
      drawId: this.selectedDrawId(),
      customerName: this.customerName().trim() || null,
      items: this.selectedEntries().map(([number, stake]) => ({ number, stake })),
    };
    const fingerprint = JSON.stringify(request);
    const idempotencyKey =
      this.pendingAttempt?.fingerprint === fingerprint
        ? this.pendingAttempt.idempotencyKey
        : createIdempotencyKey();
    this.pendingAttempt = { fingerprint, idempotencyKey };

    const operation = this.editingTicketId
      ? this.api.updateTicket(this.editingTicketId, request, idempotencyKey)
      : this.api.createTicket(request, idempotencyKey);
    operation
      .pipe(
        timeout({ first: SalePage.SALE_TIMEOUT_MS }),
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (ticket) => {
          this.pendingAttempt = null;
          this.createdTicket.set(ticket);
          this.loadAvailability(ticket.drawId);
          void this.receiptOutput
            .print(ticket, true)
            .then((print) => {
              if (!print) return;
              this.createdTicket.update((current) =>
                current?.id === ticket.id
                  ? { ...current, printCount: print.printNumber, lastPrintedAt: print.printedAt }
                  : current,
              );
            })
            .catch(() => undefined);
        },
        error: (error: unknown) => {
          if (error instanceof TimeoutError) {
            this.errorMessage.set(
              'La venta está tardando demasiado. Verifica tu conexión e intenta nuevamente.',
            );
            return;
          }
          const httpError = error instanceof HttpErrorResponse ? error : null;
          if (httpError?.status !== 0) this.pendingAttempt = null;
          const problem = httpError?.error as ApiProblem | null;
          this.errorMessage.set(
            problem?.detail || 'No pudimos registrar la venta. Intenta nuevamente.',
          );
        },
      });
  }

  protected newSale(): void {
    if (this.isEditing && this.createdTicket()) {
      void this.router?.navigate(['/tickets', this.createdTicket()!.id]);
      return;
    }
    this.createdTicket.set(null);
    this.selections.set(new Map());
    this.errorMessage.set(null);
    this.manualNumber.set('');
    this.manualStake.set('');
    this.manualError.set(null);
    this.customerName.set('');
    this.focusManualNumber();
  }

  protected printCreatedTicket(): void {
    const ticket = this.createdTicket();
    if (!ticket || this.printingReceipt()) return;
    this.printingReceipt.set(true);
    this.receiptError.set(null);
    void this.receiptOutput
      .print(ticket)
      .then((print) => {
        if (print)
          this.createdTicket.set({
            ...ticket,
            printCount: print.printNumber,
            lastPrintedAt: print.printedAt,
          });
      })
      .catch(() =>
        this.receiptError.set('No pudimos generar o enviar el recibo. Intenta nuevamente.'),
      )
      .finally(() => this.printingReceipt.set(false));
  }

  protected continueSelling(): void {
    if (this.isEditing) {
      void this.router?.navigate(['/sell']);
      return;
    }
    this.newSale();
  }

  protected goHome(): void {
    void this.router?.navigate(['/dashboard']);
  }

  protected time(value: string | undefined): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('es-NI', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Managua',
    }).format(new Date(value));
  }

  protected shortDate(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(value));
  }

  protected formatDraw(draw: Draw): string {
    return drawLabel(draw);
  }

  protected money(value: number | null | undefined): string {
    if (value == null) return 'Sin límite';
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  private loadDraws(): void {
    this.api
      .getSaleableDraws()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (draws) => {
          this.draws.set(draws);
          if (this.editingTicketId) {
            this.loadTicketForEdit(this.editingTicketId);
            return;
          }
          this.loading.set(false);
          if (draws.length) this.selectDraw(draws[0].id);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          if (error.status === 404) {
            this.draws.set([]);
            return;
          }
          this.errorMessage.set('No pudimos cargar los sorteos disponibles.');
        },
      });
  }

  private loadTicketForEdit(ticketId: string): void {
    this.api
      .getTicket(ticketId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ticket) => {
          if (ticket.status !== 'ACTIVE' || ticket.sellerId !== this.auth.user()?.id) {
            this.loading.set(false);
            this.errorMessage.set('Este boleto no está disponible para edición.');
            return;
          }
          if (!this.draws().some((draw) => draw.id === ticket.drawId)) {
            this.loading.set(false);
            this.errorMessage.set('El sorteo del boleto ya no admite modificaciones.');
            return;
          }
          this.selectDraw(ticket.drawId);
          this.originalPayouts.set(
            new Map(ticket.items.map((item) => [item.number, item.potentialPayout])),
          );
          this.selections.set(new Map(ticket.items.map((item) => [item.number, item.stake])));
          this.customerName.set(ticket.customerName ?? '');
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          const problem = error.error as ApiProblem | null;
          this.errorMessage.set(problem?.detail || 'No pudimos cargar el boleto para editarlo.');
        },
      });
  }

  private loadAvailability(drawId: string): void {
    this.api
      .getAvailability(drawId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (availability) => this.availability.set(availability),
        error: () => this.availability.set(null),
      });
  }

  private loadSystemSettings(): void {
    this.api
      .getSystemSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => this.systemSettings.set(settings),
        error: () => this.systemSettings.set(null),
      });
  }

  private focusManualNumber(): void {
    setTimeout(() => this.manualNumberInput?.nativeElement.focus());
  }

  private focusManualStake(): void {
    setTimeout(() => this.manualStakeInput?.nativeElement.focus());
  }
}
