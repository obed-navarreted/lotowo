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
