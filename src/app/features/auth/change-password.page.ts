import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { LotoApiService } from '../../core/api/loto-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../shared/api-error';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'lo-change-password-page',
  imports: [FormsModule, Icon],
  templateUrl: './change-password.page.html',
  styleUrl: './change-password.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordPage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(LotoApiService);
  private readonly router = inject(Router);
  protected readonly saving = signal(false);
  protected readonly showPasswords = signal(false);
  protected readonly error = signal('');
  protected currentPassword = '';
  protected newPassword = '';
  protected confirmation = '';

  protected save(): void {
    if (!this.currentPassword) {
      this.error.set('Escribe tu contraseña actual.');
      return;
    }
    if (this.newPassword.length < 5) {
      this.error.set('La nueva contraseña debe tener al menos 5 caracteres.');
      return;
    }
    if (this.newPassword !== this.confirmation) {
      this.error.set('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api
      .changeMyPassword(this.currentPassword, this.newPassword)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.auth.markPasswordChanged();
          void this.router.navigate(['/dashboard']);
        },
        error: (apiError: unknown) =>
          this.error.set(apiErrorMessage(apiError, 'No fue posible actualizar la contraseña.')),
      });
  }
}
