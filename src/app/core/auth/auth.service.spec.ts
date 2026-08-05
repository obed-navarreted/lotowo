import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { LoginResponse } from '../models/auth.models';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  const response: LoginResponse = {
    accessToken: 'opaque-token',
    tokenType: 'Bearer',
    expiresAt: '2099-08-02T12:00:00Z',
    user: {
      id: 'user-id',
      username: 'maria',
      fullName: 'María López',
      role: 'SELLER',
      routeId: 'route-id',
      mustChangePassword: false,
    },
  };

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
  });

  it('persists the opaque token and authenticated user after login', () => {
    service.login({ username: 'maria', password: 'secret', deviceName: 'web' }).subscribe();
    const request = http.expectOne('/api/v1/auth/login');
    expect(request.request.method).toBe('POST');
    request.flush(response);

    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()?.fullName).toBe('María López');
    expect(service.initials()).toBe('ML');
    expect(sessionStorage.getItem('lotowo.access-token')).toBe('opaque-token');
    expect(sessionStorage.getItem('lotowo.access-token-expires-at')).toBe(response.expiresAt);
  });

  it('restores the session after Android recreates the WebView', () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    const nativeService = TestBed.runInInjectionContext(() => new AuthService());
    nativeService.login({ username: 'maria', password: 'secret', deviceName: 'Android' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(response);

    expect(localStorage.getItem('lotowo.access-token')).toBe('opaque-token');
    expect(sessionStorage.getItem('lotowo.access-token')).toBeNull();

    const restored = TestBed.runInInjectionContext(() => new AuthService());
    expect(restored.isAuthenticated()).toBe(true);
    expect(restored.user()?.id).toBe('user-id');
  });

  it('does not restore a locally expired session', () => {
    sessionStorage.setItem('lotowo.access-token', 'expired-token');
    sessionStorage.setItem('lotowo.user', JSON.stringify(response.user));
    sessionStorage.setItem('lotowo.access-token-expires-at', '2020-01-01T00:00:00Z');

    const restored = TestBed.runInInjectionContext(() => new AuthService());
    expect(restored.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem('lotowo.access-token')).toBeNull();
  });

  it('clears local session even when logout request completes', () => {
    service.login({ username: 'maria', password: 'secret', deviceName: 'web' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(response);

    service.logout().subscribe();
    http.expectOne('/api/v1/auth/logout').flush(null);

    expect(service.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem('lotowo.access-token')).toBeNull();
    expect(localStorage.getItem('lotowo.access-token')).toBeNull();
  });

  it('confirms an explicit session replacement without changing credentials', () => {
    service
      .login({
        username: 'maria',
        password: 'secret',
        deviceName: 'telefono',
        replaceExistingSession: true,
      })
      .subscribe();

    const request = http.expectOne('/api/v1/auth/login');
    expect(request.request.body).toEqual({
      username: 'maria',
      password: 'secret',
      deviceName: 'telefono',
      replaceExistingSession: true,
    });
    request.flush(response);
  });

  it('keeps the mandatory password-change state in the current session', () => {
    service.login({ username: 'maria', password: 'secret', deviceName: 'web' }).subscribe();
    http.expectOne('/api/v1/auth/login').flush(response);

    service.markPasswordChangeRequired();
    expect(service.user()?.mustChangePassword).toBe(true);

    service.markPasswordChanged();
    expect(service.user()?.mustChangePassword).toBe(false);
  });
});
