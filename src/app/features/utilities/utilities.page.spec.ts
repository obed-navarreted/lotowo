import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { UtilitySummary } from '../../core/models/api.models';
import { UtilitiesPage } from './utilities.page';

describe('UtilitiesPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T18:00:00-06:00'));
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
      imports: [UtilitiesPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('uses the selected one-day range, draw and seller in the summary and ticket link', () => {
    const fixture = TestBed.createComponent(UtilitiesPage);
    const component = fixture.componentInstance as unknown as {
      fromDate: string;
      toDate: string;
      selectedDrawId: string;
      selectedSellerId: string;
      includeCommissions: boolean;
      applyFilters(): void;
      ticketsQuery(): Record<string, string>;
      resultValue(result: UtilitySummary): number;
    };

    http
      .expectOne((request) => request.url === '/api/v1/users')
      .flush({
        content: [],
        page: 0,
        size: 100,
        totalElements: 0,
        totalPages: 0,
      });
    const initial = http.expectOne(
      (request) => request.url === '/api/v1/reports/utilities/summary',
    );
    expect(initial.request.params.get('from')).toBe('2026-08-02');
    expect(initial.request.params.get('to')).toBe('2026-08-08');
    initial.flush({ detail: 'No hay ventas' }, { status: 404, statusText: 'Not Found' });

    component.fromDate = '2026-08-01';
    component.toDate = '2026-08-01';
    component.selectedDrawId = 'draw-id';
    component.selectedSellerId = 'seller-id';
    component.applyFilters();

    const summary = http.expectOne(
      (request) => request.url === '/api/v1/reports/utilities/summary',
    );
    expect(summary.request.params.get('from')).toBe('2026-08-01');
    expect(summary.request.params.get('to')).toBe('2026-08-01');
    expect(summary.request.params.get('drawId')).toBe('draw-id');
    expect(summary.request.params.get('sellerId')).toBe('seller-id');
    const report: UtilitySummary = {
      from: '2026-08-01',
      to: '2026-08-01',
      ticketCount: 4,
      grossSales: 100,
      prizesPaid: 40,
      commissionAmount: 10,
      netResult: 60,
      netAfterCommission: 50,
      pendingResults: 0,
      commissionProvisional: false,
      sellers: [],
    };
    summary.flush(report);

    expect(component.ticketsQuery()).toEqual({
      date: '2026-08-01',
      drawId: 'draw-id',
      sellerId: 'seller-id',
    });
    expect(component.resultValue(report)).toBe(50);
    component.includeCommissions = false;
    expect(component.resultValue(report)).toBe(60);
  });
});
