import type {
  TransactionType,
  TransactionStatus,
  AssetClass,
  TransactionSortKey,
  SortDirection,
} from '../constants/domain.constants';

// ----- Database row -----
export interface TransactionRow {
  transaction_id: string;
  account_id: string;
  instrument_id: string;
  transaction_type: TransactionType;
  trade_date: Date;
  quantity: string;   // NUMERIC from pg
  price: string;      // NUMERIC from pg
  amount: string;     // NUMERIC from pg
  status: TransactionStatus;
  import_batch_id: string | null;
  is_active: boolean;
  created_at: Date;
  modified_at: Date;
}

// ----- Query params for GET /customers/:id/transactions -----
export interface TransactionListQuery {
  account_id?: string;
  instrument_id?: string;
  transaction_type?: TransactionType;
  status?: TransactionStatus;
  from_date?: string;
  to_date?: string;
  sort_by?: TransactionSortKey;
  sort_dir?: SortDirection;
  page?: number;
  limit?: number;
}

// ----- Response DTO -----
export interface TransactionItemDto {
  transaction_id: string;
  account_id: string;
  instrument_id: string;
  transaction_type: TransactionType;
  trade_date: string;
  quantity: number;
  price: number;
  amount: number;
  status: TransactionStatus;
}

// ----- Instrument option (for filter dropdowns) -----
export interface InstrumentRow {
  instrument_id: string;
  symbol: string;
  instrument_name: string;
  asset_class: AssetClass;
  last_price: string;    // NUMERIC from pg
  price_as_of: Date;
  is_active: boolean;
}

export interface InstrumentOptionDto {
  instrument_id: string;
  symbol: string;
  instrument_name: string;
  asset_class: AssetClass;
}
