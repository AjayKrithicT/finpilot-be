# Implementation Plan — FinPilot Backend API

- [ ] 1. Create Constants, TypeScript Interfaces, and Core Config
  - [ ] 1.1 Create `src/constants/http.constants.ts`, `src/constants/error.constants.ts`, and `src/constants/domain.constants.ts` (enums, pagination defaults, CSV headers/limits, and SQL sort allowlists).
  - [ ] 1.2 Create `src/types/common.types.ts`, `src/types/auth.types.ts`, `src/types/customer.types.ts`, `src/types/portfolio.types.ts`, `src/types/transaction.types.ts`, `src/types/goal.types.ts`, `src/types/import.types.ts`, and `src/types/express.d.ts`.
  - [ ] 1.3 Create `src/config/env.ts` and `src/config/db.ts` supporting `DB_*` fields with `DATABASE_URL` fallback and a `checkDbHealth()` helper.

- [ ] 2. Implement Utilities, Middleware, and Zod Validators
  - [ ] 2.1 Create `src/utils/AppError.ts` and `src/utils/logger.ts` (structured JSON logging).
  - [ ] 2.2 Create `src/middleware/requestLogger.ts` (`X-Request-Id` correlation), `src/middleware/validate.ts` (Zod wrapper), `src/middleware/auth.ts` (`authenticateJwt` + `requireRole('ADMIN')`), and `src/middleware/errorHandler.ts` (sanitized error responses).
  - [ ] 2.3 Create `src/validators/auth.validator.ts`, `src/validators/customer.validator.ts`, `src/validators/transaction.validator.ts`, and `src/validators/goal.validator.ts` referencing `src/constants/domain.constants.ts`.

- [ ] 3. Implement Parameterized SQL Repositories
  - [ ] 3.1 Create `src/repositories/user.repository.ts` and `src/repositories/customer.repository.ts` (paginated customer search joined with `v_customer_portfolio_summary`, plus customer detail, risk profile, and accounts).
  - [ ] 3.2 Create `src/repositories/portfolio.repository.ts` (querying `v_customer_portfolio_positions` and `accounts`) and `src/repositories/transaction.repository.ts` (parameterized filters + allowlisted `ORDER BY`).
  - [ ] 3.3 Create `src/repositories/goal.repository.ts` (select, insert using `goal_id_seq`, and `PATCH` update explicitly setting `modified_at = NOW()` and `modified_by`) and `src/repositories/import.repository.ts` (checksum check, existing IDs lookup, batch & rejection inserts).

- [ ] 4. Implement Domain Services
  - [ ] 4.1 Create `src/services/auth.service.ts` (`bcryptjs` verification + `HS256` JWT signing) and `src/services/customer.service.ts`.
  - [ ] 4.2 Create `src/services/portfolio.service.ts` (account totals, asset-class allocation percentages, freshness dates, and zero-position handling for customers like `C0001`).
  - [ ] 4.3 Create `src/services/transaction.service.ts`, `src/services/instrument.service.ts`, and `src/services/goal.service.ts` (`funded_percentage`, `is_overdue`, `is_overfunded`).
  - [ ] 4.4 Create `src/services/transactionImport.service.ts` (SHA-256 deduplication, CSV header check, in-memory row validation for all anomaly classes, and single-transaction `BEGIN ... COMMIT` persistence).

- [ ] 5. Implement Thin Controllers, Routes, App, and Server
  - [ ] 5.1 Create thin controllers in `src/controllers/` (`health`, `auth`, `customer`, `portfolio`, `transaction`, `goal`, `instrument`, `adminImport`).
  - [ ] 5.2 Wire routes in `src/routes/` (`health`, `auth`, `customer`, `goal`, `instrument`, `adminImport`, and `index.ts` under `/api/v1`).
  - [ ] 5.3 Create `src/app.ts` (`helmet`, `cors`, `express.json()`, `/api-docs` Swagger UI from `docs/openapi.yaml`, `/api/v1`, `errorHandler`) and `src/server.ts` (graceful shutdown).

- [ ] 6. Write Automated Unit & Integration Tests
  - [ ] 6.1 Create `tests/transactionImport.unit.test.ts` testing duplicate IDs, invalid FK `I9999`, negative fee amounts, future trade dates, and missing CSV headers.
  - [ ] 6.2 Create `tests/api.integration.test.ts` using Vitest + Supertest covering `/health`, `/auth/login`, RBAC (`VIEWER` 403 on CSV import), `/customers/:id/portfolio` (`C0001` & `C0002`), `/customers/:id/transactions` filters, `/goals` create/patch validation, and `/admin/imports/transactions`.