import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CommissionPayroll } from '../../core/models/api.models';
import { CommissionReportPage } from './commission-report.page';

describe('CommissionReportPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommissionReportPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('keeps each seller totals, days and signature inside the same visual block', () => {
    const fixture = TestBed.createComponent(CommissionReportPage);
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === '/api/v1/users')
      .flush({
        content: [],
        page: 0,
        size: 100,
        totalElements: 0,
        totalPages: 0,
      });

    const component = fixture.componentInstance as unknown as {
      from: string;
      to: string;
      generate(): void;
    };
    component.from = '2026-08-07';
    component.to = '2026-08-08';
    component.generate();

    http
      .expectOne((request) => request.url === '/api/v1/reports/commissions/payroll')
      .flush(payrollFixture());
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('.seller-block'));
    expect(blocks).toHaveLength(2);
    expect(blocks[0].dataset['sellerId']).toBe('laura-id');
    expect(blocks[0].textContent).toContain('Laura Manzanarez');
    expect(blocks[0].textContent).toContain('8,955');
    expect(blocks[0].textContent).not.toContain('Jennifer Flores');
    expect(blocks[1].dataset['sellerId']).toBe('jennifer-id');
    expect(blocks[1].textContent).toContain('Jennifer Flores');
    expect(blocks[1].textContent).toContain('1,241');
    expect(blocks[1].textContent).not.toContain('Laura Manzanarez');
  });
});

function payrollFixture(): CommissionPayroll {
  return {
    from: '2026-08-07',
    to: '2026-08-08',
    grossSales: 10196,
    prizesDue: 800,
    commissionAmount: 1019.6,
    netBeforeCommission: 9396,
    netAfterCommission: 8376.4,
    sellers: [
      {
        sellerId: 'laura-id',
        sellerName: 'Laura Manzanarez',
        from: '2026-08-07',
        to: '2026-08-08',
        grossSales: 8955,
        prizesDue: 0,
        commissionAmount: 895.5,
        netBeforeCommission: 8955,
        netAfterCommission: 8059.5,
        entries: [
          {
            drawId: 'laura-draw',
            drawType: 'DAILY',
            scheduledAt: '2026-08-07T21:00:00-06:00',
            winningNumber: '36',
            grossSales: 8955,
            prizesDue: 0,
            commissionRate: 10,
            commissionAmount: 895.5,
            netBeforeCommission: 8955,
            netAfterCommission: 8059.5,
          },
        ],
      },
      {
        sellerId: 'jennifer-id',
        sellerName: 'Jennifer Flores',
        from: '2026-08-07',
        to: '2026-08-08',
        grossSales: 1241,
        prizesDue: 800,
        commissionAmount: 124.1,
        netBeforeCommission: 441,
        netAfterCommission: 316.9,
        entries: [
          {
            drawId: 'jennifer-draw',
            drawType: 'DAILY',
            scheduledAt: '2026-08-07T15:00:00-06:00',
            winningNumber: '10',
            grossSales: 1241,
            prizesDue: 800,
            commissionRate: 10,
            commissionAmount: 124.1,
            netBeforeCommission: 441,
            netAfterCommission: 316.9,
          },
        ],
      },
    ],
  };
}
