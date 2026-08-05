import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiProblem } from '../../core/models/api.models';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'lo-login-page',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly sessionChoiceOpen = signal(false);
  protected readonly form = this.formBuilder.nonNullable.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  constructor() {
    this.errorMessage.set(this.auth.consumeLoginNotice());
    if (this.auth.isAuthenticated()) void this.router.navigate(['/dashboard']);
  }

  protected submit(replaceExistingSession = false): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    if (replaceExistingSession) this.sessionChoiceOpen.set(false);
    const deviceName = `${navigator.platform || 'Web'} · ${this.compactBrowserName()}`;
    this.auth
      .login({ ...this.form.getRawValue(), deviceName, replaceExistingSession })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          if (response.user.mustChangePassword) {
            void this.router.navigate(['/change-password']);
            return;
          }
          const destination = this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
          void this.router.navigateByUrl(destination);
        },
        error: (error: HttpErrorResponse) => {
          const problem = error.error as ApiProblem | null;
          if (error.status === 409 && problem?.code === 'REEMPLAZO_DE_SESION_REQUERIDO') {
            this.sessionChoiceOpen.set(true);
            return;
          }
          this.errorMessage.set(
            problem?.detail ||
              'No pudimos iniciar sesión. Verifica tus datos e intenta nuevamente.',
          );
        },
      });
  }

  protected keepPreviousSession(): void {
    this.sessionChoiceOpen.set(false);
    this.errorMessage.set(null);
  }

  private compactBrowserName(): string {
    const agent = navigator.userAgent;
    if (agent.includes('Edg/')) return 'Edge';
    if (agent.includes('Chrome/')) return 'Chrome';
    if (agent.includes('Firefox/')) return 'Firefox';
    if (agent.includes('Safari/')) return 'Safari';
    return 'Navegador';
  }
}
