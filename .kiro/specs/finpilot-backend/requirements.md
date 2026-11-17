# Requirements Document — FinPilot Backend API

## 1. Purpose & Scope
FinPilot is an internal wealth-service and operations REST API built with **Node.js, Express, TypeScript (`strict: true`), and PostgreSQL (`pg` with parameterized SQL)**. It enables wealth-service users to inspect consolidated customer portfolios, server-side filtered transactions, and financial goals, while allowing operations administrators to safely ingest daily CSV transaction files with full anomaly quarantine.

- **API Versioning:** All application endpoints are mounted under `/api/v1`.
- **Out of Scope:** Payment execution, brokerage order routing, and automated investment advice.

---

## 2. Functional Requirements

### Requirement 1: System Health & OpenAPI Documentation
**User Story:** As an operations or engineering user, I want unauthenticated health and OpenAPI endpoints so I can verify service readiness and inspect API contracts locally.

#### Acceptance Criteria
1. WHEN `GET /api/v1/health` is invoked, THE API SHALL execute a PostgreSQL readiness check (`SELECT 1`) and return HTTP `200` with `{ status: "ok", db: "connected", timestamp, uptime_seconds }` without exposing credentials or connection strings.
2. IF PostgreSQL is unreachable during `GET /api/v1/health`, THEN THE API SHALL return HTTP `503` with `{ error: { code: "SERVICE_UNAVAILABLE", message: "Database connection failed", request_id } }`.
3. WHEN `GET /api-docs` is opened in a browser, THE API SHALL render interactive Swagger UI backed by `docs/openapi.yaml`.

---

### Requirement 2: Authentication & Role-Based Access Control (RBAC)
**User Story:** As an internal user (`VIEWER` or `ADMIN`), I want to authenticate with email and password so protected routes enforce role permissions and audit attribution.

#### Acceptance Criteria
1. WHEN `POST /api/v1/auth/login` receives valid credentials for an active row in `users`, THE API SHALL verify the `bcryptjs` password hash and return HTTP `200` with an `HS256` JWT (`{ sub: user_id, email, role }`) and user profile metadata.
2. WHEN `POST /api/v1/auth/login` receives invalid credentials or an inactive account (`is_active = FALSE`), THE API SHALL return HTTP `401` (`INVALID_CREDENTIALS`) without revealing whether the email exists.
3. WHEN any `/api/v1/*` route other than `/health` and `/auth/login` is called without a valid `Authorization: Bearer <token>` header, THE API SHALL return HTTP `401` (`UNAUTHORIZED`).
4. WHEN an authenticated user with role `VIEWER` calls `POST /api/v1/admin/imports/transactions`, THE API SHALL reject the request with HTTP `403` (`FORBIDDEN`).

---

### Requirement 3: Customer Search & Profile Inspection
**User Story:** As a wealth-service user, I want to search customers and inspect their KYC status, segment, risk profile, and investment accounts.

#### Acceptance Criteria
1. WHEN `GET /api/v1/customers` is called, THE API SHALL support case-insensitive partial search across `customer_id`, `full_name`, `email`, and `city`, optional exact filters for `city`, `kyc_status`, and `segment`, and server-side pagination (`page`, `limit`).
2. THE `GET /api/v1/customers` query SHALL join `v_customer_portfolio_summary` to include `total_market_value` in a single SQL query without N+1 queries.
3. WHEN `GET /api/v1/customers/:id` is called for an active customer, THE API SHALL return customer master fields, their latest `risk_profile` (or `null` if absent), and their `accounts` list.
4. WHEN `GET /api/v1/customers/:id` is called for an unknown or inactive `customer_id`, THE API SHALL return HTTP `404` (`CUSTOMER_NOT_FOUND`).

---

### Requirement 4: Consolidated Portfolio Valuation & Asset Allocation
**User Story:** As a wealth-service user, I want customer-level and account-level portfolio totals, asset-class allocation, and position P&L computed in PostgreSQL rather than in browser JavaScript.

#### Acceptance Criteria
1. WHEN `GET /api/v1/customers/:id/portfolio` is called, THE API SHALL query `v_customer_portfolio_positions` and `accounts` to return:
   - Customer-level `totals`: `total_cost_basis`, `total_market_value`, `total_unrealised_gain_loss`, and `total_unrealised_gain_loss_pct`.
   - Account-level summaries (`accounts`): per-account `cost_basis`, `market_value`, and `unrealised_gain_loss`.
   - Asset-class breakdown (`allocation_by_asset_class`): grouped `market_value` and `allocation_pct`.
   - Position rows (`positions`): `quantity`, `avg_cost`, `last_price`, `cost_basis`, `market_value`, `unrealised_gain_loss`, and `unrealised_gain_loss_pct`.
2. THE response SHALL include `snapshot_date` and `price_as_of` so the UI displays data freshness.
3. IF an active customer holds zero positions (e.g., `C0001`), THEN THE API SHALL return HTTP `200` with `0` totals, account cards showing `0` market value, and empty `allocation_by_asset_class` and `positions` arrays.

---

### Requirement 5: Server-Side Filtered & Paginated Transactions
**User Story:** As a wealth-service user, I want to filter, sort, and paginate a customer's transaction ledger on the server.

