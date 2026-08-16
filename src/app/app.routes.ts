import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { adminGuard } from './core/auth/admin.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.page').then((component) => component.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/app-shell').then((component) => component.AppShell),
    children: [
      {
        path: 'dashboard',
        title: 'Inicio · Suerte',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then(
            (component) => component.DashboardPage,
          ),
      },
      {
        path: 'change-password',
        title: 'Cambiar contraseña · Suerte',
        loadComponent: () =>
          import('./features/auth/change-password.page').then(
            (component) => component.ChangePasswordPage,
          ),
      },
      {
        path: 'settings/printer',
        title: 'Impresora · Suerte',
        loadComponent: () =>
          import('./features/settings/printer-settings.page').then(
            (component) => component.PrinterSettingsPage,
          ),
      },
      {
        path: 'sell',
        title: 'Nueva venta · Suerte',
        loadComponent: () =>
          import('./features/sales/sale.page').then((component) => component.SalePage),
      },
      {
        path: 'tickets',
        title: 'Boletos · Suerte',
        loadComponent: () =>
          import('./features/tickets/tickets.page').then((component) => component.TicketsPage),
      },
      {
        path: 'tickets/:id/edit',
        title: 'Editar boleto · Suerte',
        loadComponent: () =>
          import('./features/sales/sale.page').then((component) => component.SalePage),
      },
      {
        path: 'tickets/:id',
        title: 'Detalle de boleto · Suerte',
        loadComponent: () =>
          import('./features/tickets/ticket-detail.page').then(
            (component) => component.TicketDetailPage,
          ),
      },
      {
        path: 'utilities',
        title: 'Utilidades · Suerte',
        loadComponent: () =>
          import('./features/utilities/utilities.page').then(
            (component) => component.UtilitiesPage,
          ),
      },
      {
        path: 'exposure',
        title: 'Control de ventas · Suerte',
        loadComponent: () =>
          import('./features/exposure/exposure.page').then((component) => component.ExposurePage),
      },
      {
        path: 'mounting',
        title: 'Montada · Suerte',
        loadComponent: () =>
          import('./features/mounting/mounting.page').then((component) => component.MountingPage),
      },
      {
        path: 'reports',
        title: 'Reportes · Suerte',
        loadComponent: () =>
          import('./features/reports/reports.page').then((component) => component.ReportsPage),
      },
      {
        path: 'reports/history',
        title: 'Resultados e histórico · Suerte',
        loadComponent: () =>
          import('./features/reports/report-history.page').then(
            (component) => component.ReportHistoryPage,
          ),
      },
      {
        path: 'reports/winners',
        title: 'Detalle de ganadores · Suerte',
        loadComponent: () =>
          import('./features/reports/winner-detail.page').then(
            (component) => component.WinnerDetailPage,
          ),
      },
      {
        path: 'reports/commissions',
        redirectTo: 'utilities',
        pathMatch: 'full',
      },
      {
        path: 'reports/follow-up',
        title: 'Seguimiento · Suerte',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/reports/follow-up.page').then((component) => component.FollowUpPage),
      },
      {
        path: 'settings/notifications',
        redirectTo: 'exposure',
        pathMatch: 'full',
      },
      {
        path: 'results',
        title: 'Gestión de resultados · Suerte',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/results/results.page').then(
            (component) => component.ResultsPage,
          ),
      },
      {
        path: 'management',
        title: 'Gestión financiera · Suerte',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/finance/finance-management.page').then(
            (component) => component.FinanceManagementPage,
          ),
      },
      {
        path: 'users',
        title: 'Usuarios · Suerte',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/users/users.page').then((component) => component.UsersPage),
      },
      {
        path: 'users/:id/limits',
        title: 'Límites por número · Suerte',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/seller-limits/seller-limits.page').then(
            (component) => component.SellerLimitsPage,
          ),
      },
      {
        path: 'routes',
        title: 'Rutas · Suerte',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/routes/routes.page').then((component) => component.RoutesPage),
      },
      {
        path: 'routes/:id/limits',
        title: 'Límites de ruta · Suerte',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/route-limits/route-limits.page').then(
            (component) => component.RouteLimitsPage,
          ),
      },
      {
        path: 'limits',
        title: 'Límites · Suerte',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/limits/limits.page').then((component) => component.LimitsPage),
      },
      {
        path: 'settings/system',
        title: 'Reglas del sistema · Suerte',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/prize-tables/prize-tables.page').then(
            (component) => component.PrizeTablesPage,
          ),
      },
      {
        path: 'prize-tables',
        redirectTo: 'settings/system',
        pathMatch: 'full',
      },
      {
        path: 'national-draws',
        title: 'Lotería Nacional · Suerte',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/national-draws/national-draws.page').then(
            (component) => component.NationalDrawsPage,
          ),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];
