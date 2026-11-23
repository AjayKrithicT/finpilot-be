import type { ImportRejectionCode } from '../constants/error.constants';
import type { PaginatedResponse } from './common.types';

// ----- Raw parsed CSV row (all values are strings before validation) -----
export interface RawCsvTxRow {
  transaction_id: string;
  account_id: string;
  instrument_id: string;
  transaction_type: string;
  trade_date: string;
  quantity: string;
  price: string;
  amount: string;
  status: string;
  [key: string]: string;  // allow extra columns without breaking the spread
}

// ----- Row after passing all validation checks -----
export interface ValidatedTxRow {
  transaction_id: string;
  account_id: string;
  instrument_id: string;
  transaction_type: string;
  trade_date: string;
  quantity: number;
  price: number;
  amount: number;
  status: string;
}

// ----- Single rejection item (returned in API response & written to DB) -----
export interface ImportRejectionItemDto {
  row_number: number;
  record_identifier: string;
  error_code: ImportRejectionCode;
  error_reason: string;
  raw_payload: RawCsvTxRow;
}

// ----- API response body for POST /admin/imports/transactions -----
export interface ImportBatchResponseDto {
  batch_id: string;
  file_name: string;
  total_rows: number;
  imported_rows: number;
  rejected_rows: number;
  status: 'COMPLETED' | 'FAILED';
  rejections: ImportRejectionItemDto[];
}

// ----- Paginated rejection row (from DB, raw_payload is already parsed JSON) -----
export interface ImportRejectionRowDto {
  row_number: number;
  record_identifier: string;
  error_code: string;
  error_reason: string;
  raw_payload: Record<string, unknown>;
}

// ----- API response for GET /admin/imports/transactions/:batchId/rejections -----
export type PaginatedRejectionsDto = PaginatedResponse<ImportRejectionRowDto>;
