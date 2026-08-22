import { UserRole } from './auth.models';

export interface ManagedUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  hiredOn: string | null;
  commissionRate: number;
  maxSessions: number;
  routeId: string | null;
  routeName: string | null;
  enabled: boolean;
  activeSalesDays: number;
  createdAt: string;
}

export interface CreateUserRequest {
  username: string;
  fullName: string;
  role: UserRole;
  hiredOn: string | null;
  commissionRate: number;
  maxSessions: number;
  routeId: string | null;
  routeIds: string[];
}

export interface UserAssignments {
  userId: string;
  role: UserRole;
  routeId: string | null;
  routeIds: string[];
}

export interface UpdateCommissionRequest {
  commissionRate: number;
  recalculateFrom: string | null;
  recalculateTo: string | null;
}

export interface CommissionUpdate {
  user: ManagedUser;
  previousCommissionRate: number;
  recalculatedClosures: number;
}

export interface UpdateUserRoleRequest {
  role: UserRole;
  routeId: string | null;
  routeIds: string[];
}

export interface RouteSummary {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
}

export interface ManagedRoute extends RouteSummary {
  sellerCount: number;
  supervisorCount: number;
  updatedAt: string;
}

export interface SystemNumberMultiplier {
  number: string;
  multiplier: number;
}

export interface SystemNumberLimit {
  number: string;
  limit: number;
}

export interface SystemSalesSettings {
  defaultPayoutMultiplier: number;
  payoutOverrides: SystemNumberMultiplier[];
  numberLimitsEnabled: boolean;
  defaultPayoutLimit: number | null;
  limitOverrides: SystemNumberLimit[];
  excludedSellerIds: string[];
  maxTicketPrints: number;
  updatedAt: string;
}

export type UpdateSystemSalesSettingsRequest = Omit<SystemSalesSettings, 'updatedAt'>;

export interface NationalSequence {
  lastSequence: number | null;
  nextSequence: number | null;
}

export interface CreateNationalDrawRequest {
  name: string;
  nationalSequence: number;
  scheduledAt: string;
  salesCloseAt: string;
}

export type LimitDrawType = 'DAILY' | 'NATIONAL_LOTTERY';

export interface NumberLimitOverride {
  number: string;
  limit: number;
}

export interface NumberLimitPolicy {
  drawType: LimitDrawType;
  configured: boolean;
  enabled: boolean;
  source: 'SELLER' | 'ROUTE' | 'SYSTEM' | 'NONE';
  defaultLimit: number | null;
  overrides: NumberLimitOverride[];
  inheritedFromRoute?: boolean;
  sourceRouteName?: string | null;
}

export interface SellerNumberLimits {
  sellerId: string;
  policies: NumberLimitPolicy[];
}

export interface SaveSellerNumberLimitsRequest {
  enabled: boolean;
  defaultLimit: number | null;
  overrides: NumberLimitOverride[];
}

export interface SystemNumberLimitPolicy {
  drawType: LimitDrawType;
  enabled: boolean;
  defaultLimit: number | null;
  overrides: NumberLimitOverride[];
  excludedSellerIds: string[];
}

export interface SystemNumberLimits {
  policies: SystemNumberLimitPolicy[];
}

export interface SaveSystemNumberLimitsRequest extends SaveSellerNumberLimitsRequest {
  excludedSellerIds: string[];
}

export interface RouteLimitSeller {
  id: string;
  username: string;
  fullName: string;
  enabled: boolean;
}

export interface RouteNumberLimitPolicy {
  drawType: LimitDrawType;
  configured: boolean;
  enabled: boolean;
  defaultLimit: number | null;
  overrides: NumberLimitOverride[];
  appliesToAll: boolean;
  sellerIds: string[];
}

export interface RouteNumberLimits {
  routeId: string;
  routeCode: string;
  routeName: string;
  sellers: RouteLimitSeller[];
  policies: RouteNumberLimitPolicy[];
}

export interface SaveRouteNumberLimitsRequest extends SaveSellerNumberLimitsRequest {
  appliesToAll: boolean;
  sellerIds: string[];
}

export interface NumberControlRoute {
  id: string;
  code: string;
  name: string;
  blocked: boolean;
}

export interface NumberControlSeller {
  id: string;
  username: string;
  fullName: string;
  enabled: boolean;
  routeId: string | null;
  routeName: string | null;
  source: 'SELLER' | 'ROUTE' | 'SYSTEM' | 'NONE';
  limit: number | null;
}

export interface NumberControl {
  number: string;
  drawType: LimitDrawType;
  globalBlocked: boolean;
  routes: NumberControlRoute[];
  sellers: NumberControlSeller[];
}

export interface SaveNumberControlRequest {
  globalBlocked: boolean;
  blockedRouteIds: string[];
  sellerLimits: { sellerId: string; limit: number }[];
}
