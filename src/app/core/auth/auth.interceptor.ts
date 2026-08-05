import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const authenticatedRequest = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authenticatedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 403 && error.error?.code === 'CAMBIO_PASSWORD_REQUERIDO') {
        auth.markPasswordChangeRequired();
        void router.navigate(['/change-password']);
      }
      if (error.status === 401 && !request.url.endsWith('/auth/login')) {
        if (error.error?.code === 'USUARIO_DESACTIVADO') {
          auth.setLoginNotice(
            error.error.detail ||
              'Tu usuario está actualmente desactivado. Por favor, contacta al administrador.',
          );
        }
        auth.clearSession();
        void router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};
