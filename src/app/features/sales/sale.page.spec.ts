import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SalePage } from './sale.page';

describe('SalePage', () => {
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
      imports: [SalePage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('shows one direct manual sale flow without mode selectors', () => {
    const fixture = TestBed.createComponent(SalePage);
    flushSaleSetup();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.manual-form')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Moderna');
    expect(fixture.nativeElement.textContent).not.toContain('Tradicional');
  });

  it('accepts an arbitrary amount and applies the default x80 payout', () => {
    const fixture = TestBed.createComponent(SalePage);
    const component = fixture.componentInstance as unknown as ManualSaleHarness;
    flushSaleSetup();

    component.updateManualNumber('5');
    component.updateManualStake('12.50');
    component.addManualEntry();

    expect(component.selections().get('05')).toBe(12.5);
    expect(component.prizeFor('05', 12.5)).toBe(1000);
    expect(component.manualNumber()).toBe('');
    expect(component.manualStake()).toBe('');
  });

  it('uses a configured per-number multiplier exception', () => {
    const fixture = TestBed.createComponent(SalePage);
    const component = fixture.componentInstance as unknown as ManualSaleHarness;
    flushSaleSetup();

    expect(component.prizeFor('03', 100)).toBe(7000);
    expect(component.prizeFor('04', 100)).toBe(8000);
  });

  it('compares the potential prize, not the stake, with the remaining number limit', () => {
    const fixture = TestBed.createComponent(SalePage);
    const component = fixture.componentInstance as unknown as ManualSaleHarness;
    flushSaleSetup(100);

    component.updateManualNumber('03');
    component.updateManualStake('2');
    component.addManualEntry();

    expect(component.selections().has('03')).toBe(false);
    expect(component.manualError()).toContain('supera');
  });

  it('locks the draw after the first number and sends only number plus stake', () => {
    const fixture = TestBed.createComponent(SalePage);
    const component = fixture.componentInstance as unknown as ManualSaleHarness;
    flushSaleSetup();

    component.updateManualNumber('11');
    component.updateManualStake('5');
    component.updateCustomerName('Cliente Uno');
    component.addManualEntry();
    component.selectDraw('another-draw');

    expect(component.drawLocked()).toBe(true);
    expect(component.selectedDrawId()).toBe('draw-id');

    component.submit();
    const request = http.expectOne('/api/v1/tickets');
    expect(request.request.body.items).toEqual([{ number: '11', stake: 5 }]);
    expect(request.request.body.customerName).toBe('Cliente Uno');
    request.flush(ticket());
    http.expectOne('/api/v1/tickets/availability/draw-id').flush(availability());
  });

  it('keeps a blocked draw visible and lets the backend reject the sale', () => {
    const fixture = TestBed.createComponent(SalePage);
    const component = fixture.componentInstance as unknown as ManualSaleHarness;
    flushSaleSetup(undefined, false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.blocked-sale-banner')?.textContent).toContain(
      'Sorteo bloqueado',
    );
    expect(fixture.nativeElement.querySelector('option')?.textContent).toContain('Bloqueado');

    component.updateManualNumber('03');
    component.updateManualStake('2');
    component.addManualEntry();
    component.submit();
    http.expectOne('/api/v1/tickets').flush(
      {
        code: 'VENTAS_BLOQUEADAS',
        detail: 'No se puede proceder porque este sorteo se encuentra bloqueado para ventas.',
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se puede proceder');
  });

  it('offers compact print, next-sale and home actions after creating a ticket', () => {
    const fixture = TestBed.createComponent(SalePage);
    const component = fixture.componentInstance as unknown as {
      createdTicket: { set(value: unknown): void };
    };
    flushSaleSetup();
    component.createdTicket.set(ticket());
    fixture.detectChanges();

    const actions = fixture.nativeElement.querySelector('.success-actions')?.textContent;
    expect(actions).toContain('Imprimir');
    expect(actions).toContain('Seguir');
    expect(actions).toContain('Inicio');
  });

  function flushSaleSetup(remainingPotentialPayout?: number, salesEnabled = true): void {
    http.expectOne('/api/v1/system-settings').flush(settings());
    http.expectOne('/api/v1/draws/saleable').flush([draw(salesEnabled)]);
    http
      .expectOne('/api/v1/tickets/availability/draw-id')
      .flush(availability(remainingPotentialPayout));
  }
});

interface ManualSaleHarness {
  updateManualNumber(value: string): void;
  updateManualStake(value: string): void;
  updateCustomerName(value: string): void;
  addManualEntry(): void;
  selectDraw(drawId: string): void;
  submit(): void;
  prizeFor(number: string, stake: number): number;
  selections(): Map<string, number>;
  manualNumber(): string;
  manualStake(): string;
  manualError(): string | null;
  drawLocked(): boolean;
  selectedDrawId(): string;
}

function settings() {
  return {
    defaultPayoutMultiplier: 80,
    payoutOverrides: [{ number: '03', multiplier: 70 }],
    numberLimitsEnabled: false,
    defaultPayoutLimit: null,
    limitOverrides: [],
    excludedSellerIds: [],
    maxTicketPrints: 2,
    updatedAt: '2026-08-04T12:00:00Z',
  };
}

function draw(salesEnabled = true) {
  return {
    id: 'draw-id',
    drawType: 'DAILY',
    name: 'Sorteo 11 AM',
    nationalSequence: null,
    scheduledAt: '2026-08-04T17:00:00Z',
    salesCloseAt: '2026-08-04T17:00:00Z',
    status: 'OPEN',
    salesEnabled,
    salesBlockedAt: salesEnabled ? null : '2026-08-04T16:00:00Z',
    winningNumber: null,
    resultRegisteredAt: null,
    settledAt: null,
    version: 0,
    createdAt: '2026-08-03T12:00:00Z',
  };
}

function availability(remainingPotentialPayout?: number) {
  return {
    sellerId: 'seller-id',
    drawId: 'draw-id',
    totalSold: 0,
    calculatedAt: '2026-08-04T12:00:00Z',
    numbers: ['03', '05', '11'].map((number) => ({
      number,
      payoutLimit: remainingPotentialPayout ?? null,
      currentPotentialPayout: 0,
      remainingPotentialPayout: remainingPotentialPayout ?? null,
    })),
  };
}

function ticket() {
  return {
    id: 'ticket-id',
    receiptNumber: 9,
    rootTicketId: 'ticket-id',
    previousTicketId: null,
    sellerId: 'seller-id',
    sellerName: 'Vendedor',
    routeId: 'route-id',
    routeName: 'Ruta',
    drawId: 'draw-id',
    drawType: 'DAILY',
    drawName: 'Sorteo 11 AM',
    drawScheduledAt: '2026-08-04T17:00:00Z',
    salesCloseAt: '2026-08-04T17:00:00Z',
    winningNumber: null,
    revision: 1,
    status: 'ACTIVE',
    totalAmount: 5,
    totalPotentialPayout: 400,
    createdAt: '2026-08-04T15:00:00Z',
    updatedAt: '2026-08-04T15:00:00Z',
    deletedAt: null,
    deletedBy: null,
    deletedByName: null,
    deletionReason: null,
    printCount: 0,
    lastPrintedAt: null,
    items: [
      {
        id: 'item-id',
        number: '11',
        stake: 5,
        payoutMultiplier: 80,
        potentialPayout: 400,
      },
    ],
  };
}
