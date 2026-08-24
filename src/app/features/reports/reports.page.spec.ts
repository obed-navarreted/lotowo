import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { ReportsPage } from './reports.page';

describe('ReportsPage', () => {
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
    const query = new Map([
      ['date', '2026-08-02'],
      ['drawId', 'draw-id'],
    ]);
    await TestBed.configureTestingModule({
      imports: [ReportsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: { get: (key: string) => query.get(key) ?? null } },
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('opens the draw settlement by seller and exposes the winning-ticket view', () => {
    const fixture = TestBed.createComponent(ReportsPage);

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
    http
      .expectOne(
        (request) =>
          request.url === '/api/v1/reports/draws' && request.params.get('date') === '2026-08-02',
      )
      .flush([drawReport()]);
    const sellers = http.expectOne((request) => request.url === '/api/v1/reports/sellers');
    expect(sellers.request.params.get('from')).toBe('2026-08-02');
    expect(sellers.request.params.get('to')).toBe('2026-08-02');
    expect(sellers.request.params.getAll('drawIds')).toEqual(['draw-id']);
    sellers.flush([
      {
        id: 'seller-id',
        fullName: 'Luz Torres',
        routeId: 'route-id',
        routeCode: 'R-01',
        routeName: 'Ruta Norte',
      },
    ]);
    http.expectOne('/api/v1/reports/draws/draw-id/numbers').flush({
      ...drawReport(),
      numbers: [
        {
          number: '03',
          ticketCount: 1,
          salesAmount: 5,
          potentialPayout: 350,
          prizesPaid: 350,
        },
      ],
    });
    http.expectOne('/api/v1/reports/draws/draw-id/settlement').flush(settlementReport());
    http.expectOne('/api/v1/admin/finance/draws/draw-id').flush({
      drawId: 'draw-id',
      winningNumber: '03',
      grossSales: 497,
      localPrizes: 350,
      commissions: 49.7,
      externalStake: 100,
      externalPrize: 0,
      businessResult: -2.7,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.report-tab--active')?.textContent).toContain(
      'Por vendedor',
    );
    expect(fixture.nativeElement.querySelector('.seller-table')?.textContent).toContain(
      'Vendedor entrega',
    );
    expect(fixture.nativeElement.querySelector('.seller-table')?.textContent).toContain(
      'Luz Torres',
    );

    const ticketsTab = fixture.nativeElement.querySelectorAll('.report-tabs button')[1];
    ticketsTab.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.winning-ticket-list')?.textContent).toContain(
      'Recibo',
    );
    expect(fixture.nativeElement.querySelector('.winning-ticket-list')?.textContent).toContain(
      '#3',
    );
    expect(fixture.nativeElement.querySelector('.winning-ticket-list')?.textContent).toContain(
      '350',
    );
  });
});

function drawReport() {
  return {
    drawId: 'draw-id',
    drawType: 'DAILY',
    scheduledAt: '2026-08-02T17:00:00Z',
    winningNumber: '03',
    status: 'SETTLED',
    ticketCount: 4,
    grossSales: 497,
    prizesPaid: 350,
    netResult: 147,
  };
}

function settlementReport() {
  return {
    drawId: 'draw-id',
    drawType: 'DAILY',
    scheduledAt: '2026-08-02T17:00:00Z',
    winningNumber: '03',
    status: 'SETTLED',
    ticketCount: 4,
    winningTicketCount: 1,
    grossSales: 497,
    winningStakes: 5,
    prizesDue: 350,
    netResult: 147,
    sellers: [
      {
        sellerId: 'seller-id',
        sellerName: 'Luz Torres',
        routeId: 'route-id',
        routeName: 'Ticuantepe',
        ticketCount: 4,
        winningTicketCount: 1,
        grossSales: 497,
        winningStakes: 5,
        prizesDue: 350,
        netResult: 147,
        commissionRate: 10,
        commissionAccrued: 49.7,
      },
    ],
    winningTickets: [
      {
        ticketId: 'ticket-id',
        receiptNumber: 3,
        revision: 1,
        sellerId: 'seller-id',
        sellerName: 'Luz Torres',
        routeId: 'route-id',
        routeName: 'Ticuantepe',
        totalAmount: 10,
        winningStake: 5,
        prizeDue: 350,
        createdAt: '2026-08-02T05:09:34Z',
      },
    ],
  };
}
