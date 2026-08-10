import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ReceiptOutputService } from '../../core/receipts/receipt-output.service';
import { ManagedUser } from '../../core/models/admin.models';
import { Draw, NumberExposure, Ticket, TicketFilters } from '../../core/models/api.models';
import { apiErrorMessage } from '../../shared/api-error';
import { drawLabel } from '../../shared/draw-label';
import { Icon } from '../../shared/icon/icon';
import { newestDrawFirst } from '../../shared/result-order';

@Component({
  selector: 'lo-tickets-page',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './tickets.page.html',
  styleUrl: './tickets.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketsPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(LotoApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly receiptOutput = inject(ReceiptOutputService);
  protected readonly tickets = signal<Ticket[]>([]);
  protected readonly draws = signal<Draw[]>([]);
  protected readonly sellers = signal<ManagedUser[]>([]);
  protected readonly exposure = signal<NumberExposure[]>([]);
  protected readonly loading = signal(true);
  protected readonly filterLoading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly printingTicketId = signal<string | null>(null);
  protected readonly page = signal(0);
  protected readonly totalPages = signal(0);
  protected readonly totalElements = signal(0);
  protected readonly historyMinDate: string;
  protected search = '';
  protected selectedDate: string;
  protected selectedDrawId = '';
  protected selectedSellerId = '';
  private readonly hasRequestedFilters: boolean;

  constructor() {
    const query = this.route.snapshot.queryParamMap;
    const requestedDate = query.get('date');
    this.selectedDate =
      requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
        ? requestedDate
        : this.localDate(new Date());
    this.selectedDrawId = query.get('drawId') ?? '';
    this.selectedSellerId =
      this.auth.user()?.role === 'SELLER' ? '' : (query.get('sellerId') ?? '');
    this.hasRequestedFilters = Boolean(this.selectedDrawId || query.get('date'));
    const earliest = new Date();
    earliest.setDate(earliest.getDate() - 15);
    this.historyMinDate = this.auth.isAdmin() ? '' : this.localDate(earliest);
    this.initialize();
  }

  protected onDateChanged(): void {
    this.selectedDrawId = '';
    this.loadDay();
  }
  protected applyFilters(): void {
    this.load(0);
  }
  protected clearFilters(): void {
    this.search = '';
    this.selectedSellerId = '';
    this.selectedDrawId = '';
    this.load(0);
  }
  protected previous(): void {
    if (this.page() > 0) this.load(this.page() - 1);
  }
  protected next(): void {
    if (this.page() + 1 < this.totalPages()) this.load(this.page() + 1);
  }
  protected drawName(draw: Draw): string {
    return drawLabel(draw);
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
  }

  protected isWinningTicket(ticket: Ticket): boolean {
    return Boolean(
      ticket.status === 'ACTIVE' &&
      ticket.winningNumber &&
      ticket.items.some((item) => item.number === ticket.winningNumber),
    );
  }

  protected winningPrize(ticket: Ticket): number {
    if (!this.isWinningTicket(ticket)) return 0;
    return ticket.items
      .filter((item) => item.number === ticket.winningNumber)
      .reduce((total, item) => total + item.potentialPayout, 0);
  }

  protected printTicket(ticket: Ticket): void {
    if (ticket.status !== 'ACTIVE' || this.printingTicketId()) return;
    this.printingTicketId.set(ticket.id);
    this.errorMessage.set(null);
    void this.receiptOutput
      .print(ticket)
      .then((print) => {
        if (!print) return;
        this.tickets.update((tickets) =>
          tickets.map((current) =>
            current.id === ticket.id
              ? { ...current, printCount: print.printNumber, lastPrintedAt: print.printedAt }
              : current,
          ),
        );
      })
      .catch(() => this.errorMessage.set('No pudimos generar o enviar el recibo.'))
      .finally(() => this.printingTicketId.set(null));
  }

  protected date(value: string): string {
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

  protected filterDateLabel(): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(`${this.selectedDate}T12:00:00-06:00`));
  }

  private initialize(): void {
    this.filterLoading.set(true);
    if (this.auth.user()?.role !== 'SELLER') {
      this.api
        .getUsers(0, 100)
        .pipe(
          catchError(() => of({ content: [] as ManagedUser[] })),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((users) =>
          this.sellers.set(users.content.filter((user) => user.role === 'SELLER')),
        );
    }
    this.api
      .getSaleableDraws()
      .pipe(
        catchError(() => of([] as Draw[])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((saleable) => {
        const next = [...saleable].sort((a, b) => a.salesCloseAt.localeCompare(b.salesCloseAt))[0];
        if (next && !this.hasRequestedFilters) {
          this.selectedDate = this.localDate(new Date(next.scheduledAt));
          this.selectedDrawId = next.id;
        }
        this.loadDay(next?.id);
      });
  }

  private loadDay(preferredDrawId?: string): void {
    if (!this.selectedDate) return;
    if (this.historyMinDate && this.selectedDate < this.historyMinDate) {
      this.errorMessage.set('Solo puedes consultar boletos de los últimos 15 días.');
      return;
    }
    this.filterLoading.set(true);
    this.errorMessage.set(null);
    const from = new Date(`${this.selectedDate}T00:00:00-06:00`);
    const to = new Date(from.getTime() + 86_400_000 - 1);
    this.api
      .getDraws(from, to)
      .pipe(
        catchError((error: HttpErrorResponse) =>
          error.status === 404
            ? of([] as Draw[])
            : (() => {
                throw error;
              })(),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (draws) => {
          this.draws.set([...draws].sort(newestDrawFirst));
          const desired = preferredDrawId ?? this.selectedDrawId;
          this.selectedDrawId = desired && draws.some((draw) => draw.id === desired) ? desired : '';
          this.filterLoading.set(false);
          this.load(0);
        },
        error: (error: unknown) => {
          this.draws.set([]);
          this.selectedDrawId = '';
          this.filterLoading.set(false);
          this.errorMessage.set(apiErrorMessage(error, 'No pudimos cargar los turnos de ese día.'));
          this.load(0);
        },
      });
  }

  private load(page = 0): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    const filters: TicketFilters = {
      drawId: this.selectedDrawId || undefined,
      sellerId: this.selectedSellerId || undefined,
      fromDate: this.selectedDate,
      toDate: this.selectedDate,
      search: this.search.trim() || undefined,
    };
    this.loadExposure();
    this.api
      .getTickets(page, 20, filters)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.tickets.set(response.content);
          this.page.set(response.page);
          this.totalPages.set(response.totalPages);
          this.totalElements.set(response.totalElements);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          if (error.status === 404) {
            this.tickets.set([]);
            this.totalElements.set(0);
            this.totalPages.set(0);
            return;
          }
          this.errorMessage.set(
            apiErrorMessage(error, 'No pudimos cargar los boletos en este momento.'),
          );
        },
      });
  }

  private loadExposure(): void {
    if (!this.selectedDrawId) {
      this.exposure.set([]);
      return;
    }
    this.api
      .getTicketExposure(this.selectedDrawId, this.selectedSellerId || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (items) => this.exposure.set(items), error: () => this.exposure.set([]) });
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
