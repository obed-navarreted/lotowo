import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Ticket } from '../../core/models/api.models';
import { TicketDetailPage } from './ticket-detail.page';

describe('TicketDetailPage', () => {
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
      imports: [TicketDetailPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'ticket-id' } } },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('lets an administrator delete a ticket and displays its audit data after reloading', () => {
    const fixture = TestBed.createComponent(TicketDetailPage);
    const component = fixture.componentInstance as unknown as {
      openDeleteDialog(): void;
      updateDeletionReason(value: string): void;
      confirmDelete(): void;
      ticket(): Ticket | null;
    };
    http.expectOne('/api/v1/tickets/ticket-id').flush(ticketFixture());

    component.openDeleteDialog();
    component.updateDeletionReason('Error de digitación');
    component.confirmDelete();
    const deletion = http.expectOne((request) => request.url === '/api/v1/tickets/ticket-id');
    expect(deletion.request.method).toBe('DELETE');
    expect(deletion.request.params.get('reason')).toBe('Error de digitación');
    deletion.flush(null);
    http.expectOne('/api/v1/tickets/ticket-id').flush(
      ticketFixture({
        status: 'DELETED',
        deletedAt: '2026-08-02T15:00:00Z',
        deletedBy: 'admin-id',
        deletedByName: 'Administrador',
        deletionReason: 'Error de digitación',
      }),
    );

    expect(component.ticket()?.status).toBe('DELETED');
    expect(component.ticket()?.deletedByName).toBe('Administrador');
  });
});

function ticketFixture(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'ticket-id',
    receiptNumber: 42,
    rootTicketId: 'ticket-id',
    previousTicketId: null,
    sellerId: 'seller-id',
    sellerName: 'Vendedor',
    routeId: 'route-id',
    routeCode: 'NORTE-01',
    routeName: 'Ruta Norte',
    drawId: 'draw-id',
    drawType: 'DAILY',
    drawName: 'Sorteo diario 11 AM',
    drawScheduledAt: '2026-08-02T17:00:00Z',
    salesCloseAt: '2099-08-02T17:00:00Z',
    winningNumber: null,
    revision: 1,
    status: 'ACTIVE',
    totalAmount: 5,
    totalPotentialPayout: 350,
    createdAt: '2026-08-02T14:00:00Z',
    updatedAt: '2026-08-02T14:00:00Z',
    deletedAt: null,
    deletedBy: null,
    deletedByName: null,
    deletionReason: null,
    printCount: 0,
    lastPrintedAt: null,
    items: [{ id: 'item-id', number: '07', stake: 5, payoutMultiplier: 70, potentialPayout: 350 }],
    ...overrides,
  };
}
