# Design Document — FinPilot Backend API

## Overview
FinPilot is an internal wealth-service and operations REST API built with **Node.js, Express, TypeScript (`strict: true`), and PostgreSQL (`pg` with parameterized SQL)**. The backend exposes versioned endpoints under `/api/v1` and interactive Swagger documentation at `/api-docs` backed by `docs/openapi.yaml`.

### Core Engineering Goals
- **Clean Separation of Concerns:** Isolate HTTP transport, input validation, business calculations, and SQL execution into distinct layers.
- **Zero Magic Values:** Centralize all HTTP status codes, error codes, domain enums, pagination defaults, CSV import rules, and SQL sort allowlists in `src/constants/`.
- **Strict Type Safety:** Define all database row shapes, DTOs, API responses, and Express request extensions in `src/types/` with zero `any` types.
- **Data Integrity & Auditability:** Enforce parameterized queries, explicit numeric casting, soft-delete filtering (`is_active = TRUE`), and user/timestamp audit tracking (`created_by`, `created_at`, `modified_by`, `modified_at`).

---

## Architecture

### Layered Request Flow
Dependencies flow strictly downward from HTTP routes to PostgreSQL:

```text
HTTP Request
   │
   ▼
[Routes + Middleware]      --> Request ID Logger, JWT Auth, RBAC Guard, Multer, Zod Validation
   │
   ▼
[Controllers]              --> Extract typed params/query/body/user, set HTTP status
   │
   ▼
[Services]                 --> Business logic, derived math, CSV staging & TX orchestration
   │
   ▼
[Repositories]             --> Parameterized SQL queries & SQL Views (pg.Pool / PoolClient)
   │
   ▼
[PostgreSQL]               --> Tables, CHECK constraints, sequences, indexes, derived views
```

### Project Folder & File Structure

