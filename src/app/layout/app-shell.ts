import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { UserRole } from '../core/models/auth.models';
import { AppNotification, NotificationService } from '../core/notifications/notification.service';
import { PwaInstallService } from '../core/pwa/pwa-install.service';
import { PrinterService } from '../core/printer/printer.service';
import { Icon } from '../shared/icon/icon';

interface NavigationItem {
  label: string;
  shortLabel: string;
  icon: string;
  route: string;
  roles: UserRole[];
}

@Component({
  selector: 'lo-app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShell {
  protected readonly auth = inject(AuthService);
  protected readonly notifications = inject(NotificationService);
  protected readonly pwa = inject(PwaInstallService);
  protected readonly printer = inject(PrinterService);
  private readonly router = inject(Router);
  protected readonly menuOpen = signal(false);
  protected readonly notificationsOpen = signal(false);
  protected readonly loggingOut = signal(false);

  private readonly allNavigation: NavigationItem[] = [
    {
      label: 'Inicio',
      shortLabel: 'Inicio',
      icon: 'home',
      route: '/dashboard',
      roles: ['ADMIN', 'SUPERVISOR', 'SELLER'],
    },
    { label: 'Nueva venta', shortLabel: 'Vender', icon: 'sell', route: '/sell', roles: ['SELLER'] },
    {
      label: 'Resultados',
      shortLabel: 'Resultados',
      icon: 'check',
      route: '/reports/history',
      roles: ['SUPERVISOR', 'SELLER'],
    },
    { label: 'Usuarios', shortLabel: 'Usuarios', icon: 'users', route: '/users', roles: ['ADMIN'] },
    { label: 'Rutas', shortLabel: 'Rutas', icon: 'route', route: '/routes', roles: ['ADMIN'] },
    { label: 'Límites', shortLabel: 'Límites', icon: 'lock', route: '/limits', roles: ['ADMIN'] },
    {
      label: 'Lotería Nacional',
      shortLabel: 'Lotería',
      icon: 'clock',
      route: '/national-draws',
      roles: ['ADMIN'],
    },
    {
      label: 'Resultados',
      shortLabel: 'Resultados',
      icon: 'check',
      route: '/results',
      roles: ['ADMIN'],
    },
    {
      label: 'Configuración',
      shortLabel: 'Config.',
      icon: 'edit',
      route: '/settings/system',
      roles: ['ADMIN'],
    },
    {
      label: 'Gestión',
      shortLabel: 'Gestión',
      icon: 'wallet',
      route: '/management',
      roles: ['ADMIN'],
    },
    {
      label: 'Boletos',
      shortLabel: 'Boletos',
      icon: 'ticket',
      route: '/tickets',
      roles: ['ADMIN', 'SUPERVISOR', 'SELLER'],
    },
    {
      label: 'Utilidades',
      shortLabel: 'Utilidad',
      icon: 'trend',
      route: '/utilities',
      roles: ['ADMIN', 'SUPERVISOR', 'SELLER'],
    },
    {
      label: 'Control de ventas',
      shortLabel: 'Control',
      icon: 'table',
      route: '/exposure',
      roles: ['ADMIN', 'SUPERVISOR', 'SELLER'],
    },
    {
      label: 'Montada',
      shortLabel: 'Montada',
      icon: 'stack',
      route: '/mounting',
      roles: ['ADMIN', 'SUPERVISOR', 'SELLER'],
    },
    {
      label: 'Reportes',
      shortLabel: 'Reportes',
      icon: 'chart',
      route: '/reports',
      roles: ['ADMIN', 'SUPERVISOR', 'SELLER'],
    },
    {
      label: 'Seguimiento',
      shortLabel: 'Hoja',
      icon: 'clipboard',
      route: '/reports/follow-up',
      roles: ['ADMIN'],
    },
  ];

  protected readonly navigation = computed(() => {
    const role = this.auth.user()?.role;
    return role ? this.allNavigation.filter((item) => item.roles.includes(role)) : [];
  });

  protected readonly mobileNavigation = computed(() => {
    const role = this.auth.user()?.role;
    const preferred =
      role === 'ADMIN'
        ? ['/dashboard', '/results', '/tickets', '/utilities', '/exposure']
        : ['/dashboard', '/reports/history', '/tickets', '/utilities', '/exposure'];
    const available = this.navigation();
    return preferred.flatMap((route) => available.filter((item) => item.route === route));
  });

  constructor() {
    this.notifications.start();
    this.printer.start();
  }

  protected roleLabel(role: UserRole | undefined): string {
    return ({ ADMIN: 'Administrador', SUPERVISOR: 'Supervisor', SELLER: 'Vendedor' } as const)[
      role ?? 'SELLER'
    ];
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected toggleNotifications(): void {
    const open = !this.notificationsOpen();
    this.notificationsOpen.set(open);
  }

  protected openNotification(notification: AppNotification): void {
    this.notifications.markRead(notification.id);
    this.notificationsOpen.set(false);
    void this.router.navigateByUrl(notification.route);
  }

  protected notificationTime(value: string): string {
    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Managua',
    }).format(new Date(value));
  }

  protected logout(): void {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.notifications.stop();
    this.printer.stop();
    this.auth.logout().subscribe({
      next: () => void this.router.navigate(['/login']),
      error: () => void this.router.navigate(['/login']),
    });
  }
}
