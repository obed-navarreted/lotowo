import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ReportHistoryPage } from './report-history.page';

describe('ReportHistoryPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    sessionStorage.setItem('lotowo.access-token', 'seller-token');
    sessionStorage.setItem(
      'lotowo.user',
      JSON.stringify({
        id: 'seller-id',
        username: 'seller',
        fullName: 'Vendedor',
        role: 'SELLER',
        routeId: 'route-id',
        mustChangePassword: false,
      }),
    );
    await TestBed.configureTestingModule({
      imports: [ReportHistoryPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('opens the latest day and shows winner, own result and ticket access per draw', () => {
    const fixture = TestBed.createComponent(ReportHistoryPage);

    http.expectOne('/api/v1/reports/days').flush([
      {
        date: '2026-08-02',
        drawCount: 1,
        ticketCount: 4,
        grossSales: 497,
        prizesPaid: 350,
        netResult: 147,
        pendingResults: 0,
      },
    ]);
    const draws = http.expectOne(
      (request) =>
        request.url === '/api/v1/reports/draws' && request.params.get('date') === '2026-08-02',
    );
    expect(draws.request.params.has('sellerId')).toBe(false);
    draws.flush([
      {
        drawId: 'draw-id',
        drawType: 'DAILY',
        scheduledAt: '2026-08-02T17:00:00Z',
        winningNumber: '03',
        status: 'SETTLED',
        ticketCount: 4,
        grossSales: 497,
        prizesPaid: 350,
        netResult: 147,
      },
      {
        drawId: 'draw-without-sales',
        drawType: 'DAILY',
        scheduledAt: '2026-08-02T21:00:00Z',
        winningNumber: null,
        status: 'OPEN',
        ticketCount: 0,
        grossSales: 0,
        prizesPaid: 0,
        netResult: 0,
      },
    ]);
    fixture.detectChanges();

    const result = fixture.nativeElement.querySelector('.draw-result');
    expect(fixture.nativeElement.querySelectorAll('.draw-result').length).toBe(1);
    expect(result?.textContent).toContain('Ganador');
    expect(result?.textContent).toContain('03');
    expect(result?.textContent).toContain('Utilidad');
    expect(result?.textContent).toContain('Boletos');
    expect(result?.textContent).toContain('Cierre');

    const ticketsLink = result?.querySelector('a[href^="/tickets"]') as HTMLAnchorElement;
    expect(ticketsLink.getAttribute('href')).toContain('date=2026-08-02');
    expect(ticketsLink.getAttribute('href')).toContain('drawId=draw-id');
  });
});
