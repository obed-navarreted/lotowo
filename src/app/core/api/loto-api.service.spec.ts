import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LotoApiService } from './loto-api.service';

describe('LotoApiService', () => {
  let service: LotoApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(LotoApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends a stable idempotency key when creating a ticket', () => {
    const body = { drawId: 'draw-id', items: [{ number: '00', stake: 10 }] };
    service.createTicket(body, 'sale-attempt-1').subscribe();

    const request = http.expectOne('/api/v1/tickets');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe('sale-attempt-1');
    expect(request.request.body.items[0].number).toBe('00');
    request.flush({});
  });

  it('updates and soft-deletes tickets through their dedicated operations', () => {
    const body = { drawId: 'draw-id', items: [{ number: '07', stake: 5 }] };
    service.updateTicket('ticket-id', body, 'ticket-edit-1').subscribe();
    const update = http.expectOne('/api/v1/tickets/ticket-id');
    expect(update.request.method).toBe('PUT');
    expect(update.request.headers.get('Idempotency-Key')).toBe('ticket-edit-1');
    update.flush({});

    service.deleteTicket('ticket-id', 'Error de digitación').subscribe();
    const deletion = http.expectOne((candidate) => candidate.url === '/api/v1/tickets/ticket-id');
    expect(deletion.request.method).toBe('DELETE');
    expect(deletion.request.params.get('reason')).toBe('Error de digitación');
    deletion.flush(null);
  });

  it('registers every receipt print before the frontend generates its PDF', () => {
    service.registerTicketPrint('ticket-id').subscribe();

    const request = http.expectOne('/api/v1/tickets/ticket-id/prints');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush({ printType: 'PRINT', printNumber: 1 });
  });

  it('uses ISO instants for the draw search window', () => {
    service
      .getDraws(new Date('2026-08-01T06:00:00Z'), new Date('2026-08-02T06:00:00Z'))
      .subscribe();

    const request = http.expectOne((candidate) => candidate.url === '/api/v1/draws');
    expect(request.request.params.get('from')).toBe('2026-08-01T06:00:00.000Z');
    expect(request.request.params.get('to')).toBe('2026-08-02T06:00:00.000Z');
    request.flush([]);
  });

  it('sends seller assignments when creating a user', () => {
    const body = {
      username: 'mlopez',
      fullName: 'María López',
      role: 'SELLER' as const,
      hiredOn: '2026-08-01',
      commissionRate: 10,
      maxSessions: 1,
      routeId: 'route-id',
      routeIds: [],
    };
    service.createUser(body).subscribe();

    const request = http.expectOne('/api/v1/users');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.routeId).toBe('route-id');
    request.flush({});
  });

  it('updates the complete system sales contract', () => {
    const body = {
      defaultPayoutMultiplier: 80,
      payoutOverrides: [{ number: '03', multiplier: 70 }],
      numberLimitsEnabled: false,
      defaultPayoutLimit: null,
      limitOverrides: [],
      excludedSellerIds: [],
      maxTicketPrints: 2,
    };
    service.updateSystemSettings(body).subscribe();

    const request = http.expectOne('/api/v1/system-settings');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.payoutOverrides[0]).toEqual({ number: '03', multiplier: 70 });
    expect(request.request.body.maxTicketPrints).toBe(2);
    request.flush({});
  });

  it('loads paginated route administration with its search term', () => {
    service.getManagedRoutes(2, 20, 'oriental').subscribe();

    const request = http.expectOne((candidate) => candidate.url === '/api/v1/routes/manage');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('search')).toBe('oriental');
    request.flush({ content: [], page: 2, size: 20, totalElements: 0, totalPages: 0 });
  });

  it('updates seller assignments atomically', () => {
    service
      .updateUserAssignments('seller-id', {
        routeId: 'route-id',
        routeIds: [],
      })
      .subscribe();

    const request = http.expectOne('/api/v1/users/seller-id/assignments');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.routeId).toBe('route-id');
    request.flush({});
  });

  it('updates the enabled state without deleting the user', () => {
    service.updateUserEnabled('seller-id', false).subscribe();

    const request = http.expectOne('/api/v1/users/seller-id/enabled');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ enabled: false });
    request.flush({});
  });

  it('uses the separate soft-delete operation for users', () => {
    service.deleteUser('seller-id').subscribe();

    const request = http.expectOne('/api/v1/users/seller-id');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });

  it('saves a seller number-limit policy by draw family', () => {
    service
      .updateSellerNumberLimits('seller-id', 'DAILY', {
        defaultLimit: 10_000,
        overrides: [
          { number: '03', limit: 4_000 },
          { number: '00', limit: 0 },
        ],
      })
      .subscribe();

    const request = http.expectOne('/api/v1/users/seller-id/number-limits/DAILY');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.defaultLimit).toBe(10_000);
    expect(request.request.body.overrides).toEqual([
      { number: '03', limit: 4_000 },
      { number: '00', limit: 0 },
    ]);
    request.flush({});
  });

  it('applies route limits to all or selected sellers', () => {
    service
      .updateRouteNumberLimits('route-id', 'NATIONAL_LOTTERY', {
        defaultLimit: 5_000,
        overrides: [{ number: '11', limit: 0 }],
        appliesToAll: false,
        sellerIds: ['seller-1', 'seller-2'],
      })
      .subscribe();

    const request = http.expectOne('/api/v1/routes/route-id/number-limits/NATIONAL_LOTTERY');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.appliesToAll).toBe(false);
    expect(request.request.body.sellerIds).toEqual(['seller-1', 'seller-2']);
    expect(request.request.body.overrides).toEqual([{ number: '11', limit: 0 }]);
    request.flush({});
  });

  it('loads the dedicated saleable draw catalog', () => {
    service.getSaleableDraws().subscribe();

    const request = http.expectOne('/api/v1/draws/saleable');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('creates national lottery draws with their historical sequence', () => {
    service
      .createNationalDraw({
        name: 'Lotería ordinaria',
        nationalSequence: 4120,
        scheduledAt: '2026-08-04T02:00:00.000Z',
        salesCloseAt: '2026-08-04T02:00:00.000Z',
      })
      .subscribe();

    const request = http.expectOne('/api/v1/draws/national-lottery');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.nationalSequence).toBe(4120);
    request.flush({});
  });

  it('updates sales access for one specific draw', () => {
    service.updateDrawSales('draw-id', false).subscribe();

    const request = http.expectOne('/api/v1/draws/draw-id/sales');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ enabled: false });
    request.flush({});
  });

  it('keeps the selected seller and period in report requests', () => {
    service.getDailyReports('2026-07-19', '2026-08-02', 'seller-id').subscribe();
    const days = http.expectOne((request) => request.url === '/api/v1/reports/days');
    expect(days.request.params.get('from')).toBe('2026-07-19');
    expect(days.request.params.get('to')).toBe('2026-08-02');
    expect(days.request.params.get('sellerId')).toBe('seller-id');
    days.flush([]);

    service.getDrawNumberReport('draw-id', 'seller-id').subscribe();
    const detail = http.expectOne(
      (request) => request.url === '/api/v1/reports/draws/draw-id/numbers',
    );
    expect(detail.request.params.get('sellerId')).toBe('seller-id');
    detail.flush({});
  });
});
