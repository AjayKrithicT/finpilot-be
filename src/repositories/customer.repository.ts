import pool from '../config/db';
import type { CustomerRow, RiskProfileRow, AccountRow } from '../types/customer.types';
import type { CustomerListQuery } from '../types/customer.types';

// ---------------------------------------------------------------------------
// Row type for the joined customer + portfolio summary query
// ---------------------------------------------------------------------------
export interface CustomerSummaryRow extends CustomerRow {
  total_market_value: string; // NUMERIC from pg — cast with Number() in service
}

// ---------------------------------------------------------------------------
// Paginated customer search joined with v_customer_portfolio_summary
// ---------------------------------------------------------------------------
export async function searchCustomers(
  query: CustomerListQuery,
): Promise<CustomerSummaryRow[]> {
  const params: unknown[] = [];
  const conditions: string[] = ['c.is_active = TRUE'];

  if (query.search) {
    params.push(`%${query.search.toLowerCase()}%`);
    const p = `$${params.length}`;
    conditions.push(
      `(LOWER(c.customer_id) LIKE ${p} OR LOWER(c.full_name) LIKE ${p} OR LOWER(c.email) LIKE ${p} OR LOWER(c.city) LIKE ${p})`,
    );
  }

  if (query.city) {
    params.push(query.city);
    conditions.push(`LOWER(c.city) = LOWER($${params.length})`);
  }

  if (query.kyc_status) {
    params.push(query.kyc_status);
    conditions.push(`c.kyc_status = $${params.length}`);
  }

  if (query.segment) {
    params.push(query.segment);
    conditions.push(`c.segment = $${params.length}`);
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const offset = (page - 1) * limit;

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const whereClause = conditions.join(' AND ');

  const sql = `
    SELECT
      c.customer_id,
      c.full_name,
      c.email,
      c.phone,
      c.city,
      c.state,
      c.date_of_birth,
      c.onboarded_at,
      c.kyc_status,
      c.segment,
      c.is_active,
      c.created_at,
      c.modified_at,
      COALESCE(s.total_market_value, 0) AS total_market_value
    FROM customers c
    LEFT JOIN v_customer_portfolio_summary s ON s.customer_id = c.customer_id
    WHERE ${whereClause}
    ORDER BY c.full_name ASC
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  const result = await pool.query<CustomerSummaryRow>(sql, params);
  return result.rows;
}

// ---------------------------------------------------------------------------
// Count query — same predicates, no pagination
// ---------------------------------------------------------------------------
export async function countCustomers(query: CustomerListQuery): Promise<number> {
  const params: unknown[] = [];
  const conditions: string[] = ['c.is_active = TRUE'];

  if (query.search) {
    params.push(`%${query.search.toLowerCase()}%`);
    const p = `$${params.length}`;
    conditions.push(
      `(LOWER(c.customer_id) LIKE ${p} OR LOWER(c.full_name) LIKE ${p} OR LOWER(c.email) LIKE ${p} OR LOWER(c.city) LIKE ${p})`,
    );
  }

  if (query.city) {
    params.push(query.city);
    conditions.push(`LOWER(c.city) = LOWER($${params.length})`);
  }

  if (query.kyc_status) {
    params.push(query.kyc_status);
    conditions.push(`c.kyc_status = $${params.length}`);
  }

  if (query.segment) {
    params.push(query.segment);
    conditions.push(`c.segment = $${params.length}`);
  }

  const whereClause = conditions.join(' AND ');

  const sql = `
    SELECT COUNT(*) AS total
    FROM customers c
    WHERE ${whereClause}
  `;

  const result = await pool.query<{ total: string }>(sql, params);
  return parseInt(result.rows[0]?.total ?? '0', 10);
}

// ---------------------------------------------------------------------------
// Single active customer by ID
// ---------------------------------------------------------------------------
export async function findActiveCustomerById(customerId: string): Promise<CustomerRow | undefined> {
  const result = await pool.query<CustomerRow>(
    `SELECT customer_id, full_name, email, phone, city, state,
            date_of_birth, onboarded_at, kyc_status, segment,
            is_active, created_at, modified_at
       FROM customers
      WHERE customer_id = $1
        AND is_active = TRUE
      LIMIT 1`,
    [customerId],
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Risk profile for a customer
// ---------------------------------------------------------------------------
export async function findRiskProfileByCustomerId(
  customerId: string,
): Promise<RiskProfileRow | undefined> {
  const result = await pool.query<RiskProfileRow>(
    `SELECT customer_id, risk_score, risk_level, assessed_at,
            horizon_years, liquidity_need, is_active, created_at, modified_at
       FROM risk_profiles
      WHERE customer_id = $1
        AND is_active = TRUE
      LIMIT 1`,
    [customerId],
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Active accounts for a customer
// ---------------------------------------------------------------------------
export async function findAccountsByCustomerId(customerId: string): Promise<AccountRow[]> {
  const result = await pool.query<AccountRow>(
    `SELECT account_id, customer_id, account_type, provider,
            opened_at, status, base_currency, is_active, created_at, modified_at
       FROM accounts
      WHERE customer_id = $1
        AND is_active = TRUE
      ORDER BY opened_at ASC`,
    [customerId],
  );
  return result.rows;
}
