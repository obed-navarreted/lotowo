import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LimitsPage } from './limits.page';

describe('LimitsPage', () => {
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
      imports: [LimitsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  function generalLimits(enabled: boolean) {
    return {
      policies: [
        {
          drawType: 'DAILY',
          enabled,
          defaultLimit: 15000,
          overrides: [{ number: '15', limit: 8000 }],
          excludedSellerIds: [],
        },
        {
          drawType: 'NATIONAL_LOTTERY',
          enabled: false,
          defaultLimit: null,
          overrides: [],
          excludedSellerIds: [],
        },
      ],
    };
  }

  function route(id: string, code: string, name: string) {
    return { id, code, name, active: true, sellerCount: 1, createdAt: '' };
  }

  function seller(id: string, fullName: string, username: string) {
    return {
      id,
      fullName,
      username,
      role: 'SELLER',
      routeId: 'route-1',
      routeName: 'Ticuantepe',
      enabled: true,
      active: true,
    };
  }

  it('keeps the saved general mode and lists every route and seller page for the search', () => {
    const fixture = TestBed.createComponent(LimitsPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/system-number-limits').flush(generalLimits(true));
    const routes = http.expectOne(
      (request) => request.url === '/api/v1/routes/manage' && request.params.get('page') === '0',
    );
    expect(routes.request.params.get('size')).toBe('100');
    routes.flush({
      content: [route('route-1', 'TIC', 'Ticuantepe')],
      page: 0,
      size: 100,
      totalElements: 1,
      totalPages: 1,
    });
    const firstUserPage = http.expectOne(
      (request) => request.url === '/api/v1/users' && request.params.get('page') === '0',
    );
    expect(firstUserPage.request.params.get('size')).toBe('100');
    firstUserPage.flush({
      content: [seller('seller-1', 'Luz Torres', 'luz')],
      page: 0,
      size: 100,
      totalElements: 2,
      totalPages: 2,
    });
    http
      .expectOne((request) => request.url === '/api/v1/users' && request.params.get('page') === '1')
      .flush({
        content: [seller('seller-2', 'Marta Ruiz', 'marta')],
        page: 1,
        size: 100,
        totalElements: 2,
        totalPages: 2,
      });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.status-pill')?.textContent).toContain(
      'Con límites',
    );
    expect(fixture.nativeElement.querySelector('.scope-tabs')?.textContent).toContain(
      '2 registrados',
    );

    const component = fixture.componentInstance as unknown as {
      selectScope(scope: 'GENERAL' | 'ROUTES' | 'SELLERS'): void;
      setQuery(value: string): void;
    };
    component.selectScope('SELLERS');
    component.setQuery('marta');
    fixture.detectChanges();
    const list = fixture.nativeElement.querySelector('.entity-list')?.textContent ?? '';
    expect(list).toContain('Marta Ruiz');
    expect(list).not.toContain('Luz Torres');
  });

  it('still shows the general rule when routes and sellers cannot be loaded', () => {
    const fixture = TestBed.createComponent(LimitsPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/system-number-limits').flush(generalLimits(true));
    http
      .expectOne((request) => request.url === '/api/v1/routes/manage')
      .flush({ code: 'ERROR', detail: 'Falló' }, { status: 500, statusText: 'Server Error' });
    http
      .expectOne((request) => request.url === '/api/v1/users')
      .flush({ code: 'ERROR', detail: 'Falló' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.status-pill')?.textContent).toContain(
      'Con límites',
    );
    expect(fixture.nativeElement.textContent).toContain('Solo verás la regla general');
  });
});
