export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'SELLER';

export interface AuthenticatedUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  routeId: string | null;
  mustChangePassword: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
  deviceName: string;
  replaceExistingSession?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string;
  user: AuthenticatedUser;
}
