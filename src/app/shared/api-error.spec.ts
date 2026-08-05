import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorMessage } from './api-error';

describe('apiErrorMessage', () => {
  it('does not expose framework resource messages to the user', () => {
    const error = new HttpErrorResponse({
      status: 404,
      error: { detail: 'No static resource api/v1/notifications/settings.' },
    });

    expect(apiErrorMessage(error, 'No pudimos cargar las alertas.')).toBe(
      'No pudimos cargar las alertas.',
    );
  });

  it('keeps business messages returned in Spanish', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { detail: 'El sorteo está bloqueado para ventas.' },
    });

    expect(apiErrorMessage(error, 'No pudimos completar la operación.')).toBe(
      'El sorteo está bloqueado para ventas.',
    );
  });
});
