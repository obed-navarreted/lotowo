import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  CreateTicketRequest,
  DailyReport,
  Draw,
  DrawClosure,
  DrawNumberReport,
  MountingReport,
  DrawReport,
  DrawSettlementReport,
  NumberExposure,
  PageResponse,
  SellerAvailability,
  Ticket,
  TicketPrint,
  TicketDaySummary,
  UtilitySummary,
  TicketFilters,
  PushConfiguration,
  AndroidPushTokenPayload,
  PushSubscriptionPayload,
  UserNotification,
  NotificationSettings,
  CommissionPayroll,
  FollowUpSheet,
  SellerCommissionReport,
  WinnerDrawSummary,
  BusinessSettlement,
  ExternalMountingInput,
  BusinessFinanceSummary,
  BusinessFinanceDetails,
  BusinessMovement,
  BusinessMovementInput,
  BusinessExpense,
  ExpenseInput,
} from '../models/api.models';
import {
  CommissionUpdate,
  CreateUserRequest,
  CreateNationalDrawRequest,
  ManagedRoute,
  ManagedUser,
  NationalSequence,
  NumberControl,
  RouteSummary,
  SaveRouteNumberLimitsRequest,
  SaveSellerNumberLimitsRequest,
  SaveSystemNumberLimitsRequest,
  SaveNumberControlRequest,
  SystemSalesSettings,
  SystemNumberLimits,
  UpdateSystemSalesSettingsRequest,
  RouteNumberLimits,
  SellerNumberLimits,
  UpdateCommissionRequest,
  UpdateUserRoleRequest,
  UserAssignments,
} from '../models/admin.models';
import { createIdempotencyKey } from './idempotency-key';

@Injectable({ providedIn: 'root' })
export class LotoApiService {
  private readonly http = inject(HttpClient);

  getNotifications() {
    return this.http.get<UserNotification[]>('/api/v1/notifications');
  }

  getPushConfiguration() {
    return this.http.get<PushConfiguration>('/api/v1/notifications/push/configuration');
  }

  getNotificationSettings() {
    return this.http.get<NotificationSettings>('/api/v1/notifications/settings');
  }

  updateNotificationSettings(numberExposureEnabled: boolean, numberExposureThreshold: number) {
    return this.http.put<NotificationSettings>('/api/v1/notifications/settings', {
      numberExposureEnabled,
      numberExposureThreshold,
    });
  }

  registerPushSubscription(subscription: PushSubscriptionPayload) {
    return this.http.post<void>('/api/v1/notifications/push/subscriptions', subscription);
  }

  unregisterPushSubscription(endpoint: string) {
    return this.http.delete<void>('/api/v1/notifications/push/subscriptions', {
      body: { endpoint },
    });
  }

  registerAndroidPushToken(payload: AndroidPushTokenPayload) {
    return this.http.post<void>('/api/v1/notifications/push/android-tokens', payload);
  }

  unregisterAndroidPushToken(payload: AndroidPushTokenPayload) {
    return this.http.delete<void>('/api/v1/notifications/push/android-tokens', { body: payload });
  }

  markNotificationRead(notificationId: string) {
    return this.http.put<void>(`/api/v1/notifications/${notificationId}/read`, null);
  }

  markAllNotificationsRead() {
    return this.http.put<void>('/api/v1/notifications/read-all', null);
  }

  getDraws(from: Date, to: Date) {
    const params = new HttpParams().set('from', from.toISOString()).set('to', to.toISOString());
    return this.http.get<Draw[]>('/api/v1/draws', { params });
  }

  getSaleableDraws() {
    return this.http.get<Draw[]>('/api/v1/draws/saleable');
  }

  getNationalDraws() {
    return this.http.get<Draw[]>('/api/v1/draws/national-lottery');
  }

  getNationalSequence() {
    return this.http.get<NationalSequence>('/api/v1/draws/national-lottery/next-sequence');
  }

  createNationalDraw(request: CreateNationalDrawRequest) {
    return this.http.post<Draw>('/api/v1/draws/national-lottery', request);
  }

  updateDrawSales(drawId: string, enabled: boolean) {
    return this.http.put<Draw>(`/api/v1/draws/${drawId}/sales`, { enabled });
  }

