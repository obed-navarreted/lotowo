import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NationalDrawsPage } from './national-draws.page';

describe('NationalDrawsPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NationalDrawsPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses calendar dates and sends Nicaragua date-times when creating a draw', () => {
    const fixture = TestBed.createComponent(NationalDrawsPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/draws/national-lottery').flush([]);
    http
      .expectOne('/api/v1/draws/national-lottery/next-sequence')
      .flush({ lastSequence: 2281, nextSequence: 2282 });

    const dateInputs = fixture.nativeElement.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(1);

    const component = fixture.componentInstance as unknown as {
      name: string;
      nationalSequence: number;
      scheduledDate: string;
      scheduledTime: string;
      save(): void;
    };
    component.name = 'Lotería dominical';
    component.nationalSequence = 2282;
    component.scheduledDate = '2026-08-09';
    component.scheduledTime = '18:00';
    component.save();

    const request = http.expectOne('/api/v1/draws/national-lottery');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.scheduledAt).toBe('2026-08-10T00:00:00.000Z');
    expect(request.request.body.salesCloseAt).toBe('2026-08-09T23:55:00.000Z');
    request.flush({
      id: 'draw-id',
      drawType: 'NATIONAL_LOTTERY',
      name: 'Lotería dominical',
      nationalSequence: 2282,
      scheduledAt: '2026-08-10T00:00:00.000Z',
      salesCloseAt: '2026-08-09T23:55:00.000Z',
      status: 'SCHEDULED',
      salesEnabled: true,
      salesBlockedAt: null,
      winningNumber: null,
      resultRegisteredAt: null,
      settledAt: null,
      version: 0,
      createdAt: '2026-08-08T00:00:00.000Z',
    });
  });
});
