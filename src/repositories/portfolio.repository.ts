import pool from '../config/db';
import type { PortfolioPositionRow } from '../types/portfolio.types';
import type { AccountRow } from '../types/customer.types';
import type { PaginationMeta } from '../types/common.types';
import type { AssetClass } from '../constants/domain.constants';

/**
 * Returns all position rows from v_customer_portfolio_positions for a given
 * customer.  The view already filters h.is_active, a.is_active, i.is_active.
 */
export async function findPortfolioPositionsByCustomerId(
  customerId: string,
): Promise<PortfolioPositionRow[]> {
  const result = await pool.query<PortfolioPositionRow>(
    `SELECT
       customer_id,
       account_id,
       account_type,
       provider,
       account_status,
       holding_id::TEXT AS holding_id,
       snapshot_date,
       instrument_id,
       symbol,
       instrument_name,
       asset_class,
       sector,
       exchange,
       risk_band,
       quantity,
       avg_cost,
       last_price,
       price_as_of,
       cost_basis,
       market_value,
       unrealised_gain_loss,
       unrealised_gain_loss_pct
     FROM v_customer_portfolio_positions
    WHERE customer_id = $1
    ORDER BY account_id ASC, asset_class ASC, symbol ASC`,
    [customerId],
  );
  return result.rows;
}

/**
 * Returns all active accounts for a customer — used to populate the account
 * cards even when the customer holds zero positions.
 */
export async function findActiveAccountsByCustomerId(customerId: string): Promise<AccountRow[]> {
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

// ---------------------------------------------------------------------------
// Paginated positions — used by GET /customers/:id/portfolio/positions
// ---------------------------------------------------------------------------

export interface FindPositionsPageParams {
  customerId: string;
  page: number;
  limit: number;
  search?: string;
  asset_class?: AssetClass;
}

export interface FindPositionsPageResult {
  rows: PortfolioPositionRow[];
  pagination: PaginationMeta;
}

export async function findPortfolioPositionsPage(
  params: FindPositionsPageParams,
): Promise<FindPositionsPageResult> {
  const { customerId, page, limit, search, asset_class } = params;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['customer_id = $1'];
  const values: unknown[] = [customerId];
  let idx = 2;

  if (search) {
    conditions.push(`(symbol ILIKE $${idx} OR instrument_name ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }

  if (asset_class) {
    conditions.push(`asset_class = $${idx}`);
    values.push(asset_class);
    idx++;
  }

  const where = conditions.join(' AND ');

  const countResult = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM v_customer_portfolio_positions WHERE ${where}`,
    values,
  );
  const totalItems = parseInt(countResult.rows[0]?.total ?? '0', 10);

  const dataResult = await pool.query<PortfolioPositionRow>(
    `SELECT
       customer_id, account_id, account_type, provider, account_status,
       holding_id::TEXT AS holding_id, snapshot_date, instrument_id,
       symbol, instrument_name, asset_class, sector, exchange, risk_band,
       quantity, avg_cost, last_price, price_as_of, cost_basis,
       market_value, unrealised_gain_loss, unrealised_gain_loss_pct
     FROM v_customer_portfolio_positions
    WHERE ${where}
    ORDER BY account_id ASC, asset_class ASC, symbol ASC
    LIMIT $${idx} OFFSET $${idx + 1}`,
    [...values, limit, offset],
  );

  return {
    rows: dataResult.rows,
    pagination: {
      page,
      limit,
      total_items: totalItems,
      total_pages: Math.ceil(totalItems / limit) || 1,
    },
  };
}
