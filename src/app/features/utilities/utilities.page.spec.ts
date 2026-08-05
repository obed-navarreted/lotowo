import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UtilitiesPage } from './utilities.page';

describe('UtilitiesPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
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
  });

  it('uses the selected date, draw and seller in the summary and ticket link', () => {
    const fixture = TestBed.createComponent(UtilitiesPage);
    const component = fixture.componentInstance as unknown as {
      selectedDate: string;
      selectedDrawId: string;
      selectedSellerId: string;
      applyFilters(): void;
      ticketsQuery(): Record<string, string>;
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
    http.expectOne((request) => request.url === '/api/v1/draws').flush([]);
    http
      .expectOne((request) => request.url === '/api/v1/tickets/day-summary')
      .flush({ detail: 'No hay ventas' }, { status: 404, statusText: 'Not Found' });

    component.selectedDate = '2026-08-01';
    component.selectedDrawId = 'draw-id';
    component.selectedSellerId = 'seller-id';
    component.applyFilters();

    const summary = http.expectOne((request) => request.url === '/api/v1/tickets/day-summary');
    expect(summary.request.params.get('date')).toBe('2026-08-01');
    expect(summary.request.params.get('drawId')).toBe('draw-id');
    expect(summary.request.params.get('sellerId')).toBe('seller-id');
    summary.flush({
      date: '2026-08-01',
      ticketCount: 4,
      grossSales: 100,
      prizesPaid: 40,
      netResult: 60,
      pendingResults: 0,
    });

    expect(component.ticketsQuery()).toEqual({
      date: '2026-08-01',
      drawId: 'draw-id',
      sellerId: 'seller-id',
    });
  });
});
