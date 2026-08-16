import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { Draw } from '../../../core/models/api.models';
import { ResultsPage } from './results.page';

describe('ResultsPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T12:00:00-06:00'));
    await TestBed.configureTestingModule({
      imports: [ResultsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('registers the winner, late mounting and external prize in one request', () => {
    const fixture = TestBed.createComponent(ResultsPage);
    const component = fixture.componentInstance as unknown as {
      openResult(draw: Draw): void;
      updateNumber(value: string): void;
      addMounting(): void;
      updateMountingNumber(index: number, value: string): void;
      updateMountingAmount(index: number, value: string): void;
      submitResult(): void;
    };
    const draw = pendingDraw();
    http.expectOne((request) => request.url === '/api/v1/draws').flush([draw]);

    component.openResult(draw);
    component.updateNumber('08');
    component.addMounting();
    component.updateMountingNumber(0, '08');
    component.updateMountingAmount(0, '100');
    component.submitResult();

    const result = http.expectOne('/api/v1/admin/finance/draws/draw-id/result');
    expect(result.request.body).toEqual({
      winningNumber: '08',
      mountings: [{ number: '08', stakeAmount: 100, payoutMultiplier: 80 }],
      externalPrizeReceived: 8000,
    });
    result.flush({
      drawId: 'draw-id',
      winningNumber: '08',
      grossSales: 500,
      localPrizes: 1000,
      commissions: 50,
      externalStake: 100,
      externalPrize: 8000,
      businessResult: 7350,
    });
    http.expectOne((request) => request.url === '/api/v1/draws').flush([]);
  });
});

function pendingDraw(): Draw {
  return {
    id: 'draw-id',
    drawType: 'DAILY',
    name: 'Sorteo diario 11 AM',
    nationalSequence: null,
    scheduledAt: '2026-08-16T17:00:00Z',
    salesCloseAt: '2026-08-16T17:00:00Z',
    status: 'CLOSED',
    salesEnabled: false,
    salesBlockedAt: null,
    winningNumber: null,
    resultRegisteredAt: null,
    settledAt: null,
    version: 1,
    createdAt: '2026-08-16T00:00:00Z',
  };
}
