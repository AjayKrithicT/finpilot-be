import type { PoolClient } from 'pg';
import pool from '../config/db';
import type { ValidatedTxRow, ImportRejectionItemDto } from '../types/import.types';
import { CSV_IMPORT } from '../constants/domain.constants';

// ---------------------------------------------------------------------------
// Checksum deduplication
// ---------------------------------------------------------------------------
export async function findBatchByChecksum(
  entityType: string,
  checksum: string,
): Promise<{ batch_id: string } | undefined> {
  const result = await pool.query<{ batch_id: string }>(
    `SELECT batch_id
       FROM import_batches
      WHERE entity_type = $1
        AND file_checksum = $2
        AND is_active = TRUE
      LIMIT 1`,
    [entityType, checksum],
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// FK existence lookups — used during in-memory validation
// ---------------------------------------------------------------------------
export async function findExistingAccountIds(
  accountIds: string[],
): Promise<Set<string>> {
  if (accountIds.length === 0) return new Set();
  const result = await pool.query<{ account_id: string }>(
    `SELECT account_id
       FROM accounts
      WHERE account_id = ANY($1::VARCHAR[])
        AND is_active = TRUE`,
    [accountIds],
  );
  return new Set(result.rows.map((r) => r.account_id));
}

export async function findExistingInstrumentIds(
  instrumentIds: string[],
): Promise<Set<string>> {
  if (instrumentIds.length === 0) return new Set();
  const result = await pool.query<{ instrument_id: string }>(
    `SELECT instrument_id
       FROM instruments
      WHERE instrument_id = ANY($1::VARCHAR[])
        AND is_active = TRUE`,
    [instrumentIds],
  );
  return new Set(result.rows.map((r) => r.instrument_id));
}

export async function findExistingTransactionIds(
  transactionIds: string[],
): Promise<Set<string>> {
  if (transactionIds.length === 0) return new Set();
  const result = await pool.query<{ transaction_id: string }>(
    `SELECT transaction_id
       FROM transactions
      WHERE transaction_id = ANY($1::VARCHAR[])`,
    [transactionIds],
  );
  return new Set(result.rows.map((r) => r.transaction_id));
}

// ---------------------------------------------------------------------------
// Atomic batch persistence — all writes inside a single BEGIN…COMMIT
// ---------------------------------------------------------------------------
export interface InsertBatchParams {
  fileName: string;
  fileChecksum: string;
  totalRows: number;
  importedRows: number;
  rejectedRows: number;
  status: 'COMPLETED' | 'FAILED';
  userId: string;
}

export async function persistImportBatch(
  params: InsertBatchParams,
  validRows: ValidatedTxRow[],
  rejections: ImportRejectionItemDto[],
): Promise<string> {
  const client: PoolClient = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Insert import_batches row
    const batchResult = await client.query<{ batch_id: string }>(
      `INSERT INTO import_batches
         (entity_type, file_name, file_checksum, total_rows, imported_rows,
          rejected_rows, status, created_by, modified_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING batch_id`,
      [
        CSV_IMPORT.ENTITY_TYPE_TRANSACTIONS,
        params.fileName,
        params.fileChecksum,
        params.totalRows,
        params.importedRows,
        params.rejectedRows,
        params.status,
        params.userId,
      ],
    );
    const batchId = batchResult.rows[0]?.batch_id;
    if (!batchId) throw new Error('Failed to insert import_batches row');

    // 2. Insert valid transactions
    for (const row of validRows) {
      await client.query(
        `INSERT INTO transactions
           (transaction_id, account_id, instrument_id, transaction_type,
            trade_date, quantity, price, amount, status,
            import_batch_id, created_by, modified_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
        [
          row.transaction_id,
          row.account_id,
          row.instrument_id,
          row.transaction_type,
          row.trade_date,
          row.quantity,
          row.price,
          row.amount,
          row.status,
          batchId,
          params.userId,
        ],
      );
    }

    // 3. Insert rejection rows
    for (const rejection of rejections) {
      await client.query(
        `INSERT INTO import_rejections
           (batch_id, row_number, record_identifier, error_code, error_reason,
            raw_payload, created_by, modified_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [
          batchId,
          rejection.row_number,
          rejection.record_identifier,
          rejection.error_code,
          rejection.error_reason,
          JSON.stringify(rejection.raw_payload),
          params.userId,
        ],
      );
    }

    await client.query('COMMIT');
    return batchId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
