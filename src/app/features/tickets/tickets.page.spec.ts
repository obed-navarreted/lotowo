import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Ticket } from '../../core/models/api.models';
import { TicketsPage } from './tickets.page';

describe('TicketsPage', () => {
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
      ['date', '2026-08-01'],
      ['drawId', 'draw-id'],
      ['sellerId', 'seller-id'],
    ]);
    await TestBed.configureTestingModule({
      imports: [TicketsPage],
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

  it('restores utility filters and renders each ticket status with its corresponding background', () => {
    const fixture = TestBed.createComponent(TicketsPage);

    http.expectOne('/api/v1/draws/saleable').flush([]);
    http
      .expectOne((request) => request.url === '/api/v1/users')
      .flush({
        content: [],
        page: 0,
        size: 100,
        totalElements: 0,
        totalPages: 0,
      });
    http.expectOne((request) => request.url === '/api/v1/draws').flush([drawFixture()]);
    http.expectOne('/api/v1/tickets/exposure/draw-id?sellerId=seller-id').flush([]);
    const ticketRequest = http.expectOne((request) => request.url === '/api/v1/tickets');
    expect(ticketRequest.request.params.get('fromDate')).toBe('2026-08-01');
    expect(ticketRequest.request.params.get('toDate')).toBe('2026-08-01');
    expect(ticketRequest.request.params.get('drawId')).toBe('draw-id');
    expect(ticketRequest.request.params.get('sellerId')).toBe('seller-id');
    ticketRequest.flush({
      content: [
        ticketFixture('active', 'ACTIVE'),
        ticketFixture('replaced', 'REPLACED'),
        ticketFixture('deleted', 'DELETED'),
      ],
      page: 0,
      size: 20,
      totalElements: 3,
      totalPages: 1,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.ticket-row').length).toBe(3);
    expect(fixture.nativeElement.querySelectorAll('.ticket-row--replaced').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.ticket-row--deleted').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.ticket-row--winner').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.winner-pill')?.textContent).toContain('Premiado');
    expect(fixture.nativeElement.querySelector('.ticket-legend')?.textContent).toContain(
      'Fondo blanco: boleto válido',
    );
    expect(fixture.nativeElement.querySelector('.ticket-legend')?.textContent).toContain(
      'Fondo gris: reemplazado',
    );
    expect(fixture.nativeElement.querySelector('.ticket-legend')?.textContent).toContain(
      'Fondo rojo: eliminado',
    );
    expect(fixture.nativeElement.querySelector('.ticket-legend')?.textContent).toContain(
      'Fondo dorado: boleto premiado',
    );
  });
});

function drawFixture() {
  return {
    id: 'draw-id',
    drawType: 'DAILY',
    name: 'Sorteo diario 11 AM',
    nationalSequence: null,
    scheduledAt: '2026-08-01T17:00:00Z',
    salesCloseAt: '2026-08-01T17:00:00Z',
    status: 'CLOSED',
    salesEnabled: false,
    salesBlockedAt: null,
    winningNumber: '11',
    resultRegisteredAt: '2026-08-01T18:00:00Z',
    settledAt: null,
    version: 1,
    createdAt: '2026-08-01T12:00:00Z',
  };
}

function ticketFixture(id: string, status: Ticket['status']): Ticket {
  return {
    id,
    receiptNumber: 42,
    rootTicketId: 'active',
    previousTicketId: null,
    sellerId: 'seller-id',
    sellerName: 'Vendedor',
    routeId: 'route-id',
    routeCode: 'NORTE-01',
    routeName: 'Ruta Norte',
    drawId: 'draw-id',
    drawType: 'DAILY',
    drawName: 'Sorteo diario 11 AM',
    drawScheduledAt: '2026-08-01T17:00:00Z',
    salesCloseAt: '2026-08-01T17:00:00Z',
    winningNumber: '11',
    revision: 1,
    status,
    totalAmount: 5,
    totalPotentialPayout: 350,
    createdAt: '2026-08-01T14:00:00Z',
    updatedAt: '2026-08-01T14:00:00Z',
    deletedAt: status === 'DELETED' ? '2026-08-01T15:00:00Z' : null,
    deletedBy: status === 'DELETED' ? 'admin-id' : null,
    deletedByName: status === 'DELETED' ? 'Administrador' : null,
    deletionReason: status === 'DELETED' ? 'Error' : null,
    printCount: 0,
    lastPrintedAt: null,
    items: [
      { id: `${id}-item`, number: '11', stake: 5, payoutMultiplier: 70, potentialPayout: 350 },
    ],
  };
}
