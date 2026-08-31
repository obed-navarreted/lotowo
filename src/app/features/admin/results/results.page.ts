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
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { LotoApiService } from '../../../core/api/loto-api.service';
import { Draw, DrawClosure } from '../../../core/models/api.models';
import { FilterStateService } from '../../../core/navigation/filter-state.service';
import { apiErrorMessage } from '../../../shared/api-error';
import { drawLabel } from '../../../shared/draw-label';
import { Icon } from '../../../shared/icon/icon';
import { newestDrawFirst } from '../../../shared/result-order';

@Component({
  selector: 'lo-results-page',
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './results.page.html',
  styleUrl: './results.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsPage {
  private readonly api = inject(LotoApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filterState = inject(FilterStateService);
  protected readonly draws = signal<Draw[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly selectedDraw = signal<Draw | null>(null);
  protected readonly winningNumber = signal('');
  protected readonly saving = signal(false);
  protected readonly actionError = signal('');
  protected readonly lastClosure = signal<DrawClosure | null>(null);
  protected selectedDate: string;
  protected readonly pending = computed(() =>
    this.draws().filter((draw) => this.canRegister(draw)),
  );
  protected readonly registered = computed(() =>
    this.draws()
      .filter((draw) => Boolean(draw.winningNumber))
      .sort(newestDrawFirst),
  );

  constructor() {
    this.selectedDate =
      this.filterState.restore<{ date: string }>('admin-results')?.date ??
      this.localDate(new Date());
    this.load();
  }

  protected load(): void {
    this.filterState.save('admin-results', { date: this.selectedDate });
    this.loading.set(true);
    this.errorMessage.set(null);
    const from = new Date(`${this.selectedDate}T00:00:00-06:00`);
    const to = new Date(from.getTime() + 86_400_000);
    this.api
      .getDraws(from, to)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (draws) => {
          this.draws.set(draws);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.draws.set([]);
          this.loading.set(false);
          if (error.status !== 404)
            this.errorMessage.set(apiErrorMessage(error, 'No pudimos cargar los sorteos.'));
        },
      });
  }

  protected openResult(draw: Draw): void {
    if (!this.canRegister(draw)) return;
    this.selectedDraw.set(draw);
    this.winningNumber.set('');
    this.actionError.set('');
  }

  protected closeResult(): void {
    if (!this.saving()) this.selectedDraw.set(null);
  }

  protected updateNumber(value: string): void {
    this.winningNumber.set(value.replace(/\D/g, '').slice(0, 2));
    this.actionError.set('');
  }

  protected submitResult(): void {
    const draw = this.selectedDraw();
    if (!draw || !/^\d{2}$/.test(this.winningNumber())) {
      this.actionError.set('Escribe el número ganador con dos dígitos, entre 00 y 99.');
      return;
    }
    this.saving.set(true);
    this.api
      .registerWinningNumber(draw.id, this.winningNumber())
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (closure) => {
          this.lastClosure.set(closure);
          this.selectedDraw.set(null);
          this.load();
        },
        error: (error: unknown) =>
          this.actionError.set(apiErrorMessage(error, 'No fue posible registrar el ganador.')),
      });
  }

  protected canRegister(draw: Draw): boolean {
    return (
      !draw.winningNumber &&
      draw.status !== 'CANCELLED' &&
      new Date(draw.salesCloseAt).getTime() <= Date.now()
    );
  }

  protected dateLabel(): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Managua',
    }).format(new Date(`${this.selectedDate}T12:00:00-06:00`));
  }

  protected drawName(draw: Draw): string {
    return drawLabel(draw);
  }
  protected money(value: number): string {
    return new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2 }).format(value);
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
