import type {
  KycStatus,
  CustomerSegment,
  AccountType,
  AccountStatus,
  RiskLevel,
  LiquidityNeed,
} from '../constants/domain.constants';

// ----- Database rows -----
export interface CustomerRow {
  customer_id: string;
  full_name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  date_of_birth: Date;
  onboarded_at: Date;
  kyc_status: KycStatus;
  segment: CustomerSegment;
  is_active: boolean;
  created_at: Date;
  modified_at: Date;
}

export interface RiskProfileRow {
  customer_id: string;
  risk_score: number;
  risk_level: RiskLevel;
  assessed_at: Date;
  horizon_years: number;
  liquidity_need: LiquidityNeed;
  is_active: boolean;
  created_at: Date;
  modified_at: Date;
}

export interface AccountRow {
  account_id: string;
  customer_id: string;
  account_type: AccountType;
  provider: string;
  opened_at: Date;
  status: AccountStatus;
  base_currency: string;
  is_active: boolean;
  created_at: Date;
  modified_at: Date;
}

// ----- Query params for GET /customers -----
export interface CustomerListQuery {
  search?: string;
  city?: string;
  kyc_status?: KycStatus;
  segment?: CustomerSegment;
  page?: number;
  limit?: number;
}

// ----- Response DTOs -----
export interface CustomerSummaryDto {
  customer_id: string;
  full_name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  kyc_status: KycStatus;
  segment: CustomerSegment;
  total_market_value: number;
}

export interface CustomerDetailDto {
  customer_id: string;
  full_name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  date_of_birth: string;
  onboarded_at: string;
  kyc_status: KycStatus;
  segment: CustomerSegment;
  risk_profile: RiskProfileDto | null;
  accounts: AccountDto[];
}

export interface RiskProfileDto {
  risk_score: number;
  risk_level: RiskLevel;
  assessed_at: string;
  horizon_years: number;
  liquidity_need: LiquidityNeed;
}

export interface AccountDto {
  account_id: string;
  account_type: AccountType;
  provider: string;
  opened_at: string;
  status: AccountStatus;
  base_currency: string;
}
