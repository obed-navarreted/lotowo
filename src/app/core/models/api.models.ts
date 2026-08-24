export interface ApiProblem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  errors?: Record<string, string>;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface Draw {
  id: string;
  drawType: 'DAILY' | 'NATIONAL_LOTTERY';
  name: string;
  nationalSequence: number | null;
  scheduledAt: string;
  salesCloseAt: string;
  status: 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'RESULT_ENTERED' | 'SETTLED' | 'CANCELLED';
  salesEnabled: boolean;
  salesBlockedAt: string | null;
  winningNumber: string | null;
  resultRegisteredAt: string | null;
  settledAt: string | null;
  version: number;
  createdAt: string;
}

export interface UserNotification {
  id: string;
  type: 'DRAW_CLOSING' | 'WINNER_PENDING' | 'NUMBER_EXPOSURE';
  title: string;
  message: string;
  route: string;
  drawId: string | null;
  createdAt: string;
  read: boolean;
}

export interface NotificationSettings {
  numberExposureEnabled: boolean;
  numberExposureThreshold: number;
  updatedAt: string;
}

export interface PushConfiguration {
  enabled: boolean;
  publicKey: string | null;
  androidEnabled: boolean;
}

export interface AndroidPushTokenPayload {
  token: string;
  deviceName: string;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface TicketItem {
  id: string;
  number: string;
  stake: number;
  payoutMultiplier: number;
  potentialPayout: number;
}

export interface Ticket {
  id: string;
  receiptNumber: number;
  rootTicketId: string;
  previousTicketId: string | null;
  sellerId: string;
  sellerName: string;
  routeId: string;
  routeCode: string;
  routeName: string;
  drawId: string;
  drawType: 'DAILY' | 'NATIONAL_LOTTERY';
  drawName: string;
  drawScheduledAt: string;
  salesCloseAt: string;
  winningNumber: string | null;
  customerName?: string | null;
  revision: number;
  status: 'ACTIVE' | 'REPLACED' | 'DELETED';
  totalAmount: number;
  totalPotentialPayout: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
  deletedByName: string | null;
  deletionReason: string | null;
  printCount: number;
  lastPrintedAt: string | null;
  items: TicketItem[];
}

export interface TicketPrint {
  id: string;
  ticketId: string;
  rootTicketId: string;
  printNumber: number;
  printType: 'PRINT' | 'REPRINT';
  printedBy: string;
  printedByName: string;
  printedAt: string;
}

export interface SellerAvailability {
  sellerId: string;
  drawId: string;
  totalSold: number;
  numbers: NumberAvailability[];
  calculatedAt: string;
}

export interface NumberAvailability {
  number: string;
  payoutLimit: number | null;
  currentPotentialPayout: number;
  remainingPotentialPayout: number | null;
}

export interface CreateTicketRequest {
  drawId: string;
  customerName?: string | null;
  items: Array<{ number: string; stake: number }>;
}

export interface TicketFilters {
  drawId?: string;
  sellerId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
}

export interface NumberExposure {
  number: string;
  salesAmount: number;
  potentialPayout: number;
}

export interface TicketDaySummary {
  date: string;
  ticketCount: number;
  grossSales: number;
  prizesPaid: number;
  netResult: number;
  pendingResults: number;
}

export interface UtilitySummary {
  from: string;
  to: string;
  ticketCount: number;
  grossSales: number;
  prizesPaid: number;
  commissionAmount: number;
  /** Resultado antes de comisión; se conserva para clientes anteriores. */
  netResult: number;
  netAfterCommission: number;
  pendingResults: number;
  commissionProvisional: boolean;
  sellers: UtilitySellerSummary[];
}

export interface UtilitySellerSummary {
  sellerId: string;
  sellerName: string;
  routeId?: string | null;
  routeCode?: string | null;
  routeName?: string | null;
  ticketCount: number;
  grossSales: number;
  prizesPaid: number;
  commissionAmount: number;
  netBeforeCommission: number;
  netAfterCommission: number;
  pendingResults: number;
  commissionProvisional: boolean;
  entries: UtilityDrawSummary[];
}

export interface UtilityDrawSummary {
  drawId: string;
  drawType: Draw['drawType'];
  scheduledAt: string;
  winningNumber: string | null;
  ticketCount: number;
  grossSales: number;
  prizesPaid: number;
  commissionRate: number;
  commissionAmount: number;
  netBeforeCommission: number;
  netAfterCommission: number;
  pendingResult: boolean;
  commissionProvisional: boolean;
}

export interface DrawClosure {
  id: string;
  drawId: string;
  drawName: string;
  winningNumber: string;
  grossSales: number;
  winningStakes: number;
  prizesDue: number;
  netResult: number;
  createdAt: string;
}

export interface ExternalMountingInput {
  number: string;
  stakeAmount: number;
  payoutMultiplier: number;
}

export interface BusinessSettlement {
  drawId: string;
  winningNumber: string;
  grossSales: number;
  localPrizes: number;
  commissions: number;
  externalStake: number;
  externalPrize: number;
  businessResult: number;
}

export interface BusinessFinanceSummary {
  from: string;
  to: string;
  grossSales: number;
  localPrizes: number;
  commissions: number;
  resultAfterCommission: number;
  externalStake: number;
  externalPrizes: number;
  expenses: number;
  extraIncome: number;
  routeId?: string | null;
  movementAllocation?: MovementAllocation;
  movementAllocationRate?: number;
  businessResult: number;
}

export type MovementAllocation = 'PROPORTIONAL' | 'FULL';

export interface BusinessMountingItem {
  number: string;
  stakeAmount: number;
  payoutMultiplier: number | null;
  potentialExternalPayout: number | null;
}

export interface BusinessMountingDetail {
  id: string;
  drawId: string;
  drawName: string;
  drawType: Draw['drawType'];
  scheduledAt: string;
  winningNumber: string | null;
  totalStake: number;
  externalPrize: number;
  source: 'POLICY' | 'MANUAL_LATE';
  registeredAt: string;
  registeredByName: string | null;
  items: BusinessMountingItem[];
}

export interface BusinessFinanceDetails {
  from: string;
  to: string;
  mountings: BusinessMountingDetail[];
  movements: BusinessMovement[];
}

export type BusinessMovementType = 'EXPENSE' | 'INCOME';

export interface BusinessMovementInput {
  type: BusinessMovementType;
  amount: number;
  description: string;
  userId: string | null;
}

export interface BusinessMovement {
  id: string;
  date: string;
  type: BusinessMovementType;
  amount: number;
  description: string;
  userId: string | null;
  userName: string | null;
  active: boolean;
  createdAt: string;
  createdBy: string;
  deletedAt: string | null;
  deletedBy: string | null;
  deletedByName: string | null;
}

export interface ExpenseInput {
  amount: number;
  description: string;
  userId: string | null;
}

export interface BusinessExpense {
  id: string;
  date: string;
  amount: number;
  description: string;
  userId: string | null;
  userName: string | null;
  active: boolean;
  createdAt: string;
  createdBy: string;
  deletedAt: string | null;
  deletedBy: string | null;
  deletedByName: string | null;
}

export interface DailyReport {
  date: string;
  drawCount: number;
  ticketCount: number;
  grossSales: number;
  prizesPaid: number;
  netResult: number;
  pendingResults: number;
}

export interface DrawReport {
  drawId: string;
  drawType: 'DAILY' | 'NATIONAL_LOTTERY';
  scheduledAt: string;
  winningNumber: string | null;
  status: Draw['status'];
  ticketCount: number;
  grossSales: number;
  prizesPaid: number;
  netResult: number;
}

export interface NumberReport {
  number: string;
  ticketCount: number;
  salesAmount: number;
  potentialPayout: number;
  prizesPaid: number;
}

export interface DrawNumberReport extends DrawReport {
  numbers: NumberReport[];
}

export interface ReportSellerOption {
  id: string;
  fullName: string;
  routeId: string;
  routeCode: string;
  routeName: string;
}

export interface MountingItem {
  number: string;
  potentialPayout: number;
  excessPayout: number;
  stakeToRequest: number;
  resultIfWinner: number;
}

export type MountingMode = 'FREE' | 'ZERO_LOSS_WITH_COST' | 'ZERO_LOSS_WITHOUT_COST' | 'STRATEGY';

export interface MountingStrategyOptions {
  targetLoss: number;
  expenseReserve: number;
  budgetPercent: number;
  maxNumbers: number;
}

export interface MountingReport {
  drawId: string;
  drawType: Draw['drawType'];
  scheduledAt: string;
  mode: MountingMode;
  grossSales: number;
  assumedPayout: number | null;
  externalMultiplier: number;
  totalStakeToRequest: number;
  minimumResultAfterMounting: number;
  generatedAt: string;
  estimatedCommission?: number | null;
  expenseReserve?: number | null;
  netAvailable?: number | null;
  targetLoss?: number | null;
  budgetPercent?: number | null;
  mountingBudget?: number | null;
  maxNumbers?: number | null;
  strategyCandidateCount?: number | null;
  targetAchieved?: boolean | null;
  calculationSnapshotAt?: string | null;
  retrospectiveSalesCloseAt?: string | null;
  winningNumber?: string | null;
  winningStake?: number | null;
  externalPrize?: number | null;
  retrospectiveGrossSales?: number | null;
  retrospectiveCommission?: number | null;
  retrospectiveResult?: number | null;
  items: MountingItem[];
}

export interface SellerSettlement {
  sellerId: string;
  sellerName: string;
  routeId: string;
  routeName: string;
  ticketCount: number;
  winningTicketCount: number;
  grossSales: number;
  winningStakes: number;
  prizesDue: number;
  netResult: number;
  commissionRate: number;
  commissionAccrued: number;
}

export interface WinningTicket {
  ticketId: string;
  receiptNumber: number;
  revision: number;
  sellerId: string;
  sellerName: string;
  routeId: string;
  routeName: string;
  customerName?: string | null;
  totalAmount: number;
  winningStake: number;
  prizeDue: number;
  createdAt: string;
}

export interface DrawSettlementReport {
  drawId: string;
  drawType: Draw['drawType'];
  scheduledAt: string;
  winningNumber: string;
  status: Draw['status'];
  ticketCount: number;
  winningTicketCount: number;
  grossSales: number;
  winningStakes: number;
  prizesDue: number;
  netResult: number;
  sellers: SellerSettlement[];
  winningTickets: WinningTicket[];
}

export interface WinnerDrawSummary {
  drawId: string;
  drawType: Draw['drawType'];
  scheduledAt: string;
  winningNumber: string;
  ticketCount: number;
  winningTicketCount: number;
  grossSales: number;
  prizesDue: number;
  netResult: number;
}

export interface SellerCommissionEntry {
  drawId: string;
  drawType: Draw['drawType'];
  scheduledAt: string;
  winningNumber: string;
  grossSales: number;
  prizesDue: number;
  commissionRate: number;
  commissionAmount: number;
  netBeforeCommission: number;
  netAfterCommission: number;
}

export interface SellerCommissionReport {
  sellerId: string;
  sellerName: string;
  from: string;
  to: string;
  grossSales: number;
  prizesDue: number;
  commissionAmount: number;
  netBeforeCommission: number;
  netAfterCommission: number;
  entries: SellerCommissionEntry[];
}

export interface CommissionPayroll {
  from: string;
  to: string;
  grossSales: number;
  prizesDue: number;
  commissionAmount: number;
  netBeforeCommission: number;
  netAfterCommission: number;
  sellers: SellerCommissionReport[];
}

export interface FollowUpSeller {
  id: string;
  fullName: string;
}

export interface FollowUpSheet {
  date: string;
  routeId: string;
  routeCode: string;
  routeName: string;
  sellers: FollowUpSeller[];
}
