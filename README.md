# FinPilot — Backend API

Node.js · Express · TypeScript · PostgreSQL

REST API for the FinPilot Investment Portfolio & Goal Monitoring Platform.  
Runs at `http://localhost:8000/api/v1` · Swagger UI at `http://localhost:8000/api-docs`

---

## Prerequisites

| Requirement | Minimum version |
|-------------|-----------------|
| Node.js | 20 LTS |
| npm | 10 |
| PostgreSQL | 14 |

---

## 1. Environment configuration

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTP port | `8000` |
| `CORS_ORIGIN` | Allowed frontend origin | `http://localhost:3000` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `finpilot` |
| `DB_USER` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | *(your password)* |
| `JWT_SECRET` | HS256 signing secret — min 32 chars | *(random string)* |
| `JWT_EXPIRES_IN` | Token lifetime | `8h` |
| `SEED_ADMIN_EMAIL` | Admin demo account email | `admin@finpilot.local` |
| `SEED_ADMIN_PASSWORD` | Admin demo account password | *(set a strong password)* |
| `SEED_VIEWER_EMAIL` | Viewer demo account email | `viewer@finpilot.local` |
| `SEED_VIEWER_PASSWORD` | Viewer demo account password | *(set a strong password)* |

Alternatively, set `DATABASE_URL` as a full connection string in place of the individual `DB_*` vars.

---

## 2. Create the database

Create an empty PostgreSQL database before running migrations:

```sql
CREATE DATABASE finpilot;
```

---

## 3. Install dependencies

```bash
npm install
```

---

## 4. Run migrations

Applies all SQL files in `migrations/` in order. Already-applied files are skipped:

```bash
npm run db:migrate
```

If a migration fails it logs `[ERROR]` and exits with code 1. Fix the error and re-run; the migration runner skips any file already recorded in `schema_migrations`.

To reset from scratch, drop and recreate the database, then re-run migrations.

---

## 5. Seed data

Loads all CSVs from `data/` into the database. Anomalous rows are quarantined in `import_rejections` rather than rejected outright. Running seed on an already-seeded database is safe — idempotent inserts skip existing rows:

```bash
npm run db:seed
```

Both steps together:

```bash
npm run db:setup
```

---

## 6. Start the server

**Development** (live reload via `tsx watch`):

```bash
npm run dev
```

**Production** (compile then run):

```bash
npm run build
npm start
```

The server starts on `PORT` (default `8000`). Swagger UI is available at `/api-docs`.

---

## 7. Run tests

Integration tests require a running PostgreSQL instance with seeded data (`npm run db:setup`).  
Unit tests mock all database calls and have no external dependencies.

```bash
npm test
```

---

## 8. Demo credentials

After seeding, use the values you set in `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` and  
`SEED_VIEWER_EMAIL` / `SEED_VIEWER_PASSWORD`.

Default values in `.env.example` (change before first use):

| Role | Email | Password |
|------|-------|----------|
| ADMIN | `admin@finpilot.local` | *(set in .env)* |
| VIEWER | `viewer@finpilot.local` | *(set in .env)* |

---

## 9. API overview

All routes are versioned under `/api/v1`. Every protected route requires an `Authorization: Bearer <token>` header obtained from `POST /api/v1/auth/login`.

| Method | Path | Role |
|--------|------|------|
| GET | `/api/v1/health` | Public |
| POST | `/api/v1/auth/login` | Public |
| GET | `/api/v1/customers` | VIEWER + |
| GET | `/api/v1/customers/:id` | VIEWER + |
| GET | `/api/v1/customers/:id/portfolio` | VIEWER + |
| GET | `/api/v1/customers/:id/portfolio/positions` | VIEWER + |
| GET | `/api/v1/customers/:id/transactions` | VIEWER + |
| GET | `/api/v1/customers/:id/goals` | VIEWER + |
| POST | `/api/v1/customers/:id/goals` | VIEWER + |
| PATCH | `/api/v1/goals/:goalId` | VIEWER + |
| GET | `/api/v1/instruments` | VIEWER + |
| POST | `/api/v1/admin/imports/transactions` | ADMIN |
| GET | `/api/v1/admin/imports/transactions/:batchId/rejections` | ADMIN |

Full request/response schemas are documented in `docs/openapi.yaml` and rendered at `/api-docs`.

---

## 10. Docker

Build and start the database + API together:

```bash
# Copy and fill in your values first
cp .env.example .env

docker compose up --build
```

This starts three containers in order:

1. **`db`** — PostgreSQL 16, data persisted in the `pgdata` volume
2. **`api`** — Express API, waits for `db` to be healthy
3. **`db-setup`** — runs `migrate` then `seed` once against `api`, then exits

API is available at `http://localhost:8000/api/v1`  
Swagger UI at `http://localhost:8000/api-docs`

To stop and remove containers (keeps the volume):

```bash
docker compose down
```

To also wipe the database volume:

```bash
docker compose down -v
```

---

## 11. Project structure

```
finpilot-be/
├── data/               Raw CSV datasets (do not edit)
├── docs/               openapi.yaml + ERD
├── migrations/         001_init_schema.sql, 002_views.sql
├── scripts/            migrate.ts, seed.ts
├── src/
│   ├── config/         DB pool, env validation
│   ├── constants/      HTTP status codes, error codes, domain enums
│   ├── controllers/    HTTP handlers (no business logic)
│   ├── middleware/     auth (JWT), errorHandler, requestLogger, validate
│   ├── repositories/   Parameterised SQL queries
│   ├── routes/         Express routers
│   ├── services/       Business logic
│   ├── types/          TypeScript interfaces
│   ├── utils/          AppError, logger
│   └── validators/     Zod schemas
└── tests/
    ├── api.integration.test.ts
    └── transactionImport.unit.test.ts
```