```text
finpilot-be/
├── data/                                 # Unmodified source CSV datasets
├── docs/
│   ├── erd.puml                          # PlantUML Entity-Relationship Diagram
│   └── openapi.yaml                      # OpenAPI 3.0.3 API specification
├── migrations/
│   ├── 001_init_schema.sql               # Tables, audit columns, sequences, indexes
│   └── 002_views.sql                     # Portfolio & reconciliation SQL views
├── scripts/
│   ├── migrate.ts                        # Transactional SQL migration runner
│   └── seed.ts                           # Demo RBAC users + initial CSV seeder
├── src/
│   ├── constants/
│   │   ├── http.constants.ts             # HTTP_STATUS codes & HTTP header names
│   │   ├── error.constants.ts            # ERROR_CODES, IMPORT_REJECTION_CODES & messages
│   │   └── domain.constants.ts           # Domain enums, pagination, CSV rules, sort allowlists
│   ├── types/
│   │   ├── common.types.ts               # ApiErrorResponse, PaginationMeta, PaginatedResponse<T>
│   │   ├── auth.types.ts                 # UserRole, JwtPayload, AuthenticatedUser, LoginDto
│   │   ├── customer.types.ts             # CustomerRow, RiskProfileRow, AccountRow, CustomerDto
│   │   ├── portfolio.types.ts            # PortfolioPositionDto, AccountAllocationDto, PortfolioDto
│   │   ├── transaction.types.ts          # TransactionRow, TransactionItemDto, TransactionQuery
│   │   ├── goal.types.ts                 # GoalRow, GoalItemDto, CreateGoalDto, UpdateGoalDto
│   │   ├── import.types.ts               # RawCsvTxRow, ValidatedTxRow, RejectionItem, ImportResultDto
│   │   └── express.d.ts                  # Augments Express.Request with req.user & req.requestId
│   ├── config/
│   │   ├── env.ts                        # Validated environment configuration loader
│   │   └── db.ts                         # Shared pg.Pool (supports DB_* fields & DATABASE_URL)
│   ├── utils/
│   │   ├── AppError.ts                   # Typed operational error class (statusCode, code, details)
│   │   └── logger.ts                     # Structured JSON logger utility
│   ├── middleware/
│   │   ├── requestLogger.ts              # Assigns X-Request-Id & logs structured request telemetry
│   │   ├── auth.ts                       # authenticateJwt & requireRole('ADMIN') guards
│   │   ├── validate.ts                   # Reusable Zod validator for body, query, and params
│   │   └── errorHandler.ts               # Maps AppError / Zod / Multer / unknown errors safely
│   ├── validators/
│   │   ├── auth.validator.ts             # Login request body Zod schema
│   │   ├── customer.validator.ts         # Customer search query & :id param Zod schemas
│   │   ├── transaction.validator.ts      # Transaction filter, sort & pagination Zod schema
│   │   └── goal.validator.ts             # CreateGoal & PatchGoal Zod schemas
│   ├── repositories/
│   │   ├── user.repository.ts            # Active user lookup by email or user_id
│   │   ├── customer.repository.ts        # Customer search/count + profile, risk_profile & accounts
│   │   ├── portfolio.repository.ts       # Queries v_customer_portfolio_positions & accounts
│   │   ├── transaction.repository.ts     # Parameterized ledger filters, count & allowlisted sort
│   │   ├── goal.repository.ts            # Goal select, sequence-backed insert & audited PATCH update
│   │   └── import.repository.ts          # Checksum check, FK/ID lookups, batch & rejection inserts
│   ├── services/
│   │   ├── auth.service.ts               # bcryptjs password verification & HS256 JWT issuance
│   │   ├── customer.service.ts           # Customer pagination & profile response assembly
│   │   ├── portfolio.service.ts          # Account/asset-class rollups, percentages & empty states
│   │   ├── transaction.service.ts        # Filter normalization & paginated ledger retrieval
│   │   ├── goal.service.ts               # Goal CRUD + funded_percentage, is_overdue, is_overfunded
│   │   ├── instrument.service.ts         # Active security master lookup for UI filters
│   │   └── transactionImport.service.ts  # CSV parsing, row validation & atomic DB transaction merge
│   ├── controllers/
│   │   ├── health.controller.ts          # GET /health
│   │   ├── auth.controller.ts            # POST /auth/login
│   │   ├── customer.controller.ts        # GET /customers, GET /customers/:id
│   │   ├── portfolio.controller.ts       # GET /customers/:id/portfolio
│   │   ├── transaction.controller.ts     # GET /customers/:id/transactions
│   │   ├── goal.controller.ts            # GET/POST /customers/:id/goals, PATCH /goals/:goalId
│   │   ├── instrument.controller.ts      # GET /instruments
│   │   └── adminImport.controller.ts     # POST /admin/imports/transactions
│   ├── routes/
│   │   ├── index.ts                      # Mounts all versioned routers under /api/v1
│   │   ├── health.routes.ts
│   │   ├── auth.routes.ts
│   │   ├── customer.routes.ts
│   │   ├── goal.routes.ts
│   │   ├── instrument.routes.ts
│   │   └── adminImport.routes.ts
│   ├── app.ts                            # Express app setup (helmet, cors, swagger-ui, routes, errors)
│   └── server.ts                         # HTTP listener & graceful SIGINT/SIGTERM shutdown
├── tests/
│   ├── transactionImport.unit.test.ts    # Unit tests for CSV validation & anomaly quarantine
│   └── api.integration.test.ts           # Supertest integration tests across core API flows
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

### Database & SQL Engineering Standards
- **Connection Pooling (`src/config/db.ts`):** Configures `pg.Pool` (`max: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`), preferring individual `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` variables when `DB_HOST` is set, with `DATABASE_URL` as fallback for containerized/CI environments.
- **Numeric Precision Casting:** PostgreSQL `NUMERIC` columns are returned as strings by `pg`; repositories and services explicitly cast monetary, price, and quantity columns via `Number(...)` to match `docs/openapi.yaml`.
- **Audit & Soft-Delete Discipline:** All `SELECT` queries filter by `is_active = TRUE`. Every `UPDATE` query explicitly sets `modified_at = NOW()` and `modified_by = $userId`.
- **SQL Injection Defense:** All filter values use positional `$1, $2...` placeholders; dynamic `ORDER BY` clauses resolve query keys through an explicit allowlist dictionary before interpolation.

---

## Components and Interfaces

### Constants Layer (`src/constants/`)
- **`http.constants.ts`:** Exports `HTTP_STATUS` (`OK: 200`, `CREATED: 201`, `BAD_REQUEST: 400`, `UNAUTHORIZED: 401`, `FORBIDDEN: 403`, `NOT_FOUND: 404`, `CONFLICT: 409`, `INTERNAL_SERVER_ERROR: 500`, `SERVICE_UNAVAILABLE: 503`) and `HTTP_HEADERS` (`REQUEST_ID: 'X-Request-Id'`, `AUTHORIZATION: 'Authorization'`).
- **`error.constants.ts`:** Exports `ERROR_CODES` (`VALIDATION_ERROR`, `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `FORBIDDEN`, `CUSTOMER_NOT_FOUND`, `GOAL_NOT_FOUND`, `DUPLICATE_FILE_UPLOAD`, `INVALID_CSV_FORMAT`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`) and `IMPORT_REJECTION_CODES` (`DUPLICATE_TRANSACTION_ID`, `INVALID_ACCOUNT_FK`, `INVALID_INSTRUMENT_FK`, `INVALID_ENUM_VALUE`, `FUTURE_TRADE_DATE`, `NON_POSITIVE_AMOUNT`, `INVALID_TRADE_TERMS`).
- **`domain.constants.ts`:**
  - `as const` enum tuples: `USER_ROLES`, `KYC_STATUSES`, `CUSTOMER_SEGMENTS`, `ACCOUNT_TYPES`, `ACCOUNT_STATUSES`, `ASSET_CLASSES`, `TRANSACTION_TYPES`, `TRANSACTION_STATUSES`, `GOAL_TYPES`, `PRIORITIES`, `RISK_LEVELS`, `LIQUIDITY_NEEDS`.
  - `PAGINATION`: `{ DEFAULT_PAGE: 1, DEFAULT_LIMIT: 20, MAX_LIMIT: 100 } as const`.
  - `CSV_IMPORT`: `{ ENTITY_TYPE_TRANSACTIONS: 'TRANSACTIONS', MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, REQUIRED_HEADERS: ['transaction_id', 'account_id', 'instrument_id', 'transaction_type', 'trade_date', 'quantity', 'price', 'amount', 'status'] } as const`.
  - `TRANSACTION_SORT_COLUMN_MAP`: `{ trade_date: 't.trade_date', amount: 't.amount', transaction_type: 't.transaction_type', status: 't.status' } as const` and `SORT_DIRECTIONS = ['asc', 'desc'] as const`.

### TypeScript Interfaces (`src/types/`)
- **`common.types.ts`:** `PaginationMeta`, `PaginatedResponse<T>`, `ValidationIssue`, `ApiErrorResponse`.
- **`auth.types.ts`:** `UserRole`, `UserRow`, `JwtPayload`, `AuthenticatedUser`, `LoginRequestDto`, `LoginResponseDto`.
- **`customer.types.ts`:** `CustomerRow`, `RiskProfileRow`, `AccountRow`, `CustomerSummaryDto`, `CustomerDetailDto`, `CustomerListQuery`.
- **`portfolio.types.ts`:** `PortfolioPositionRow`, `PortfolioPositionDto`, `AccountAllocationDto`, `AssetClassAllocationDto`, `PortfolioTotalsDto`, `PortfolioResponseDto`.
- **`transaction.types.ts`:** `TransactionRow`, `TransactionItemDto`, `TransactionListQuery`, `InstrumentOptionDto`.
- **`goal.types.ts`:** `GoalRow`, `GoalItemDto`, `CreateGoalDto`, `UpdateGoalDto`.
- **`import.types.ts`:** `RawCsvTxRow`, `ValidatedTxRow`, `ImportRejectionItemDto`, `ImportBatchResponseDto`.
- **`express.d.ts`:** Augments `Express.Request` with `requestId: string` and `user?: AuthenticatedUser`.

### Layer Responsibilities
- **Middleware (`src/middleware/`):** `requestLogger` generates `X-Request-Id` and logs JSON request metrics; `auth` validates `HS256` JWTs and enforces `requireRole('ADMIN')`; `validate` parses `body`, `query`, and `params` with Zod; `errorHandler` formats all failures safely.
- **Repositories (`src/repositories/`):** Encapsulate all SQL queries and transactions (`Pool` and `PoolClient`). Never contain HTTP concepts.
- **Services (`src/services/`):** Implement business rules—account/asset-class rollups (`portfolio.service.ts`), goal progress & warning flags (`goal.service.ts`), and in-memory CSV staging + single-transaction persistence (`transactionImport.service.ts`).
- **Controllers (`src/controllers/`):** Thin handlers that read validated inputs and `req.user`, invoke services, and send typed JSON responses.

---

## Data Models

### PostgreSQL Tables & Audit Columns
All 10 tables include the standard audit columns: `created_by UUID REFERENCES users(user_id)`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `modified_by UUID REFERENCES users(user_id)`, `modified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, and `is_active BOOLEAN NOT NULL DEFAULT TRUE`.

