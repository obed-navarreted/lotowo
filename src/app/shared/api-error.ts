import { HttpErrorResponse } from '@angular/common/http';
import { ApiProblem } from '../core/models/api.models';

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  const problem = error.error as ApiProblem | null;
  const message = problem?.detail || Object.values(problem?.errors ?? {})[0];
  if (!message || isFrameworkMessage(message)) return fallback;
  return message;
}

function isFrameworkMessage(message: string): boolean {
  return /no static resource|no endpoint|whitelabel error|internal server error|failed to fetch|networkerror/i.test(
    message,
  );
}
