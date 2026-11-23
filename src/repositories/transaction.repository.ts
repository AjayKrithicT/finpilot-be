import pool from '../config/db';
import type { TransactionRow } from '../types/transaction.types';
import type { InstrumentRow } from '../types/transaction.types';
import type { TransactionListQuery } from '../types/transaction.types';
import {
  TRANSACTION_SORT_COLUMN_MAP,
  type TransactionSortKey,
} from '../constants/domain.constants';

// ---------------------------------------------------------------------------
// Internal helper — builds the shared WHERE clause + params array
// The caller is responsible for appending LIMIT / OFFSET params afterwards.
// ---------------------------------------------------------------------------
interface WhereResult {
  conditions: string[];
  params: unknown[];
}

function buildTransactionWhere(customerId: string, query: TransactionListQuery): WhereResult {
  const params: unknown[] = [customerId];
  const conditions: string[] = [
    // Scope to accounts owned by this customer
    `a.customer_id = $1`,
    `t.is_active = TRUE`,
    `a.is_active = TRUE`,
  ];

  if (query.account_id) {
    params.push(query.account_id);
    conditions.push(`t.account_id = $${params.length}`);
  }

  if (query.instrument_id) {
    params.push(query.instrument_id);
    conditions.push(`t.instrument_id = $${params.length}`);
  }

  if (query.transaction_type) {
    params.push(query.transaction_type);
    conditions.push(`t.transaction_type = $${params.length}`);
  }

  if (query.status) {
    params.push(query.status);
    conditions.push(`t.status = $${params.length}`);
  }

  if (query.from_date) {
    params.push(query.from_date);
    conditions.push(`t.trade_date >= $${params.length}`);
  }

  if (query.to_date) {
    params.push(query.to_date);
    conditions.push(`t.trade_date <= $${params.length}`);
  }

  return { conditions, params };
}

// ---------------------------------------------------------------------------
// Resolve sort column through the allowlist — never interpolate raw input
// ---------------------------------------------------------------------------
function resolveSortSql(sortBy?: TransactionSortKey, sortDir?: string): string {
  const col =
    sortBy && sortBy in TRANSACTION_SORT_COLUMN_MAP
      ? TRANSACTION_SORT_COLUMN_MAP[sortBy]
      : TRANSACTION_SORT_COLUMN_MAP['trade_date'];

  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';
  return `${col} ${dir}`;
}

// ---------------------------------------------------------------------------
// Paginated transaction list
// ---------------------------------------------------------------------------
export async function findTransactionsByCustomerId(
  customerId: string,
  query: TransactionListQuery,
): Promise<TransactionRow[]> {
  const { conditions, params } = buildTransactionWhere(customerId, query);

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const offset = (page - 1) * limit;

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const orderBy = resolveSortSql(query.sort_by, query.sort_dir);
  const whereClause = conditions.join(' AND ');

  const sql = `
    SELECT
      t.transaction_id,
      t.account_id,
      t.instrument_id,
      i.symbol,
      i.instrument_name,
      t.transaction_type,
      t.trade_date,
      t.quantity,
      t.price,
      t.amount,
      t.status,
      t.import_batch_id,
      t.is_active,
      t.created_at,
      t.modified_at
    FROM transactions t
    JOIN accounts a ON a.account_id = t.account_id
    JOIN instruments i ON i.instrument_id = t.instrument_id
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  const result = await pool.query<TransactionRow>(sql, params);
  return result.rows;
}

// ---------------------------------------------------------------------------
// Count query — same predicates, no pagination
// ---------------------------------------------------------------------------
export async function countTransactionsByCustomerId(
  customerId: string,
  query: TransactionListQuery,
): Promise<number> {
  const { conditions, params } = buildTransactionWhere(customerId, query);
  const whereClause = conditions.join(' AND ');

  const sql = `
    SELECT COUNT(*) AS total
    FROM transactions t
    JOIN accounts a ON a.account_id = t.account_id
    JOIN instruments i ON i.instrument_id = t.instrument_id
    WHERE ${whereClause}
  `;

  const result = await pool.query<{ total: string }>(sql, params);
  return parseInt(result.rows[0]?.total ?? '0', 10);
}

// ---------------------------------------------------------------------------
// Active instruments for filter dropdowns
// ---------------------------------------------------------------------------
export async function findActiveInstruments(): Promise<InstrumentRow[]> {
  const result = await pool.query<InstrumentRow>(
    `SELECT instrument_id, symbol, instrument_name, asset_class,
            last_price, price_as_of, is_active
       FROM instruments
      WHERE is_active = TRUE
      ORDER BY symbol ASC`,
  );
  return result.rows;
}
