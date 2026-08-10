import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { OperationalReportPdfService } from '../../core/reports/operational-report-pdf.service';
import { FollowUpPage } from './follow-up.page';

describe('FollowUpPage', () => {
  let http: HttpTestingController;
  const pdf = { exportFollowUpSheet: vi.fn(() => Promise.resolve()) };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T20:30:00-06:00'));
    pdf.exportFollowUpSheet.mockClear();
    await TestBed.configureTestingModule({
      imports: [FollowUpPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OperationalReportPdfService, useValue: pdf },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('defaults to Nicaragua today and generates for the first active route', async () => {
    const fixture = TestBed.createComponent(FollowUpPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/routes').flush([
      {
        id: 'route-id',
        code: 'R-01',
        name: 'Centro',
        active: true,
        createdAt: '2026-08-01T00:00:00Z',
      },
    ]);
    fixture.detectChanges();

    const component = fixture.componentInstance as unknown as {
      date: string;
      routeId: string;
      dateLabel(): string;
      generate(): void;
    };
    expect(component.date).toBe('2026-08-08');
    expect(component.dateLabel()).toBe('08/08/26');
    expect(component.routeId).toBe('route-id');
    component.generate();

    const request = http.expectOne((candidate) => candidate.url === '/api/v1/reports/follow-up');
    expect(request.request.params.get('date')).toBe('2026-08-08');
    expect(request.request.params.get('routeId')).toBe('route-id');
    request.flush({
      date: '2026-08-08',
      routeId: 'route-id',
      routeCode: 'R-01',
      routeName: 'Centro',
      sellers: [{ id: 'seller', fullName: 'Ana López' }],
    });
    await Promise.resolve();

    expect(pdf.exportFollowUpSheet).toHaveBeenCalledOnce();
  });
});
