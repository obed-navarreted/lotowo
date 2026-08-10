import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DashboardPage } from './dashboard.page';

describe('DashboardPage', () => {
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
      imports: [DashboardPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('keeps a blocked draw as the next countdown target', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const closesAt = new Date(Date.now() + 60 * 60_000).toISOString();
    http
      .expectOne((request) => request.url === '/api/v1/draws')
      .flush([
        {
          id: 'blocked-draw',
          drawType: 'DAILY',
          name: 'Sorteo 11 AM',
          nationalSequence: null,
          scheduledAt: closesAt,
          salesCloseAt: closesAt,
          status: 'OPEN',
          salesEnabled: false,
          salesBlockedAt: new Date().toISOString(),
          winningNumber: null,
          resultRegisteredAt: null,
          settledAt: null,
          version: 1,
          createdAt: new Date().toISOString(),
        },
      ]);
    http.expectOne('/api/v1/tickets/availability/blocked-draw').flush({
      sellerId: 'seller-id',
      drawId: 'blocked-draw',
      totalSold: 0,
      numbers: [],
      calculatedAt: new Date().toISOString(),
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.next-draw .status')?.textContent).toContain(
      'Ventas bloqueadas',
    );
    expect(fixture.nativeElement.querySelector('.countdown')?.textContent.trim()).not.toBe('—');
    expect(fixture.nativeElement.querySelector('.next-draw h2')?.textContent).toContain('LOTO');
  });
});
