import {
  searchCustomers,
  countCustomers,
  findActiveCustomerById,
  findRiskProfileByCustomerId,
  findAccountsByCustomerId,
} from '../repositories/customer.repository';
import { AppError } from '../utils/AppError';
import { HTTP_STATUS } from '../constants/http.constants';
import { ERROR_CODES } from '../constants/error.constants';
import type { CustomerListQuery } from '../types/customer.types';
import type {
  CustomerSummaryDto,
  CustomerDetailDto,
  RiskProfileDto,
  AccountDto,
} from '../types/customer.types';
import type { PaginatedResponse } from '../types/common.types';

export async function listCustomers(
  query: CustomerListQuery,
): Promise<PaginatedResponse<CustomerSummaryDto>> {
  const [rows, total] = await Promise.all([
    searchCustomers(query),
    countCustomers(query),
  ]);

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;

  const data: CustomerSummaryDto[] = rows.map((r) => ({
    customer_id: r.customer_id,
    full_name: r.full_name,
    email: r.email,
    phone: r.phone,
    city: r.city,
    state: r.state,
    kyc_status: r.kyc_status,
    segment: r.segment,
    total_market_value: Number(r.total_market_value),  // cast NUMERIC string
  }));

  return {
    data,
    pagination: {
      page,
      limit,
      total_items: total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

export async function getCustomerDetail(customerId: string): Promise<CustomerDetailDto> {
  const [customer, riskProfile, accounts] = await Promise.all([
    findActiveCustomerById(customerId),
    findRiskProfileByCustomerId(customerId),
    findAccountsByCustomerId(customerId),
  ]);

  if (!customer) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.CUSTOMER_NOT_FOUND,
      `Customer ${customerId} not found`,
    );
  }

  const riskProfileDto: RiskProfileDto | null = riskProfile
    ? {
        risk_score: riskProfile.risk_score,
        risk_level: riskProfile.risk_level,
        assessed_at: riskProfile.assessed_at instanceof Date
          ? riskProfile.assessed_at.toISOString().slice(0, 10)
          : String(riskProfile.assessed_at),
        horizon_years: riskProfile.horizon_years,
        liquidity_need: riskProfile.liquidity_need,
      }
    : null;

  const accountDtos: AccountDto[] = accounts.map((a) => ({
    account_id: a.account_id,
    account_type: a.account_type,
    provider: a.provider,
    opened_at: a.opened_at instanceof Date
      ? a.opened_at.toISOString().slice(0, 10)
      : String(a.opened_at),
    status: a.status,
    base_currency: a.base_currency,
  }));

  return {
    customer_id: customer.customer_id,
    full_name: customer.full_name,
    email: customer.email,
    phone: customer.phone,
    city: customer.city,
    state: customer.state,
    date_of_birth: customer.date_of_birth instanceof Date
      ? customer.date_of_birth.toISOString().slice(0, 10)
      : String(customer.date_of_birth),
    onboarded_at: customer.onboarded_at instanceof Date
      ? customer.onboarded_at.toISOString().slice(0, 10)
      : String(customer.onboarded_at),
    kyc_status: customer.kyc_status,
    segment: customer.segment,
    risk_profile: riskProfileDto,
    accounts: accountDtos,
  };
}
