// ---------------------------------------------------------------------------
// Domain enum tuples — derive TypeScript union types from these directly
// ---------------------------------------------------------------------------

export const USER_ROLES = ['VIEWER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const KYC_STATUSES = ['VERIFIED', 'PENDING', 'REVIEW'] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const CUSTOMER_SEGMENTS = ['Mass', 'Affluent', 'HNI'] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];

export const ACCOUNT_TYPES = ['BROKERAGE', 'MUTUAL_FUND', 'RETIREMENT'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_STATUSES = ['ACTIVE', 'DORMANT', 'CLOSED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ASSET_CLASSES = ['EQUITY', 'ETF', 'MUTUAL_FUND', 'BOND', 'REIT', 'GSEC'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const TRANSACTION_TYPES = ['BUY', 'SELL', 'DIVIDEND', 'FEE'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ['SETTLED', 'PENDING', 'REVERSED'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const GOAL_TYPES = [
  'WEALTH_CREATION',
  'EMERGENCY_FUND',
  'EDUCATION',
  'HOME_PURCHASE',
  'RETIREMENT',
  'TRAVEL',
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const RISK_LEVELS = ['Conservative', 'Moderate', 'Growth', 'Aggressive'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const LIQUIDITY_NEEDS = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type LiquidityNeed = (typeof LIQUIDITY_NEEDS)[number];

// ---------------------------------------------------------------------------
// Pagination defaults
// ---------------------------------------------------------------------------

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// ---------------------------------------------------------------------------
// CSV Import rules
// ---------------------------------------------------------------------------

export const CSV_IMPORT = {
  ENTITY_TYPE_TRANSACTIONS: 'TRANSACTIONS',
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5 MB
  REQUIRED_HEADERS: [
    'transaction_id',
    'account_id',
    'instrument_id',
    'transaction_type',
    'trade_date',
    'quantity',
    'price',
    'amount',
    'status',
  ],
} as const;

export type RequiredCsvHeader = (typeof CSV_IMPORT.REQUIRED_HEADERS)[number];

// ---------------------------------------------------------------------------
// Transaction sort allowlist — maps query param keys to safe SQL column refs
// ---------------------------------------------------------------------------

export const TRANSACTION_SORT_COLUMN_MAP = {
  trade_date: 't.trade_date',
  amount: 't.amount',
  transaction_type: 't.transaction_type',
  status: 't.status',
} as const;

export type TransactionSortKey = keyof typeof TRANSACTION_SORT_COLUMN_MAP;

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];