| Table | Primary Key | Key Columns & Constraints |
| :--- | :--- | :--- |
| `users` | `user_id` (`UUID`) | `email` (`UNIQUE`), `password_hash`, `full_name`, `role` (`VIEWER\|ADMIN`) |
| `customers` | `customer_id` (`VARCHAR(16)`) | `full_name`, `email` (`UNIQUE`), `phone`, `city`, `state`, `date_of_birth`, `onboarded_at`, `kyc_status`, `segment` |
| `risk_profiles` | `customer_id` (`FK -> customers`) | 1:1 with `customers`; `risk_score` (`0..100`), `risk_level`, `assessed_at`, `horizon_years` (`> 0`), `liquidity_need` |
| `accounts` | `account_id` (`VARCHAR(16)`) | `customer_id` (`FK`), `account_type`, `provider`, `opened_at`, `status` (`ACTIVE\|DORMANT\|CLOSED`), `base_currency` |
| `instruments` | `instrument_id` (`VARCHAR(16)`) | `symbol` (`UNIQUE`), `instrument_name`, `asset_class`, `sector` (nullable), `exchange`, `last_price` (`> 0`), `price_as_of`, `risk_band` |
| `holdings_snapshot` | `holding_id` (`BIGSERIAL`) | `UNIQUE (account_id, instrument_id, snapshot_date)`, `quantity` (`> 0`), `avg_cost` (`>= 0`) |
| `transactions` | `transaction_id` (`VARCHAR(20)`) | `account_id` (`FK`), `instrument_id` (`FK`), `transaction_type`, `trade_date`, `quantity` (`>= 0`), `price` (`>= 0`), `amount` (`> 0`), `status`, `import_batch_id` (`FK`) |
| `goals` | `goal_id` (`VARCHAR(16)`) | Default via `goal_id_seq` (`G00178+`); `customer_id` (`FK`), `goal_type`, `goal_name`, `target_amount` (`> 0`), `current_funded_amount` (`>= 0`), `target_date`, `priority` |
| `import_batches` | `batch_id` (`UUID`) | `entity_type`, `file_name`, `file_checksum` (`SHA-256`), `total_rows`, `imported_rows`, `rejected_rows`, `status` |
| `import_rejections` | `rejection_id` (`BIGSERIAL`) | `batch_id` (`FK`), `row_number`, `record_identifier`, `error_code`, `error_reason`, `raw_payload` (`JSONB`) |

