import type { UserRole } from '../constants/domain.constants';

// ----- Database row -----
export interface UserRow {
  user_id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
  modified_at: Date;
}

// ----- JWT payload (embedded in signed token) -----
export interface JwtPayload {
  sub: string;      // user_id
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// ----- Augmented request user (decoded from JWT) -----
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
}

// ----- Request / Response DTOs -----
export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface LoginResponseDto {
  token: string;
  user: {
    user_id: string;
    email: string;
    full_name: string;
    role: UserRole;
  };
}