  getTickets(page = 0, size = 20, filters: TicketFilters = {}) {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value?.trim()) params = params.set(key, value.trim());
    }
    return this.http.get<PageResponse<Ticket>>('/api/v1/tickets', { params });
  }

  getTicketExposure(drawId: string, sellerId?: string) {
    const params = sellerId ? new HttpParams().set('sellerId', sellerId) : undefined;
    return this.http.get<NumberExposure[]>(`/api/v1/tickets/exposure/${drawId}`, { params });
  }

  getTicketDaySummary(date: string, drawId?: string, sellerId?: string) {
    let params = new HttpParams().set('date', date);
    if (drawId) params = params.set('drawId', drawId);
    if (sellerId) params = params.set('sellerId', sellerId);
    return this.http.get<TicketDaySummary>('/api/v1/tickets/day-summary', { params });
  }

  getUtilitySummary(
    from: string,
    to: string,
    drawIds: string[] = [],
    sellerId?: string,
    routeId?: string,
    includeProvisional = true,
  ) {
    let params = new HttpParams()
      .set('from', from)
      .set('to', to)
      .set('includeProvisional', includeProvisional);
    for (const drawId of drawIds) params = params.append('drawIds', drawId);
    if (sellerId) params = params.set('sellerId', sellerId);
    if (routeId) params = params.set('routeId', routeId);
    return this.http.get<UtilitySummary>('/api/v1/reports/utilities/summary', { params });
  }

  getTicket(ticketId: string) {
    return this.http.get<Ticket>(`/api/v1/tickets/${ticketId}`);
  }

  registerTicketPrint(ticketId: string) {
    return this.http.post<TicketPrint>('/api/v1/tickets/' + ticketId + '/prints', null);
  }

  getAvailability(drawId: string) {
    return this.http.get<SellerAvailability>(`/api/v1/tickets/availability/${drawId}`);
  }

  createTicket(request: CreateTicketRequest, idempotencyKey?: string) {
    const headers = new HttpHeaders().set(
      'Idempotency-Key',
      idempotencyKey ?? createIdempotencyKey(),
    );
    return this.http.post<Ticket>('/api/v1/tickets', request, { headers });
  }

  updateTicket(ticketId: string, request: CreateTicketRequest, idempotencyKey?: string) {
    const headers = new HttpHeaders().set(
      'Idempotency-Key',
      idempotencyKey ?? createIdempotencyKey(),
    );
    return this.http.put<Ticket>(`/api/v1/tickets/${ticketId}`, request, { headers });
  }

  deleteTicket(ticketId: string, reason: string) {
    const params = new HttpParams().set('reason', reason);
    return this.http.delete<void>(`/api/v1/tickets/${ticketId}`, { params });
  }

  getUsers(page = 0, size = 20, search = '') {
    let params = new HttpParams().set('page', page).set('size', size);
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<PageResponse<ManagedUser>>('/api/v1/users', { params });
  }

  createUser(request: CreateUserRequest) {
    return this.http.post<ManagedUser>('/api/v1/users', request);
  }

  deleteUser(userId: string) {
    return this.http.delete<void>(`/api/v1/users/${userId}`);
  }

  updateUserEnabled(userId: string, enabled: boolean) {
    return this.http.put<ManagedUser>(`/api/v1/users/${userId}/enabled`, { enabled });
  }

  updateUserSessions(userId: string, maxSessions: number) {
    return this.http.put<ManagedUser>(`/api/v1/users/${userId}/sessions`, { maxSessions });
  }

  updateUserCommission(userId: string, request: UpdateCommissionRequest) {
    return this.http.put<CommissionUpdate>(`/api/v1/users/${userId}/commission`, request);
  }

  resetUserPassword(userId: string, newPassword: string, mustChangePassword: boolean) {
    return this.http.put<void>(`/api/v1/users/${userId}/password`, {
      newPassword,
      mustChangePassword,
    });
  }

  changeMyPassword(currentPassword: string, newPassword: string) {
    return this.http.put<void>('/api/v1/users/me/password', { currentPassword, newPassword });
  }

  getUser(userId: string) {
    return this.http.get<ManagedUser>(`/api/v1/users/${userId}`);
  }

  getSellerNumberLimits(userId: string) {
    return this.http.get<SellerNumberLimits>(`/api/v1/users/${userId}/number-limits`);
  }

  updateSellerNumberLimits(
    userId: string,
    drawType: string,
    request: SaveSellerNumberLimitsRequest,
  ) {
    return this.http.put<SellerNumberLimits>(
      `/api/v1/users/${userId}/number-limits/${drawType}`,
      request,
    );
  }

  inheritSellerNumberLimits(userId: string, drawType: string) {
    return this.http.delete<SellerNumberLimits>(
      `/api/v1/users/${userId}/number-limits/${drawType}`,
    );
  }

  getUserAssignments(userId: string) {
    return this.http.get<UserAssignments>(`/api/v1/users/${userId}/assignments`);
  }

  updateUserAssignments(userId: string, request: Pick<UserAssignments, 'routeId' | 'routeIds'>) {
    return this.http.put<UserAssignments>(`/api/v1/users/${userId}/assignments`, request);
  }

  updateUserRole(userId: string, request: UpdateUserRoleRequest) {
    return this.http.put<UserAssignments>(`/api/v1/users/${userId}/role`, request);
  }

  registerWinningNumber(drawId: string, number: string) {
    return this.http.post<DrawClosure>(`/api/v1/settlements/draws/${drawId}/result`, { number });
  }

  registerBusinessResult(
    drawId: string,
    winningNumber: string,
    mountings: ExternalMountingInput[],
    externalPrizeReceived: number,
  ) {
    return this.http.post<BusinessSettlement>(`/api/v1/admin/finance/draws/${drawId}/result`, {
      winningNumber,
      mountings,
      externalPrizeReceived,
    });
  }

  getBusinessFinanceSummary(
    from: string,
    to: string,
    includeCommissions = true,
    includeMovements = true,
    includeProvisional = true,
  ) {
    const params = new HttpParams()
      .set('from', from)
      .set('to', to)
      .set('includeCommissions', includeCommissions)
      .set('includeMovements', includeMovements)
      .set('includeProvisional', includeProvisional);
    return this.http.get<BusinessFinanceSummary>('/api/v1/admin/finance/summary', { params });
  }

  getBusinessFinanceDetails(from: string, to: string) {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<BusinessFinanceDetails>('/api/v1/admin/finance/details', { params });
  }

  getDrawBusinessSummary(drawId: string) {
    return this.http.get<BusinessSettlement>(`/api/v1/admin/finance/draws/${drawId}`);
  }

  getBusinessExpenses(date: string, includeDeleted = true) {
    const params = new HttpParams().set('date', date).set('includeDeleted', includeDeleted);
    return this.http.get<BusinessExpense[]>('/api/v1/admin/finance/expenses', { params });
  }

  createBusinessExpenses(date: string, expenses: ExpenseInput[]) {
    return this.http.post<BusinessExpense[]>('/api/v1/admin/finance/expenses/batches', {
      date,
      expenses,
    });
  }

  updateBusinessExpense(expenseId: string, date: string, expense: ExpenseInput) {
    return this.http.put<BusinessExpense>(`/api/v1/admin/finance/expenses/${expenseId}`, {
      date,
      expense,
    });
  }

  deleteBusinessExpense(expenseId: string) {
    return this.http.delete<void>(`/api/v1/admin/finance/expenses/${expenseId}`);
  }

  getBusinessMovements(date: string, includeDeleted = true) {
    const params = new HttpParams().set('date', date).set('includeDeleted', includeDeleted);
    return this.http.get<BusinessMovement[]>('/api/v1/admin/finance/movements', { params });
  }

  createBusinessMovements(date: string, movements: BusinessMovementInput[]) {
    return this.http.post<BusinessMovement[]>('/api/v1/admin/finance/movements/batches', {
      date,
      movements,
    });
  }

  updateBusinessMovement(movementId: string, date: string, movement: BusinessMovementInput) {
    return this.http.put<BusinessMovement>(`/api/v1/admin/finance/movements/${movementId}`, {
      date,
      movement,
    });
  }

  deleteBusinessMovement(movementId: string) {
    return this.http.delete<void>(`/api/v1/admin/finance/movements/${movementId}`);
  }

  getDrawClosure(drawId: string) {
    return this.http.get<DrawClosure>(`/api/v1/settlements/draws/${drawId}`);
  }

  getDailyReports(from?: string, to?: string, sellerId?: string) {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    if (sellerId) params = params.set('sellerId', sellerId);
    return this.http.get<DailyReport[]>('/api/v1/reports/days', { params });
  }

  getDrawReports(date: string, sellerId?: string) {
    let params = new HttpParams().set('date', date);
    if (sellerId) params = params.set('sellerId', sellerId);
    return this.http.get<DrawReport[]>('/api/v1/reports/draws', { params });
  }

  getDrawNumberReport(drawId: string, sellerId?: string, routeId?: string) {
    let params = new HttpParams();
    if (sellerId) params = params.set('sellerId', sellerId);
    if (routeId) params = params.set('routeId', routeId);
    return this.http.get<DrawNumberReport>(`/api/v1/reports/draws/${drawId}/numbers`, { params });
  }

  getMountingReport(drawId: string, assumedPayout: number) {
    const params = new HttpParams().set('assumedPayout', assumedPayout);
    return this.http.get<MountingReport>(`/api/v1/reports/draws/${drawId}/mounting`, {
      params,
    });
  }

  getDrawSettlementReport(drawId: string, sellerId?: string) {
    const params = sellerId ? new HttpParams().set('sellerId', sellerId) : undefined;
    return this.http.get<DrawSettlementReport>(`/api/v1/reports/draws/${drawId}/settlement`, {
      params,
    });
  }

  getWinnerReports(page = 0, size = 20, from?: string, to?: string) {
    let params = new HttpParams().set('page', page).set('size', size);
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<PageResponse<WinnerDrawSummary>>('/api/v1/reports/winners', { params });
  }

  getSellerCommissionReport(sellerId: string, from: string, to: string) {
    const params = new HttpParams().set('sellerId', sellerId).set('from', from).set('to', to);
    return this.http.get<SellerCommissionReport>('/api/v1/reports/commissions', { params });
  }

  getCommissionPayroll(from: string, to: string) {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<CommissionPayroll>('/api/v1/reports/commissions/payroll', { params });
  }

  getFollowUpSheet(date: string, routeId: string) {
    const params = new HttpParams().set('date', date).set('routeId', routeId);
    return this.http.get<FollowUpSheet>('/api/v1/reports/follow-up', { params });
  }

  getRoutes() {
    return this.http.get<RouteSummary[]>('/api/v1/routes');
  }

  getManagedRoutes(page = 0, size = 20, search = '') {
    let params = new HttpParams().set('page', page).set('size', size);
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<PageResponse<ManagedRoute>>('/api/v1/routes/manage', { params });
  }

  createRoute(request: { code: string; name: string }) {
    return this.http.post<RouteSummary>('/api/v1/routes', request);
  }

  updateRoute(id: string, request: { code: string; name: string }) {
    return this.http.put<RouteSummary>(`/api/v1/routes/${id}`, request);
  }

  deactivateRoute(id: string) {
    return this.http.delete<void>(`/api/v1/routes/${id}`);
  }

  restoreRoute(id: string) {
    return this.http.post<void>(`/api/v1/routes/${id}/restore`, null);
  }

  getRouteNumberLimits(routeId: string) {
    return this.http.get<RouteNumberLimits>(`/api/v1/routes/${routeId}/number-limits`);
  }

  updateRouteNumberLimits(
    routeId: string,
    drawType: string,
    request: SaveRouteNumberLimitsRequest,
  ) {
    return this.http.put<RouteNumberLimits>(
      `/api/v1/routes/${routeId}/number-limits/${drawType}`,
      request,
    );
  }

  inheritRouteNumberLimits(routeId: string, drawType: string) {
    return this.http.delete<RouteNumberLimits>(
      `/api/v1/routes/${routeId}/number-limits/${drawType}`,
    );
  }

  assignSupervisor(routeId: string, supervisorId: string) {
    return this.http.post<void>(`/api/v1/routes/${routeId}/supervisors/${supervisorId}`, null);
  }

  getSystemSettings() {
    return this.http.get<SystemSalesSettings>('/api/v1/system-settings');
  }

  getSystemNumberLimits() {
    return this.http.get<SystemNumberLimits>('/api/v1/system-number-limits');
  }

  updateSystemNumberLimits(drawType: string, request: SaveSystemNumberLimitsRequest) {
    return this.http.put<SystemNumberLimits>(`/api/v1/system-number-limits/${drawType}`, request);
  }

  getNumberControl(number: string, drawType: string) {
    return this.http.get<NumberControl>(`/api/v1/number-controls/${number}/${drawType}`);
  }

  updateNumberControl(number: string, drawType: string, request: SaveNumberControlRequest) {
    return this.http.put<NumberControl>(`/api/v1/number-controls/${number}/${drawType}`, request);
  }

  updateSystemSettings(request: UpdateSystemSalesSettingsRequest) {
    return this.http.put<SystemSalesSettings>('/api/v1/system-settings', request);
  }
}
