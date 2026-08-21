import { inject, Injectable } from '@angular/core';
import { AuthService } from '../auth/auth.service';

@Injectable({ providedIn: 'root' })
export class FilterStateService {
  private readonly auth = inject(AuthService);

  restore<T extends object>(screen: string): Partial<T> | null {
    try {
      const value = sessionStorage.getItem(this.key(screen));
      if (!value) return null;
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Partial<T>)
        : null;
    } catch {
      this.clear(screen);
      return null;
    }
  }

  save<T extends object>(screen: string, state: T): void {
    try {
      sessionStorage.setItem(this.key(screen), JSON.stringify(state));
    } catch {
      // La navegación debe seguir funcionando aunque el almacenamiento no esté disponible.
    }
  }

  clear(screen: string): void {
    try {
      sessionStorage.removeItem(this.key(screen));
    } catch {
      // Sin acción: sessionStorage puede estar bloqueado por el navegador.
    }
  }

  private key(screen: string): string {
    return `suerte.filters.${this.auth.user()?.id ?? 'anonymous'}.${screen}`;
  }
}
