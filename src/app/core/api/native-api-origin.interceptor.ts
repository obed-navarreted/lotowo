import { HttpInterceptorFn } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../../environments/environment';

const NATIVE_API_ORIGIN_KEY = 'lotowo.native-api-origin';

export const nativeApiOriginInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/')) return next(request);
  const native = Capacitor.isNativePlatform();
  const developmentOverride =
    native && !environment.production ? localStorage.getItem(NATIVE_API_ORIGIN_KEY) : null;
  const origin = (
    developmentOverride || (native ? environment.nativeApiOrigin : environment.apiOrigin)
  ).replace(/\/$/, '');
  if (!origin) return next(request);
  return next(request.clone({ url: `${origin}${request.url}` }));
};
