import { HttpInterceptorFn } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';

const NATIVE_API_ORIGIN_KEY = 'lotowo.native-api-origin';
const DEVELOPMENT_API_ORIGIN = 'http://192.168.100.12:8080';

export const nativeApiOriginInterceptor: HttpInterceptorFn = (request, next) => {
  if (Capacitor.getPlatform() !== 'android' || !request.url.startsWith('/')) return next(request);
  const origin = (localStorage.getItem(NATIVE_API_ORIGIN_KEY) || DEVELOPMENT_API_ORIGIN).replace(
    /\/$/,
    '',
  );
  return next(request.clone({ url: `${origin}${request.url}` }));
};