### Derived SQL Views
- `v_customer_portfolio_positions`: Joins active `holdings_snapshot`, `accounts`, and `instruments` to calculate `cost_basis`, `market_value`, `unrealised_gain_loss`, and `unrealised_gain_loss_pct` in PostgreSQL.
- `v_customer_portfolio_summary`: Aggregates customer-level `total_cost_basis`, `total_market_value`, `total_unrealised_gain_loss`, `latest_snapshot_date`, and `latest_price_as_of` across all active customers (`LEFT JOIN` so customers with zero holdings return `0.00`).
- `v_reconciliation_exceptions`: Exposes quarantined anomalies from `import_rejections` joined with `import_batches`.

---

## Empty Correctness Properties
1. **Portfolio Valuation Consistency:** For any customer `C`, `totals.total_market_value` MUST equal the sum of `market_value` across all customer accounts and the sum of `market_value` across all `allocation_by_asset_class` entries, with `allocation_pct` summing to `100.00` (or `0` when the customer holds zero positions).
2. **Server-Side Ledger Isolation:** `GET /api/v1/customers/:id/transactions` MUST scope results strictly to accounts owned by customer `:id` and compute `pagination.total_items` using the identical SQL `WHERE` predicate applied to the paginated data query.
3. **Goal Warning Derivation:** For every returned goal, `funded_percentage = ROUND((current_funded_amount / target_amount) * 100, 2)`, `is_overdue` is `true` if and only if `target_date < CURRENT_DATE` and `current_funded_amount < target_amount`, and `is_overfunded` is `true` if and only if `current_funded_amount > target_amount`.
4. **Atomic CSV Import & Quarantine:** During `POST /api/v1/admin/imports/transactions`, `total_rows` MUST equal `imported_rows + rejected_rows`. Valid rows and rejection records MUST be committed within a single database transaction (`BEGIN ... COMMIT`); if any unexpected database error occurs mid-batch, the entire batch rolls back cleanly.
5. **RBAC Enforcement:** No request lacking a valid `ADMIN` JWT may mutate `import_batches`, `import_rejections`, or `transactions` via `/api/v1/admin/imports/transactions`.

