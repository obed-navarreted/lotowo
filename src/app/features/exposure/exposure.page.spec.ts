import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { ExposurePage } from './exposure.page';

describe('ExposurePage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    vi.useFakeTimers();
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
      ['date', '2026-08-04'],
      ['drawId', 'draw-id'],
    ]);
    await TestBed.configureTestingModule({
      imports: [ExposurePage],
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
    vi.useRealTimers();
  });

  it('shows global exposure and applies route and seller filters to the report request', () => {
    const fixture = TestBed.createComponent(ExposurePage);
    http
      .expectOne('/api/v1/routes')
      .flush([{ id: 'route-id', code: 'TIC', name: 'Ticuantepe', active: true, createdAt: '' }]);
    http
      .expectOne((request) => request.url === '/api/v1/users')
      .flush({
        content: [
          {
            id: 'seller-id',
            fullName: 'Luz Torres',
            username: 'luz',
            role: 'SELLER',
            routeId: 'route-id',
            enabled: true,
          },
        ],
        page: 0,
        size: 100,
        totalElements: 1,
        totalPages: 1,
      });
    http.expectOne('/api/v1/notifications/settings').flush({
      numberExposureEnabled: true,
      numberExposureThreshold: 40_000,
      updatedAt: '2026-08-04T12:00:00Z',
    });
    http
      .expectOne(
        (request) =>
          request.url === '/api/v1/reports/draws' && request.params.get('date') === '2026-08-04',
      )
      .flush([draw()]);
    http.expectOne('/api/v1/reports/draws/draw-id/numbers').flush(report());
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.number-grid')?.textContent).toContain('45,000');

    const profitInput = fixture.nativeElement.querySelector(
      'input[aria-label="Ganancia ideal"]',
    ) as HTMLInputElement;
    profitInput.value = '500';
    profitInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ideal-profit')?.textContent).toContain('04');
    expect(fixture.nativeElement.querySelector('.ideal-profit')?.textContent).toContain('550');

    const component = fixture.componentInstance as unknown as {
      selectedRouteId: string;
      selectedSellerId: string;
      loadReport(): void;
    };
    component.selectedRouteId = 'route-id';
    component.selectedSellerId = 'seller-id';
    component.loadReport();
    const filtered = http.expectOne(
      (request) =>
        request.url === '/api/v1/reports/draws/draw-id/numbers' &&
        request.params.get('routeId') === 'route-id' &&
        request.params.get('sellerId') === 'seller-id',
    );
    expect(filtered.request.params.get('routeId')).toBe('route-id');
    expect(filtered.request.params.get('sellerId')).toBe('seller-id');
    filtered.flush(report());
  });

  it('configures risk alerts without leaving the exposure screen', () => {
    const fixture = TestBed.createComponent(ExposurePage);
    http.expectOne('/api/v1/routes').flush([]);
    http
      .expectOne((request) => request.url === '/api/v1/users')
      .flush({
        content: [],
        page: 0,
        size: 100,
        totalElements: 0,
        totalPages: 0,
      });
    http.expectOne('/api/v1/notifications/settings').flush({
      numberExposureEnabled: false,
      numberExposureThreshold: 40_000,
      updatedAt: '2026-08-04T12:00:00Z',
    });
    http.expectOne((request) => request.url === '/api/v1/reports/draws').flush([draw()]);
    http.expectOne('/api/v1/reports/draws/draw-id/numbers').flush(report());

    const component = fixture.componentInstance as unknown as {
      alertEnabled: boolean;
      alertThreshold: number;
      openAlertSettings(): void;
      saveAlertSettings(): void;
    };
    component.openAlertSettings();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Alerta de riesgo');

    component.alertEnabled = true;
    component.alertThreshold = 50_000;
    component.saveAlertSettings();
    const save = http.expectOne('/api/v1/notifications/settings');
    expect(save.request.method).toBe('PUT');
    expect(save.request.body).toEqual({
      numberExposureEnabled: true,
      numberExposureThreshold: 50_000,
    });
    save.flush({
      numberExposureEnabled: true,
      numberExposureThreshold: 50_000,
      updatedAt: '2026-08-04T12:01:00Z',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Alerta activa desde');
    expect(fixture.nativeElement.querySelector('.alert-dialog')).toBeNull();
  });
});

function draw() {
  return {
    drawId: 'draw-id',
    drawType: 'DAILY',
    scheduledAt: '2026-08-05T03:00:00Z',
    winningNumber: null,
    status: 'OPEN',
    ticketCount: 2,
    grossSales: 650,
    prizesPaid: 0,
    netResult: 650,
  };
}

function report() {
  return {
    ...draw(),
    numbers: [
      { number: '03', ticketCount: 2, salesAmount: 650, potentialPayout: 45_000, prizesPaid: 0 },
      { number: '04', ticketCount: 0, salesAmount: 0, potentialPayout: 100, prizesPaid: 0 },
    ],
  };
}
