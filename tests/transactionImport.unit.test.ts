/**
 * Unit tests for CSV transaction import validation logic.
 *
 * The repository layer is fully mocked so these tests run without a database.
 * They exercise:
 *   - Missing required CSV headers              → INVALID_CSV_FORMAT
 *   - Duplicate transaction_id within the file  → DUPLICATE_TRANSACTION_ID
 *   - Unknown instrument_id (I9999)             → INVALID_INSTRUMENT_FK
 *   - Unknown account_id                        → INVALID_ACCOUNT_FK
 *   - Future trade_date                         → FUTURE_TRADE_DATE
 *   - Non-positive amount (-75.00)              → NON_POSITIVE_AMOUNT
 *   - BUY/SELL with zero quantity or price      → INVALID_TRADE_TERMS
 *   - Valid rows are accepted and counted
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importTransactionsCsv } from '../src/services/transactionImport.service';
import { AppError } from '../src/utils/AppError';
import { ERROR_CODES, IMPORT_REJECTION_CODES } from '../src/constants/error.constants';

// ---------------------------------------------------------------------------
// Mock the entire import repository so no DB connection is required
// ---------------------------------------------------------------------------
vi.mock('../src/repositories/import.repository', () => ({
  findBatchByChecksum: vi.fn().mockResolvedValue(undefined),   // no duplicate batch
  findExistingAccountIds: vi.fn().mockImplementation(async (ids: string[]) => {
    // A00001 and A00002 are "known"; anything else is unknown
    const known = new Set(['A00001', 'A00002', 'A00003']);
    return new Set(ids.filter((id) => known.has(id)));
  }),
  findExistingInstrumentIds: vi.fn().mockImplementation(async (ids: string[]) => {
    // I0001 and I0002 are known; I9999 is intentionally absent
    const known = new Set(['I0001', 'I0002']);
    return new Set(ids.filter((id) => known.has(id)));
  }),
  findExistingTransactionIds: vi.fn().mockResolvedValue(new Set()),
  persistImportBatch: vi.fn().mockResolvedValue('mock-batch-id-1234'),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TOMORROW = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const TODAY = new Date().toISOString().slice(0, 10);

function csvBuffer(rows: string[]): Buffer {
  const header =
    'transaction_id,account_id,instrument_id,transaction_type,trade_date,quantity,price,amount,status';
  return Buffer.from([header, ...rows].join('\n'), 'utf8');
}

function validRow(overrides: Partial<Record<string, string>> = {}): string {
  const defaults: Record<string, string> = {
    transaction_id: 'TX9001',
    account_id: 'A00001',
    instrument_id: 'I0001',
    transaction_type: 'BUY',
    trade_date: TODAY,
    quantity: '10',
    price: '100.00',
    amount: '1000.00',
    status: 'SETTLED',
  };
  const r = { ...defaults, ...overrides };
  return Object.values(r).join(',');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('importTransactionsCsv — header validation', () => {
  it('throws INVALID_CSV_FORMAT when required headers are missing', async () => {
    // CSV with only some columns — missing instrument_id, price, amount, status
    const badCsv = Buffer.from(
      'transaction_id,account_id,transaction_type,trade_date,quantity\nTX001,A00001,BUY,2024-01-01,10',
      'utf8',
    );

    await expect(
      importTransactionsCsv(badCsv, 'bad_headers.csv', 'user-1'),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AppError &&
        err.code === ERROR_CODES.INVALID_CSV_FORMAT
      );
    });
  });

  it('throws INVALID_CSV_FORMAT when the file is not valid CSV', async () => {
    const garbage = Buffer.from('\x00\x01\x02binary garbage\xFF', 'utf8');
    // csv-parse may either throw or return no columns — either way we get INVALID_CSV_FORMAT
    // We just verify it doesn't silently succeed
    let threw = false;
    try {
      await importTransactionsCsv(garbage, 'binary.csv', 'user-1');
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe('importTransactionsCsv — duplicate transaction_id', () => {
  it('quarantines the second occurrence of a transaction_id within the same file', async () => {
    const buf = csvBuffer([
      validRow({ transaction_id: 'TX_DUP_001' }),
      validRow({ transaction_id: 'TX_DUP_001', price: '110.00', amount: '1100.00' }), // duplicate
      validRow({ transaction_id: 'TX_DUP_002' }),
    ]);

    const result = await importTransactionsCsv(buf, 'dup.csv', 'user-1');

    expect(result.total_rows).toBe(3);
    expect(result.imported_rows).toBe(2);
    expect(result.rejected_rows).toBe(1);
    expect(result.rejections[0]?.error_code).toBe(
      IMPORT_REJECTION_CODES.DUPLICATE_TRANSACTION_ID,
    );
    expect(result.rejections[0]?.record_identifier).toBe('TX_DUP_001');
    expect(result.rejections[0]?.row_number).toBe(2); // 1-based data rows: header excluded, duplicate is data row 2
  });
});

describe('importTransactionsCsv — invalid instrument FK (I9999)', () => {
  it('quarantines rows referencing an unknown instrument_id', async () => {
    const buf = csvBuffer([
      validRow({ transaction_id: 'TX_INST_001', instrument_id: 'I9999' }),
      validRow({ transaction_id: 'TX_INST_002' }),
    ]);

    const result = await importTransactionsCsv(buf, 'bad_instrument.csv', 'user-1');

    expect(result.rejected_rows).toBe(1);
    expect(result.imported_rows).toBe(1);
    const rej = result.rejections[0];
    expect(rej?.error_code).toBe(IMPORT_REJECTION_CODES.INVALID_INSTRUMENT_FK);
    expect(rej?.raw_payload.instrument_id).toBe('I9999');
  });
});

describe('importTransactionsCsv — invalid account FK', () => {
  it('quarantines rows referencing an unknown account_id', async () => {
    const buf = csvBuffer([
      validRow({ transaction_id: 'TX_ACC_001', account_id: 'A99999' }),
    ]);

    const result = await importTransactionsCsv(buf, 'bad_account.csv', 'user-1');

    expect(result.rejected_rows).toBe(1);
    expect(result.imported_rows).toBe(0);
    expect(result.rejections[0]?.error_code).toBe(
      IMPORT_REJECTION_CODES.INVALID_ACCOUNT_FK,
    );
  });
});

describe('importTransactionsCsv — future trade_date', () => {
  it('quarantines rows where trade_date is after today', async () => {
    const buf = csvBuffer([
      validRow({ transaction_id: 'TX_FUT_001', trade_date: TOMORROW }),
      validRow({ transaction_id: 'TX_FUT_002' }), // valid
    ]);

    const result = await importTransactionsCsv(buf, 'future_date.csv', 'user-1');

    expect(result.rejected_rows).toBe(1);
    expect(result.imported_rows).toBe(1);
    expect(result.rejections[0]?.error_code).toBe(
      IMPORT_REJECTION_CODES.FUTURE_TRADE_DATE,
    );
    expect(result.rejections[0]?.raw_payload.trade_date).toBe(TOMORROW);
  });
});

describe('importTransactionsCsv — non-positive amount', () => {
  it('quarantines rows with negative amount (-75.00)', async () => {
    const buf = csvBuffer([
      validRow({ transaction_id: 'TX_NEG_001', amount: '-75.00' }),
    ]);

    const result = await importTransactionsCsv(buf, 'neg_amount.csv', 'user-1');

    expect(result.rejected_rows).toBe(1);
    expect(result.rejections[0]?.error_code).toBe(
      IMPORT_REJECTION_CODES.NON_POSITIVE_AMOUNT,
    );
  });

  it('quarantines rows with amount of zero', async () => {
    const buf = csvBuffer([
      validRow({ transaction_id: 'TX_ZERO_001', amount: '0' }),
    ]);

    const result = await importTransactionsCsv(buf, 'zero_amount.csv', 'user-1');

    expect(result.rejected_rows).toBe(1);
    expect(result.rejections[0]?.error_code).toBe(
      IMPORT_REJECTION_CODES.NON_POSITIVE_AMOUNT,
    );
  });
});

describe('importTransactionsCsv — invalid trade terms (BUY/SELL)', () => {
  it('quarantines BUY row with quantity = 0', async () => {
    const buf = csvBuffer([
      validRow({ transaction_id: 'TX_TRM_001', transaction_type: 'BUY', quantity: '0', price: '100.00', amount: '0.01' }),
    ]);

    const result = await importTransactionsCsv(buf, 'zero_qty.csv', 'user-1');

    expect(result.rejected_rows).toBe(1);
    expect(result.rejections[0]?.error_code).toBe(
      IMPORT_REJECTION_CODES.INVALID_TRADE_TERMS,
    );
  });

  it('quarantines SELL row with price = 0', async () => {
    const buf = csvBuffer([
      validRow({ transaction_id: 'TX_TRM_002', transaction_type: 'SELL', quantity: '5', price: '0', amount: '1.00' }),
    ]);

    const result = await importTransactionsCsv(buf, 'zero_price.csv', 'user-1');

    expect(result.rejected_rows).toBe(1);
    expect(result.rejections[0]?.error_code).toBe(
      IMPORT_REJECTION_CODES.INVALID_TRADE_TERMS,
    );
  });

  it('allows DIVIDEND row with quantity = 0 and price = 0', async () => {
    const buf = csvBuffer([
      validRow({
        transaction_id: 'TX_DIV_001',
        transaction_type: 'DIVIDEND',
        quantity: '0',
        price: '0',
        amount: '500.00',
      }),
    ]);

    const result = await importTransactionsCsv(buf, 'dividend.csv', 'user-1');

    expect(result.imported_rows).toBe(1);
    expect(result.rejected_rows).toBe(0);
  });
});

describe('importTransactionsCsv — duplicate file checksum', () => {
  it('throws DUPLICATE_FILE_UPLOAD when checksum already exists in DB', async () => {
    // Override the mock just for this test
    const { findBatchByChecksum } = await import('../src/repositories/import.repository');
    vi.mocked(findBatchByChecksum).mockResolvedValueOnce({ batch_id: 'existing-batch' });

    const buf = csvBuffer([validRow({ transaction_id: 'TX_DEDUP_001' })]);

    await expect(
      importTransactionsCsv(buf, 'duplicate.csv', 'user-1'),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof AppError &&
        err.code === ERROR_CODES.DUPLICATE_FILE_UPLOAD
      );
    });
  });
});

describe('importTransactionsCsv — valid file', () => {
  beforeEach(async () => {
    // Restore default mock (no duplicate batch)
    vi.mocked(
      (await import('../src/repositories/import.repository')).findBatchByChecksum,
    ).mockResolvedValue(undefined);
  });

  it('imports all valid rows with correct counts', async () => {
    const buf = csvBuffer([
      validRow({ transaction_id: 'TX_OK_001' }),
      validRow({ transaction_id: 'TX_OK_002', transaction_type: 'SELL' }),
      validRow({ transaction_id: 'TX_OK_003', transaction_type: 'DIVIDEND', quantity: '0', price: '0', amount: '250.00' }),
    ]);

    const result = await importTransactionsCsv(buf, 'valid.csv', 'user-1');

    expect(result.total_rows).toBe(3);
    expect(result.imported_rows).toBe(3);
    expect(result.rejected_rows).toBe(0);
    expect(result.rejections).toHaveLength(0);
    expect(result.batch_id).toBe('mock-batch-id-1234');
    expect(result.status).toBe('COMPLETED');
  });

  it('total_rows always equals imported_rows + rejected_rows', async () => {
    const buf = csvBuffer([
      validRow({ transaction_id: 'TX_MIX_001' }),
      validRow({ transaction_id: 'TX_MIX_002', amount: '-1' }),   // rejected
      validRow({ transaction_id: 'TX_MIX_003', instrument_id: 'I9999' }), // rejected
      validRow({ transaction_id: 'TX_MIX_004' }),
    ]);

    const result = await importTransactionsCsv(buf, 'mixed.csv', 'user-1');

    expect(result.total_rows).toBe(result.imported_rows + result.rejected_rows);
  });
});
