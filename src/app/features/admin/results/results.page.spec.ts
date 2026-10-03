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

  it('registers only the winner from the simplified result dialog', () => {
    const fixture = TestBed.createComponent(ResultsPage);
    const component = fixture.componentInstance as unknown as {
      openResult(draw: Draw): void;
      updateNumber(value: string): void;
      submitResult(): void;
    };
    const draw = pendingDraw();
    http.expectOne((request) => request.url === '/api/v1/draws').flush([draw]);

    component.openResult(draw);
    component.updateNumber('08');
    component.submitResult();

    const result = http.expectOne('/api/v1/settlements/draws/draw-id/result');
    expect(result.request.body).toEqual({ number: '08' });
    result.flush({
      id: 'closure-id',
      drawId: 'draw-id',
      drawName: 'Sorteo diario 11 AM',
      winningNumber: '08',
      grossSales: 500,
      winningStakes: 12.5,
      prizesDue: 1000,
      netResult: -500,
      createdAt: '2026-08-16T18:01:00Z',
    });
    http.expectOne((request) => request.url === '/api/v1/draws').flush([]);
  });

  it('does not present mounting fields in the result dialog', () => {
    const fixture = TestBed.createComponent(ResultsPage);
    const component = fixture.componentInstance as unknown as { openResult(draw: Draw): void };
    const draw = pendingDraw();
    http.expectOne((request) => request.url === '/api/v1/draws').flush([draw]);
    component.openResult(draw);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Montada externa');
    expect(fixture.nativeElement.textContent).toContain('Agregar número ganador');
  });

  it('previews and corrects a registered winner with external reconciliation', () => {
    const fixture = TestBed.createComponent(ResultsPage);
    const component = fixture.componentInstance as unknown as {
      openCorrection(draw: Draw): void;
      updateNumber(value: string): void;
      requestPreview(): void;
      updateExternalAmount(batchId: string, value: string): void;
      correctionReason: { set(value: string): void };
      submitCorrection(): void;
    };
    const draw: Draw = { ...pendingDraw(), winningNumber: '08', status: 'SETTLED', version: 3 };
    http.expectOne((request) => request.url === '/api/v1/draws').flush([draw]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Editar ganador');

    component.openCorrection(draw);
    component.updateNumber('09');
    component.correctionReason.set('Acta corregida');
    component.requestPreview();
    const preview = http.expectOne('/api/v1/settlements/draws/draw-id/result/preview');
    expect(preview.request.body).toEqual({ number: '09' });
    preview.flush({
      drawId: 'draw-id',
      version: 3,
      previousNumber: '08',
      newNumber: '09',
      grossSales: 500,
      previousPrizesDue: 800,
      newPrizesDue: 400,
      previousNetResult: -300,
      newNetResult: 100,
      commissions: 50,
      externalStake: 100,
      previousExternalPrize: 8000,
      manualMovementsNeedReview: false,
      externalPayouts: [
        {
          batchId: 'batch-1',
          source: 'POLICY',
          currentAmount: 8000,
          calculatedAmount: null,
          requiresInput: true,
        },
      ],
    });
    component.updateExternalAmount('batch-1', '100');
    component.submitCorrection();
    const update = http.expectOne('/api/v1/settlements/draws/draw-id/result');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({
      number: '09',
      reason: 'Acta corregida',
      expectedVersion: 3,
      externalPayouts: [{ batchId: 'batch-1', amount: 100 }],
    });
    update.flush({
      id: 'closure-id',
      drawId: 'draw-id',
      drawName: draw.name,
      winningNumber: '09',
      grossSales: 500,
      winningStakes: 5,
      prizesDue: 400,
      netResult: 100,
      createdAt: '2026-08-16T18:01:00Z',
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