#### Acceptance Criteria
1. WHEN `GET /api/v1/customers/:id/transactions` is called, THE API SHALL apply optional SQL `WHERE` filters for `account_id`, `instrument_id`, `transaction_type` (`BUY|SELL|DIVIDEND|FEE`), `status` (`SETTLED|PENDING|REVERSED`), `from_date`, and `to_date`.
2. THE API SHALL sort results using a strict column allowlist (`trade_date`, `amount`, `transaction_type`, `status`) and direction (`asc`, `desc`), defaulting to `trade_date DESC`, and return `data` alongside `pagination` metadata (`page`, `limit`, `total_items`, `total_pages`).
3. WHEN `GET /api/v1/instruments` is called, THE API SHALL return active instruments (`instrument_id`, `symbol`, `instrument_name`, `asset_class`) for filter dropdowns.

---

### Requirement 6: Financial Goal Monitoring & CRUD
**User Story:** As a wealth-service user, I want to view, create, and update a customer's financial goals with input validation and overdue/overfunded warning flags.

#### Acceptance Criteria
1. WHEN `GET /api/v1/customers/:id/goals` is called, THE API SHALL return active goals with:
   - `funded_percentage = ROUND((current_funded_amount / target_amount) * 100, 2)`
   - `is_overdue = (target_date < CURRENT_DATE AND current_funded_amount < target_amount)`
   - `is_overfunded = (current_funded_amount > target_amount)`
2. WHEN `POST /api/v1/customers/:id/goals` receives valid input, THE API SHALL insert the goal using `goal_id_seq` (`G00178+`), set `created_by` and `modified_by` to `req.user.userId`, and return HTTP `201`.
3. WHEN `PATCH /api/v1/goals/:goalId` receives valid partial fields, THE API SHALL update those fields, explicitly set `modified_by = req.user.userId` and `modified_at = NOW()`, and return HTTP `200` (`404` if `goalId` does not exist).
4. IF `target_amount <= 0`, `current_funded_amount < 0`, an invalid enum, or an invalid `YYYY-MM-DD` date is submitted, THEN THE API SHALL return HTTP `400` (`VALIDATION_ERROR`) with field-level details.

---

### Requirement 7: Admin CSV Transaction Import & Anomaly Quarantine
**User Story:** As an operations administrator, I want to upload a transactions CSV file so valid rows are committed atomically and invalid/duplicate rows are quarantined with row-level reasons.

#### Acceptance Criteria
1. WHEN an `ADMIN` uploads a CSV file via `POST /api/v1/admin/imports/transactions`, THE API SHALL compute its SHA-256 checksum and reject duplicate uploads (`entity_type = 'TRANSACTIONS'`) with HTTP `409` (`DUPLICATE_FILE_UPLOAD`).
2. THE import service SHALL validate required CSV headers (`transaction_id`, `account_id`, `instrument_id`, `transaction_type`, `trade_date`, `quantity`, `price`, `amount`, `status`) and return HTTP `400` (`INVALID_CSV_FORMAT`) if any required header is missing.
3. THE service SHALL stage and validate every CSV row in memory before writing to PostgreSQL, checking:
   - Duplicate `transaction_id` within the uploaded CSV or already present in `transactions` (`DUPLICATE_TRANSACTION_ID`)
   - Existence of `account_id` in `accounts` (`INVALID_ACCOUNT_FK`)
   - Existence of `instrument_id` in `instruments` (`INVALID_INSTRUMENT_FK`)
   - Valid `transaction_type` and `status` enums (`INVALID_ENUM_VALUE`)
   - Valid `YYYY-MM-DD` `trade_date` not in the future (`trade_date <= CURRENT_DATE`, else `FUTURE_TRADE_DATE`)
   - Numeric rules: `amount > 0`, `quantity >= 0`, `price >= 0` (`NON_POSITIVE_AMOUNT`), and `quantity > 0 AND price > 0` for `BUY`/`SELL` (`INVALID_TRADE_TERMS`).
4. INSIDE a single PostgreSQL transaction (`BEGIN ... COMMIT`), THE API SHALL insert an `import_batches` summary row, insert all valid rows into `transactions`, insert all rejected rows into `import_rejections` (`row_number`, `record_identifier`, `error_code`, `error_reason`, `raw_payload`), and return HTTP `200` with counts and row-level rejection items.

---

## 3. Non-Functional & Coding Standards
1. **Zero Magic Strings/Numbers:** All HTTP status codes, error codes, domain enums, pagination defaults, file limits, CSV headers, and SQL sort allowlists SHALL reside in `src/constants/`.
2. **Strict TypeScript Contracts:** All database row shapes, service DTOs, request/response payloads, and Express request extensions SHALL be defined in `src/types/` with `strict: true` and zero `any` types.
3. **SQL Injection & Database Hygiene:** Every query SHALL use parameterized `$1, $2...` placeholders via `pg.Pool`. Dynamic `ORDER BY` clauses SHALL map query parameters through explicit allowlist dictionaries. All `UPDATE` queries SHALL explicitly set `modified_at = NOW()` and `modified_by`.
4. **Observability & Safe Errors:** Every request SHALL attach a correlation `X-Request-Id` header and log structured JSON (`timestamp`, `level`, `request_id`, `method`, `path`, `status_code`, `duration_ms`, `user_id`). Unhandled errors SHALL return sanitized JSON and NEVER expose SQL details or stack traces.
5. **Automated Testing:** Include Vitest unit tests for CSV anomaly validation and Supertest integration tests covering auth/RBAC, portfolio math, goal validation, and CSV import.