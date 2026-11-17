import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';
import { AppError } from '../utils/AppError';
import { HTTP_STATUS } from '../constants/http.constants';
import { ERROR_CODES, IMPORT_REJECTION_CODES } from '../constants/error.constants';
import {
  CSV_IMPORT,
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
} from '../constants/domain.constants';
import {
  findBatchByChecksum,
  findExistingAccountIds,
  findExistingInstrumentIds,
  findExistingTransactionIds,
  persistImportBatch,
} from '../repositories/import.repository';
import type {
  RawCsvTxRow,
  ValidatedTxRow,
  ImportRejectionItemDto,
  ImportBatchResponseDto,
} from '../types/import.types';
import type { ImportRejectionCode } from '../constants/error.constants';

// ---------------------------------------------------------------------------
// SHA-256 checksum
// ---------------------------------------------------------------------------
function computeChecksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

// ---------------------------------------------------------------------------
// CSV header validation
// ---------------------------------------------------------------------------
function validateHeaders(headers: string[]): void {
  const required = CSV_IMPORT.REQUIRED_HEADERS as readonly string[];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new AppError(
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.INVALID_CSV_FORMAT,
      `Missing required CSV headers: ${missing.join(', ')}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function isFutureDate(value: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return value > today;
}

// ---------------------------------------------------------------------------
// In-memory row validation
// Returns [validRows, rejections]
// ---------------------------------------------------------------------------
async function validateRows(
  rawRows: RawCsvTxRow[],
): Promise<{ validRows: ValidatedTxRow[]; rejections: ImportRejectionItemDto[] }> {
  const validRows: ValidatedTxRow[] = [];
  const rejections: ImportRejectionItemDto[] = [];

  // Collect unique IDs/FKs for bulk DB lookups
  const allAccountIds = [...new Set(rawRows.map((r) => r.account_id).filter(Boolean))];
  const allInstrumentIds = [...new Set(rawRows.map((r) => r.instrument_id).filter(Boolean))];
  const allTransactionIds = rawRows.map((r) => r.transaction_id).filter(Boolean);

  const [existingAccountIds, existingInstrumentIds, existingTxIds] = await Promise.all([
    findExistingAccountIds(allAccountIds),
    findExistingInstrumentIds(allInstrumentIds),
    findExistingTransactionIds(allTransactionIds),
  ]);

  // Track transaction IDs seen within this CSV to catch intra-file duplicates
  const seenInFile = new Set<string>();

  function reject(
    rowIndex: number,
    row: RawCsvTxRow,
    code: ImportRejectionCode,
    reason: string,
  ): void {
    rejections.push({
      row_number: rowIndex + 1, // 1-based
      record_identifier: row.transaction_id ?? '',
      error_code: code,
      error_reason: reason,
      raw_payload: row,
    });
  }

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i] as RawCsvTxRow;
    const txId = row.transaction_id?.trim() ?? '';

    // --- 1. Duplicate transaction_id (intra-file or already in DB) ---
    if (!txId || seenInFile.has(txId) || existingTxIds.has(txId)) {
      reject(
        i,
        row,
        IMPORT_REJECTION_CODES.DUPLICATE_TRANSACTION_ID,
        `Duplicate transaction_id: "${txId}"`,
      );
      continue;
    }
    seenInFile.add(txId);

    // --- 2. Invalid account FK ---
    if (!existingAccountIds.has(row.account_id?.trim() ?? '')) {
      reject(
        i,
        row,
        IMPORT_REJECTION_CODES.INVALID_ACCOUNT_FK,
        `account_id "${row.account_id}" does not exist or is inactive`,
      );
      continue;
    }

    // --- 3. Invalid instrument FK ---
    if (!existingInstrumentIds.has(row.instrument_id?.trim() ?? '')) {
      reject(
        i,
        row,
        IMPORT_REJECTION_CODES.INVALID_INSTRUMENT_FK,
        `instrument_id "${row.instrument_id}" does not exist or is inactive`,
      );
      continue;
    }

    // --- 4. Invalid enum values ---
    const txType = row.transaction_type?.trim().toUpperCase();
    const txStatus = row.status?.trim().toUpperCase();

    if (!(TRANSACTION_TYPES as readonly string[]).includes(txType)) {
      reject(
        i,
        row,
        IMPORT_REJECTION_CODES.INVALID_ENUM_VALUE,
        `Invalid transaction_type: "${row.transaction_type}". Must be one of ${TRANSACTION_TYPES.join(', ')}`,
      );
      continue;
    }

    if (!(TRANSACTION_STATUSES as readonly string[]).includes(txStatus)) {
      reject(
        i,
        row,
        IMPORT_REJECTION_CODES.INVALID_ENUM_VALUE,
        `Invalid status: "${row.status}". Must be one of ${TRANSACTION_STATUSES.join(', ')}`,
      );
      continue;
    }

    // --- 5. Future trade_date ---
    const tradeDate = row.trade_date?.trim() ?? '';
    if (!isValidIsoDate(tradeDate)) {
      reject(
        i,
        row,
        IMPORT_REJECTION_CODES.INVALID_ENUM_VALUE,
        `Invalid trade_date: "${row.trade_date}". Must be YYYY-MM-DD`,
      );
      continue;
    }
    if (isFutureDate(tradeDate)) {
      reject(
        i,
        row,
        IMPORT_REJECTION_CODES.FUTURE_TRADE_DATE,
        `trade_date "${tradeDate}" is in the future`,
      );
      continue;
    }

    // --- 6. Numeric parsing ---
    const quantity = parseFloat(row.quantity ?? '');
    const price = parseFloat(row.price ?? '');
    const amount = parseFloat(row.amount ?? '');

    if (isNaN(amount) || amount <= 0) {
      reject(
        i,
        row,
        IMPORT_REJECTION_CODES.NON_POSITIVE_AMOUNT,
        `amount must be > 0, got "${row.amount}"`,
      );
      continue;
    }

    if (isNaN(quantity) || quantity < 0) {
      reject(
        i,
        row,
        IMPORT_REJECTION_CODES.NON_POSITIVE_AMOUNT,
        `quantity must be >= 0, got "${row.quantity}"`,
      );
      continue;
    }

    if (isNaN(price) || price < 0) {
      reject(
        i,
        row,
        IMPORT_REJECTION_CODES.NON_POSITIVE_AMOUNT,
        `price must be >= 0, got "${row.price}"`,
      );
      continue;
    }

    // --- 7. BUY/SELL require quantity > 0 AND price > 0 ---
    if ((txType === 'BUY' || txType === 'SELL') && (quantity <= 0 || price <= 0)) {
      reject(
        i,
        row,
        IMPORT_REJECTION_CODES.INVALID_TRADE_TERMS,
        `BUY/SELL rows require quantity > 0 and price > 0 (got quantity=${quantity}, price=${price})`,
      );
      continue;
    }

    // All checks passed
    validRows.push({
      transaction_id: txId,
      account_id: row.account_id.trim(),
      instrument_id: row.instrument_id.trim(),
      transaction_type: txType,
      trade_date: tradeDate,
      quantity,
      price,
      amount,
      status: txStatus,
    });
  }

  return { validRows, rejections };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
export async function importTransactionsCsv(
  fileBuffer: Buffer,
  fileName: string,
  userId: string,
): Promise<ImportBatchResponseDto> {
  // 1. SHA-256 deduplication
  const checksum = computeChecksum(fileBuffer);
  const existing = await findBatchByChecksum(CSV_IMPORT.ENTITY_TYPE_TRANSACTIONS, checksum);
  if (existing) {
    throw new AppError(
      HTTP_STATUS.CONFLICT,
      ERROR_CODES.DUPLICATE_FILE_UPLOAD,
      `A file with the same content has already been imported (batch_id: ${existing.batch_id})`,
    );
  }

  // 2. Parse CSV
  let rawRows: RawCsvTxRow[];
  let headers: string[];
  try {
    const records = parse(fileBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as RawCsvTxRow[];

    rawRows = records;
    headers = rawRows.length > 0 ? Object.keys(rawRows[0] as object) : [];
  } catch (err) {
    throw new AppError(
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.INVALID_CSV_FORMAT,
      `CSV parse error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 3. Header check
  validateHeaders(headers);

  // 4. Row-level validation (bulk FK lookups + all 7 anomaly classes)
  const { validRows, rejections } = await validateRows(rawRows);

  const totalRows = rawRows.length;
  const importedRows = validRows.length;
  const rejectedRows = rejections.length;
  const status: 'COMPLETED' | 'FAILED' = 'COMPLETED';

  // 5. Atomic persistence: BEGIN → batch row → valid txns → rejections → COMMIT
  const batchId = await persistImportBatch(
    { fileName, fileChecksum: checksum, totalRows, importedRows, rejectedRows, status, userId },
    validRows,
    rejections,
  );

  return {
    batch_id: batchId,
    file_name: fileName,
    total_rows: totalRows,
    imported_rows: importedRows,
    rejected_rows: rejectedRows,
    status,
    rejections,
  };
}
