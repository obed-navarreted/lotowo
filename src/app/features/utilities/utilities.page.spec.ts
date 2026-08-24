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

  it('uses multiple selected draws and leaves commissions excluded by default', () => {
    const fixture = TestBed.createComponent(UtilitiesPage);
    const component = fixture.componentInstance as unknown as {
      fromDate: string;
      toDate: string;
      selectedDrawIds: string[];
      allDrawsSelected: boolean;
      selectedSellerId: string;
      selectedRouteId: string;
      includeCommissions: boolean;
      includeMovements: boolean;
      includeProvisional: boolean;
      applyFilters(): void;
      ticketsQuery(): Record<string, string>;
      resultValue(result: UtilitySummary): number;
    };

    http
      .expectOne((request) => request.url === '/api/v1/routes')
      .flush([{ id: 'route-id', code: 'R-01', name: 'Ruta Norte', active: true }]);
    const initialSellers = http.expectOne((request) => request.url === '/api/v1/reports/sellers');
    expect(initialSellers.request.params.get('from')).toBe('2026-08-02');
    expect(initialSellers.request.params.get('to')).toBe('2026-08-08');
    initialSellers.flush([]);
    const initial = http.expectOne(
      (request) => request.url === '/api/v1/reports/utilities/summary',
    );
    expect(initial.request.params.get('from')).toBe('2026-08-02');
    expect(initial.request.params.get('to')).toBe('2026-08-08');
    initial.flush({ detail: 'No hay ventas' }, { status: 404, statusText: 'Not Found' });

    component.fromDate = '2026-08-01';
    component.toDate = '2026-08-01';
    component.selectedDrawIds = ['draw-id', 'draw-id-2'];
    component.allDrawsSelected = false;
    component.selectedSellerId = 'seller-id';
    component.selectedRouteId = 'route-id';
    component.applyFilters();

    const filteredSellers = http.expectOne((request) => request.url === '/api/v1/reports/sellers');
    expect(filteredSellers.request.params.getAll('drawIds')).toEqual(['draw-id', 'draw-id-2']);
    filteredSellers.flush([
      {
        id: 'seller-id',
        fullName: 'Vendedora Uno',
        routeId: 'route-id',
        routeCode: 'R-01',
        routeName: 'Ruta Norte',
      },
    ]);
    const summary = http.expectOne(
      (request) => request.url === '/api/v1/reports/utilities/summary',
    );
    expect(summary.request.params.get('from')).toBe('2026-08-01');
    expect(summary.request.params.get('to')).toBe('2026-08-01');
    expect(summary.request.params.getAll('drawIds')).toEqual(['draw-id', 'draw-id-2']);
    expect(summary.request.params.get('sellerId')).toBe('seller-id');
    expect(summary.request.params.get('routeId')).toBe('route-id');
    expect(summary.request.params.get('includeProvisional')).toBe('true');
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
      sellers: [
        {
          sellerId: 'seller-id',
          sellerName: 'Vendedora Uno',
          routeId: 'route-id',
          routeCode: 'R-01',
          routeName: 'Ruta Norte',
          ticketCount: 4,
          grossSales: 100,
          prizesPaid: 40,
          commissionAmount: 10,
          netBeforeCommission: 60,
          netAfterCommission: 50,
          pendingResults: 0,
          commissionProvisional: false,
          entries: [
            {
              drawId: 'draw-id',
              drawType: 'DAILY',
              scheduledAt: '2026-08-01T11:00:00-06:00',
              winningNumber: '11',
              ticketCount: 4,
              grossSales: 100,
              prizesPaid: 40,
              commissionRate: 10,
              commissionAmount: 10,
              netBeforeCommission: 60,
              netAfterCommission: 50,
              pendingResult: false,
              commissionProvisional: false,
            },
            {
              drawId: 'draw-id-2',
              drawType: 'DAILY',
              scheduledAt: '2026-08-01T15:00:00-06:00',
              winningNumber: '22',
              ticketCount: 1,
              grossSales: 10,
              prizesPaid: 80,
              commissionRate: 10,
              commissionAmount: 1,
              netBeforeCommission: -70,
              netAfterCommission: -71,
              pendingResult: false,
              commissionProvisional: false,
            },
          ],
        },
      ],
    };
    summary.flush(report);
    http
      .expectOne(
        (request) =>
          request.url === '/api/v1/admin/finance/details' &&
          request.params.get('from') === '2026-08-01' &&
          request.params.get('to') === '2026-08-01',
      )
      .flush({ detail: 'Sin movimientos' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(component.ticketsQuery()).toEqual({
      date: '2026-08-01',
      sellerId: 'seller-id',
    });
    expect(component.includeCommissions).toBe(false);
    expect(component.includeMovements).toBe(false);
    expect(component.includeProvisional).toBe(true);
    expect(component.resultValue(report)).toBe(60);
    expect(fixture.nativeElement.textContent).toContain('LOTO - 01/08/26 - 11AM');
    expect(fixture.nativeElement.textContent).toContain('Vendedora Uno');
    expect(fixture.nativeElement.querySelector('.seller-header')?.textContent).toContain(
      'Ruta Norte',
    );
    expect(fixture.nativeElement.querySelector('.utility-mobile-summary')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.utility-draw-mobile')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('details.utility-day[open]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Resultado sin comisión');
    expect(fixture.nativeElement.textContent).not.toContain('Comisión excluida');
    expect(fixture.nativeElement.textContent).not.toContain('Utilidad neta');
    expect(
      fixture.nativeElement.querySelector('.utility-draw--loss .seller-net dd.loss')?.textContent,
    ).toContain('-70');
    component.includeCommissions = true;
    expect(component.resultValue(report)).toBe(50);
  });

  it('shows dated expenses when the utility period contains a single day', () => {
    sessionStorage.setItem(
      'suerte.filters.admin-id.utilities',
      JSON.stringify({
        fromDate: '2026-08-08',
        toDate: '2026-08-08',
        selectedDrawIds: [],
        allDrawsSelected: true,
        sellerId: '',
        routeId: '',
        includeCommissions: false,
        includeMovements: false,
        includeDraws: true,
      }),
    );
    const fixture = TestBed.createComponent(UtilitiesPage);

    http.expectOne('/api/v1/routes').flush([]);
    http
      .expectOne((request) => request.url === '/api/v1/draws')
      .flush([
        {
          id: 'draw-id',
          drawType: 'DAILY',
          name: 'Sorteo diario 11 AM',
          nationalSequence: null,
          scheduledAt: '2026-08-08T17:00:00Z',
          salesCloseAt: '2026-08-08T17:00:00Z',
          status: 'CLOSED',
          salesEnabled: false,
          salesBlockedAt: null,
          winningNumber: '11',
          resultRegisteredAt: '2026-08-08T18:00:00Z',
          settledAt: null,
          version: 1,
          createdAt: '2026-08-08T12:00:00Z',
        },
      ]);
    const sellers = http.expectOne((request) => request.url === '/api/v1/reports/sellers');
    expect(sellers.request.params.get('from')).toBe('2026-08-08');
    expect(sellers.request.params.get('to')).toBe('2026-08-08');
    sellers.flush([]);
    http
      .expectOne((request) => request.url === '/api/v1/reports/utilities/summary')
      .flush({
        from: '2026-08-08',
        to: '2026-08-08',
        ticketCount: 1,
        grossSales: 100,
        prizesPaid: 0,
        commissionAmount: 10,
        netResult: 100,
        netAfterCommission: 90,
        pendingResults: 0,
        commissionProvisional: false,
        sellers: [],
      });
    http
      .expectOne((request) => request.url === '/api/v1/admin/finance/summary')
      .flush({
        from: '2026-08-08',
        to: '2026-08-08',
        grossSales: 100,
        localPrizes: 0,
        commissions: 10,
        resultAfterCommission: 100,
        externalStake: 0,
        externalPrizes: 0,
        expenses: 350,
        extraIncome: 0,
        businessResult: 100,
      });
    http
      .expectOne((request) => request.url === '/api/v1/admin/finance/details')
      .flush({
        from: '2026-08-08',
        to: '2026-08-08',
        mountings: [],
        movements: [
          {
            id: 'expense-id',
            date: '2026-08-08',
            type: 'EXPENSE',
            amount: 350,
            description: 'Combustible y almuerzo',
            userId: null,
            userName: null,
            active: true,
            createdAt: '2026-08-08T18:00:00Z',
            createdBy: 'admin-id',
            deletedAt: null,
            deletedBy: null,
            deletedByName: null,
          },
        ],
      });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.period-movements')?.textContent).toContain(
      'Combustible y almuerzo',
    );
    expect(fixture.nativeElement.querySelector('.period-movements')?.textContent).toContain('350');
  });
});
