import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ExpenseReviewPage } from './expense-review.page';

describe('ExpenseReviewPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00-06:00'));
    sessionStorage.setItem('lotowo.access-token', 'admin-token');
    sessionStorage.setItem(
      'lotowo.user',
      JSON.stringify({
        id: 'admin-id',
        username: 'admin',
        fullName: 'Administrador',
        role: 'ADMIN',
        routeId: null,
        mustChangePassword: false,
      }),
    );
    await TestBed.configureTestingModule({
      imports: [ExpenseReviewPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('totals mountings, manual expenses and external prizes for the selected range', () => {
    const fixture = TestBed.createComponent(ExpenseReviewPage);
    const request = http.expectOne(
      (candidate) =>
        candidate.url === '/api/v1/admin/finance/details' &&
        candidate.params.get('from') === '2026-08-23' &&
        candidate.params.get('to') === '2026-08-28',
    );
    request.flush({
      from: '2026-08-23',
      to: '2026-08-28',
      mountings: [
        {
          id: 'mounting-id',
          drawId: 'draw-id',
          drawName: 'Sorteo diario',
          drawType: 'DAILY',
          scheduledAt: '2026-08-28T17:00:00Z',
          winningNumber: '03',
          totalStake: 400,
          externalPrize: 8000,
          source: 'MANUAL_LATE',
          registeredAt: '2026-08-28T17:01:00Z',
          registeredByName: 'Administrador',
          items: [],
        },
      ],
      movements: [
        {
          id: 'expense-id',
          date: '2026-08-27',
          type: 'EXPENSE',
          amount: 350,
          description: 'Combustible',
          userId: null,
          userName: null,
          active: true,
          createdAt: '2026-08-27T18:00:00Z',
          createdBy: 'admin-id',
          deletedAt: null,
          deletedBy: null,
          deletedByName: null,
        },
        {
          id: 'income-id',
          date: '2026-08-27',
          type: 'INCOME',
          amount: 100,
          description: 'Otro ingreso',
          userId: null,
          userName: null,
          active: true,
          createdAt: '2026-08-27T18:00:00Z',
          createdBy: 'admin-id',
          deletedAt: null,
          deletedBy: null,
          deletedByName: null,
        },
      ],
    });
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('750');
    expect(page.textContent).toContain('+8,000');
    expect(page.textContent).toContain('Combustible');
    expect(page.textContent).not.toContain('Otro ingreso');
    expect(page.querySelectorAll('.mounting-entry')).toHaveLength(1);
    expect(page.querySelectorAll('.manual-entry')).toHaveLength(1);
  });

  it('shows a useful empty state when the API has no financial details', () => {
    const fixture = TestBed.createComponent(ExpenseReviewPage);
    http
      .expectOne((request) => request.url === '/api/v1/admin/finance/details')
      .flush({ detail: 'Sin movimientos' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin gastos en este período');
  });
});
