import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize, tap } from 'rxjs';
import { AuthenticatedUser, LoginRequest, LoginResponse } from '../models/auth.models';

const TOKEN_KEY = 'lotowo.access-token';
const USER_KEY = 'lotowo.user';
const EXPIRY_KEY = 'lotowo.access-token-expires-at';
const LOGIN_NOTICE_KEY = 'lotowo.login-notice';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly persistentStorage = isNativeRuntime() ? localStorage : sessionStorage;
  private readonly restoredSession = this.restoreSession();
  private readonly tokenState = signal<string | null>(this.restoredSession?.token ?? null);
  private readonly userState = signal<AuthenticatedUser | null>(this.restoredSession?.user ?? null);

  readonly token = this.tokenState.asReadonly();
  readonly user = this.userState.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.tokenState() && this.userState()));
  readonly isAdmin = computed(() => this.userState()?.role === 'ADMIN');
  readonly initials = computed(() => {
    const name = this.userState()?.fullName?.trim();
    if (!name) return 'LO';
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  });

  login(request: LoginRequest) {
    return this.http
      .post<LoginResponse>('/api/v1/auth/login', request)
      .pipe(tap((response) => this.persist(response)));
  }

  logout() {
    return this.http
      .post<void>('/api/v1/auth/logout', {})
      .pipe(finalize(() => this.clearSession()));
  }

  clearSession(): void {
    this.clearStoredSession();
    this.tokenState.set(null);
    this.userState.set(null);
  }

  markPasswordChanged(): void {
    const user = this.userState();
    if (!user) return;
    const updated = { ...user, mustChangePassword: false };
    this.persistentStorage.setItem(USER_KEY, JSON.stringify(updated));
    this.userState.set(updated);
  }

  markPasswordChangeRequired(): void {
    const user = this.userState();
    if (!user) return;
    const updated = { ...user, mustChangePassword: true };
    this.persistentStorage.setItem(USER_KEY, JSON.stringify(updated));
    this.userState.set(updated);
  }

  setLoginNotice(message: string): void {
    sessionStorage.setItem(LOGIN_NOTICE_KEY, message);
  }

  consumeLoginNotice(): string | null {
    const notice = sessionStorage.getItem(LOGIN_NOTICE_KEY);
    sessionStorage.removeItem(LOGIN_NOTICE_KEY);
    return notice;
  }

  private persist(response: LoginResponse): void {
    this.persistentStorage.setItem(TOKEN_KEY, response.accessToken);
    this.persistentStorage.setItem(USER_KEY, JSON.stringify(response.user));
    this.persistentStorage.setItem(EXPIRY_KEY, response.expiresAt);
    if (this.persistentStorage !== sessionStorage) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(EXPIRY_KEY);
    }
    this.tokenState.set(response.accessToken);
    this.userState.set(response.user);
  }

  private restoreSession(): { token: string; user: AuthenticatedUser } | null {
    this.migrateLegacyNativeSession();
    const token = this.persistentStorage.getItem(TOKEN_KEY);
    const value = this.persistentStorage.getItem(USER_KEY);
    const expiresAt = this.persistentStorage.getItem(EXPIRY_KEY);
    if (!token || !value) {
      this.clearStoredSession();
      return null;
    }
    if (expiresAt) {
      const expiration = Date.parse(expiresAt);
      if (!Number.isFinite(expiration) || expiration <= Date.now()) {
        this.clearStoredSession();
        return null;
      }
    }
    try {
      const user = JSON.parse(value) as AuthenticatedUser;
      if (!user.id || !user.username || !user.fullName || !user.role) throw new Error('invalid user');
      return { token, user };
    } catch {
      this.clearStoredSession();
      return null;
    }
  }

  private migrateLegacyNativeSession(): void {
    if (this.persistentStorage === sessionStorage || this.persistentStorage.getItem(TOKEN_KEY)) return;
    for (const key of [TOKEN_KEY, USER_KEY, EXPIRY_KEY]) {
      const value = sessionStorage.getItem(key);
      if (value) this.persistentStorage.setItem(key, value);
    }
  }

  private clearStoredSession(): void {
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem(TOKEN_KEY);
      storage.removeItem(USER_KEY);
      storage.removeItem(EXPIRY_KEY);
    }
  }
}

function isNativeRuntime(): boolean {
  const runtime = (globalThis as typeof globalThis & {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return runtime?.isNativePlatform?.() === true;
}
