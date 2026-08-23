import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MountingPage } from './mounting.page';

describe('MountingPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T14:00:00-06:00'));
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
    vi.useRealTimers();
  });

  it('selects the current draw and renders only numbers that need coverage', () => {
    const fixture = TestBed.createComponent(MountingPage);
    const agenda = http.expectOne((request) => request.url === '/api/v1/draws');
    expect(agenda.request.params.get('from')).toBe('2026-08-12T06:00:00.000Z');
    expect(agenda.request.params.get('to')).toBe('2026-08-13T05:59:59.999Z');
    agenda.flush([
      {
        id: 'later-draw',
        drawType: 'DAILY',
        scheduledAt: '2026-08-12T21:00:00-06:00',
        salesCloseAt: '2026-08-12T21:00:00-06:00',
        status: 'OPEN',
      },
      {
        id: 'current-draw',
        drawType: 'DAILY',
        scheduledAt: '2026-08-12T15:00:00-06:00',
        salesCloseAt: '2026-08-12T15:00:00-06:00',
        status: 'OPEN',
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
      mode: 'FREE',
      grossSales: 10_000,
      assumedPayout: 25_000,
      externalMultiplier: 80,
      totalStakeToRequest: 72.5,
      minimumResultAfterMounting: -15_000,
      generatedAt: '2026-08-12T18:30:00-06:00',
      items: [
        {
          number: '03',
          potentialPayout: 30_000,
          excessPayout: 5_000,
          stakeToRequest: 62.5,
          resultIfWinner: -72.5,
        },
        {
          number: '08',
          potentialPayout: 25_800,
          excessPayout: 800,
          stakeToRequest: 10,
          resultIfWinner: -72.5,
        },
      ],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h2')?.textContent).toContain('Números a pedir');
    expect(fixture.nativeElement.textContent).toContain('03');
    expect(fixture.nativeElement.textContent).toContain('62.5');
    expect(fixture.nativeElement.textContent).toContain('08');
    expect(fixture.nativeElement.textContent).toContain('72.5');

    const component = fixture.componentInstance as unknown as {
      selectMode(mode: 'ZERO_LOSS_WITH_COST'): void;
    };
    component.selectMode('ZERO_LOSS_WITH_COST');
    const zeroLoss = http.expectOne(
      (request) => request.url === '/api/v1/reports/draws/current-draw/mounting',
    );
    expect(zeroLoss.request.params.get('mode')).toBe('ZERO_LOSS_WITH_COST');
    expect(zeroLoss.request.params.has('assumedPayout')).toBe(false);
    zeroLoss.flush({
      drawId: 'current-draw',
      drawType: 'DAILY',
      scheduledAt: '2026-08-12T15:00:00-06:00',
      mode: 'ZERO_LOSS_WITH_COST',
      grossSales: 10_000,
      assumedPayout: null,
      externalMultiplier: 80,
      totalStakeToRequest: 550,
      minimumResultAfterMounting: 0,
      generatedAt: '2026-08-12T18:31:00-06:00',
      items: [],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cero pérdida');
    expect(fixture.nativeElement.textContent).toContain('ya está incluida');
  });
});
