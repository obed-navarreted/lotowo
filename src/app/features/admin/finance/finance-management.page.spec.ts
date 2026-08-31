import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { FinanceManagementPage } from './finance-management.page';

describe('FinanceManagementPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T12:00:00-06:00'));
    await TestBed.configureTestingModule({
      imports: [FinanceManagementPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('loads the selected day and records a batch with an optional user', () => {
    const fixture = TestBed.createComponent(FinanceManagementPage);
    const component = fixture.componentInstance as unknown as {
      selectedDate: string;
      drafts(): Array<{ type: string; amount: number | null; description: string; userId: string }>;
      saveBatch(): void;
    };

    http
      .expectOne((request) => request.url === '/api/v1/users')
      .flush({
        content: [{ id: 'seller-id', fullName: 'Ana Vendedora', role: 'SELLER' }],
        page: 0,
        size: 100,
        totalElements: 1,
        totalPages: 1,
      });
    http
      .expectOne((request) => request.url === '/api/v1/admin/finance/movements')
      .flush({ detail: 'Sin movimientos' }, { status: 404, statusText: 'Not Found' });

    expect(component.selectedDate).toBe('2026-08-16');
    Object.assign(component.drafts()[0], {
      type: 'MOUNTING_EXPENSE',
      amount: 350,
      description: 'Montada de las 11 AM',
      userId: 'seller-id',
    });
    component.saveBatch();

    const create = http.expectOne('/api/v1/admin/finance/movements/batches');
    expect(create.request.body).toEqual({
      date: '2026-08-16',
      movements: [
        {
          type: 'MOUNTING_EXPENSE',
          amount: 350,
          description: 'Montada de las 11 AM',
          userId: 'seller-id',
        },
      ],
    });
    create.flush([]);
    http
      .expectOne((request) => request.url === '/api/v1/admin/finance/movements')
      .flush({ detail: 'Sin movimientos' }, { status: 404, statusText: 'Not Found' });
  });
});
