import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MountingPage } from './mounting.page';

describe('MountingPage', () => {
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
      imports: [MountingPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('selects the current draw and renders only numbers that need coverage', () => {
    const fixture = TestBed.createComponent(MountingPage);
    http.expectOne('/api/v1/draws/saleable').flush([
      {
        id: 'later-draw',
        drawType: 'DAILY',
        scheduledAt: '2026-08-12T21:00:00-06:00',
      },
      {
        id: 'current-draw',
        drawType: 'DAILY',
        scheduledAt: '2026-08-12T15:00:00-06:00',
      },
    ]);

    const calculation = http.expectOne(
      (request) => request.url === '/api/v1/reports/draws/current-draw/mounting',
    );
    expect(calculation.request.params.get('assumedPayout')).toBe('25000');
    calculation.flush({
      drawId: 'current-draw',
      drawType: 'DAILY',
      scheduledAt: '2026-08-12T15:00:00-06:00',
      assumedPayout: 25_000,
      externalMultiplier: 80,
      totalStakeToRequest: 72.5,
      generatedAt: '2026-08-12T18:30:00-06:00',
      items: [
        {
          number: '03',
          potentialPayout: 30_000,
          excessPayout: 5_000,
          stakeToRequest: 62.5,
        },
        {
          number: '08',
          potentialPayout: 25_800,
          excessPayout: 800,
          stakeToRequest: 10,
        },
      ],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h2')?.textContent).toContain('Números a pedir');
    expect(fixture.nativeElement.textContent).toContain('03');
    expect(fixture.nativeElement.textContent).toContain('62.5');
    expect(fixture.nativeElement.textContent).toContain('08');
    expect(fixture.nativeElement.textContent).toContain('72.5');
  });
});