---

## Error Handling
All non-2xx responses flow through `src/middleware/errorHandler.ts` and return a uniform JSON envelope matching `docs/openapi.yaml`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "target_amount", "issue": "Number must be greater than 0" }
    ],
    "request_id": "a3f1c9e2-7b4d-4c8e-9f12-0d1e2f3a4b5c"
  }
}
```

### Error Mapping Rules
- **`AppError` instances:** Mapped to their explicit `statusCode`, `code`, `message`, and optional `details`.
- **`ZodError` instances:** Mapped to HTTP `400` (`VALIDATION_ERROR`) with field-level `details` extracted from `err.issues`.
- **`MulterError` instances:** File size or field errors mapped to HTTP `400` (`INVALID_CSV_FORMAT`).
- **Unhandled exceptions:** Logged internally with full stack trace and `request_id` via `logger.error`, while returning HTTP `500` (`INTERNAL_ERROR`, `"An unexpected internal error occurred"`) to the client without leaking SQL errors or stack traces.

---

## Testing Strategy
Automated tests use **Vitest** and **Supertest** (`npm test`) without requiring external cloud dependencies:

1. **Unit Tests (`tests/transactionImport.unit.test.ts`):**
   - Verify CSV header validation fails with `INVALID_CSV_FORMAT` when required columns are missing.
   - Verify row-level quarantine rules detect and classify: duplicate `transaction_id` within the same file (`DUPLICATE_TRANSACTION_ID`), unknown `account_id` (`INVALID_ACCOUNT_FK`), unknown `instrument_id` such as `I9999` (`INVALID_INSTRUMENT_FK`), future `trade_date` (`FUTURE_TRADE_DATE`), non-positive `amount` such as `-75.00` (`NON_POSITIVE_AMOUNT`), and zero `quantity`/`price` on `BUY`/`SELL` rows (`INVALID_TRADE_TERMS`).
2. **API Integration Tests (`tests/api.integration.test.ts`):**
   - `GET /api/v1/health` returns `200` and `X-Request-Id` header.
   - `POST /api/v1/auth/login` authenticates `ADMIN` and `VIEWER` users and rejects bad passwords with `401`.
   - `GET /api/v1/customers` searches and paginates accurately; `GET /api/v1/customers/:id` returns `404` for unknown IDs.
   - `GET /api/v1/customers/:id/portfolio` returns `0` totals with empty arrays for `C0001` and accurate valuations/allocations for `C0002`.
   - `GET /api/v1/customers/:id/transactions` applies `transaction_type`, `status`, date range, and pagination filters.
   - `POST /api/v1/customers/:id/goals` and `PATCH /api/v1/goals/:goalId` enforce validation (`400` on `target_amount <= 0`), set audit fields, and compute `funded_percentage`.
   - `POST /api/v1/admin/imports/transactions` returns `403` for `VIEWER`, imports valid rows while quarantining bad rows for `ADMIN`, and returns `409` on duplicate file checksum upload.