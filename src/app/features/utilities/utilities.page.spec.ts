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
    fixture.detectChanges();

    expect(component.ticketsQuery()).toEqual({
      date: '2026-08-01',
      sellerId: 'seller-id',
    });
    expect(component.includeCommissions).toBe(false);
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

  it('keeps utilities limited to sales, prizes and the selected commission mode', () => {
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
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Considerar comisiones');
    expect(text).toContain('Considerar resultados provisionales');
    expect(text).not.toContain('otros ingresos y gastos');
    expect(text).not.toContain('Montadas');
    expect(fixture.nativeElement.querySelector('.business-finance')).toBeNull();
    expect(fixture.nativeElement.querySelector('.finance-detail')).toBeNull();
    http.expectNone((request) => request.url.startsWith('/api/v1/admin/finance'));
  });
});
