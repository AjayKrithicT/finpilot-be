BEGIN;

-- 1. Users (RBAC & Audit Attribution)
CREATE TABLE users (
  user_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(120) NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('VIEWER', 'ADMIN')),
  created_by    UUID         REFERENCES users(user_id),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  modified_by   UUID         REFERENCES users(user_id),
  modified_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);

-- 2. Customers
CREATE TABLE customers (
  customer_id   VARCHAR(16)  PRIMARY KEY,
  full_name     VARCHAR(150) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  phone         VARCHAR(20)  NOT NULL,
  city          VARCHAR(100) NOT NULL,
  state         VARCHAR(10)  NOT NULL,
  date_of_birth DATE         NOT NULL,
  onboarded_at  DATE         NOT NULL,
  kyc_status    VARCHAR(20)  NOT NULL CHECK (kyc_status IN ('VERIFIED', 'PENDING', 'REVIEW')),
  segment       VARCHAR(20)  NOT NULL CHECK (segment IN ('Mass', 'Affluent', 'HNI')),
  created_by    UUID         REFERENCES users(user_id),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  modified_by   UUID         REFERENCES users(user_id),
  modified_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);

-- 3. Risk Profiles (1:1 with Customers)
CREATE TABLE risk_profiles (
  customer_id    VARCHAR(16) PRIMARY KEY REFERENCES customers(customer_id) ON DELETE CASCADE,
  risk_score     SMALLINT    NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_level     VARCHAR(20) NOT NULL CHECK (risk_level IN ('Conservative', 'Moderate', 'Growth', 'Aggressive')),
  assessed_at    DATE        NOT NULL,
  horizon_years  SMALLINT    NOT NULL CHECK (horizon_years > 0),
  liquidity_need VARCHAR(10) NOT NULL CHECK (liquidity_need IN ('LOW', 'MEDIUM', 'HIGH')),
  created_by     UUID        REFERENCES users(user_id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_by    UUID        REFERENCES users(user_id),
  modified_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE
);

-- 4. Accounts
CREATE TABLE accounts (
  account_id    VARCHAR(16)  PRIMARY KEY,
  customer_id   VARCHAR(16)  NOT NULL REFERENCES customers(customer_id),
  account_type  VARCHAR(20)  NOT NULL CHECK (account_type IN ('BROKERAGE', 'MUTUAL_FUND', 'RETIREMENT')),
  provider      VARCHAR(120) NOT NULL,
  opened_at     DATE         NOT NULL,
  status        VARCHAR(20)  NOT NULL CHECK (status IN ('ACTIVE', 'DORMANT', 'CLOSED')),
  base_currency CHAR(3)      NOT NULL DEFAULT 'INR',
  created_by    UUID         REFERENCES users(user_id),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  modified_by   UUID         REFERENCES users(user_id),
  modified_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);

-- 5. Instruments
CREATE TABLE instruments (
  instrument_id   VARCHAR(16)    PRIMARY KEY,
  symbol          VARCHAR(32)    NOT NULL UNIQUE,
  instrument_name VARCHAR(150)   NOT NULL,
  asset_class     VARCHAR(20)    NOT NULL CHECK (asset_class IN ('EQUITY', 'ETF', 'MUTUAL_FUND', 'BOND', 'REIT', 'GSEC')),
  sector          VARCHAR(80),
  exchange        VARCHAR(16)    NOT NULL CHECK (exchange IN ('NSE', 'BSE', 'OTC')),
  currency        CHAR(3)        NOT NULL DEFAULT 'INR',
  last_price      NUMERIC(18, 4) NOT NULL CHECK (last_price > 0),
  price_as_of     DATE           NOT NULL,
  risk_band       VARCHAR(10)    NOT NULL CHECK (risk_band IN ('LOW', 'MEDIUM', 'HIGH')),
  created_by      UUID           REFERENCES users(user_id),
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  modified_by     UUID           REFERENCES users(user_id),
  modified_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  is_active       BOOLEAN        NOT NULL DEFAULT TRUE
);

-- 6. Holdings Snapshot
CREATE TABLE holdings_snapshot (
  holding_id    BIGSERIAL      PRIMARY KEY,
  account_id    VARCHAR(16)    NOT NULL REFERENCES accounts(account_id),
  instrument_id VARCHAR(16)    NOT NULL REFERENCES instruments(instrument_id),
  snapshot_date DATE           NOT NULL,
  quantity      NUMERIC(18, 6) NOT NULL CHECK (quantity > 0),
  avg_cost      NUMERIC(18, 4) NOT NULL CHECK (avg_cost >= 0),
  created_by    UUID           REFERENCES users(user_id),
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  modified_by   UUID           REFERENCES users(user_id),
  modified_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  is_active     BOOLEAN        NOT NULL DEFAULT TRUE,
  CONSTRAINT uq_holdings_account_instrument_date UNIQUE (account_id, instrument_id, snapshot_date)
);

-- 7. Import Batches (Idempotency & Audit Log for CSV Uploads)
CREATE TABLE import_batches (
  batch_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   VARCHAR(30)  NOT NULL,
  file_name     VARCHAR(255) NOT NULL,
  file_checksum VARCHAR(64)  NOT NULL,
  total_rows    INTEGER      NOT NULL CHECK (total_rows >= 0),
  imported_rows INTEGER      NOT NULL CHECK (imported_rows >= 0),
  rejected_rows INTEGER      NOT NULL CHECK (rejected_rows >= 0),
  status        VARCHAR(20)  NOT NULL CHECK (status IN ('COMPLETED', 'FAILED')),
  created_by    UUID         REFERENCES users(user_id),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  modified_by   UUID         REFERENCES users(user_id),
  modified_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE
);

-- 8. Import Rejections (Quarantined Row Anomalies)
CREATE TABLE import_rejections (
  rejection_id      BIGSERIAL   PRIMARY KEY,
  batch_id          UUID        NOT NULL REFERENCES import_batches(batch_id) ON DELETE CASCADE,
  row_number        INTEGER     NOT NULL,
  record_identifier VARCHAR(64),
  error_code        VARCHAR(50) NOT NULL,
  error_reason      TEXT        NOT NULL,
  raw_payload       JSONB       NOT NULL,
  created_by        UUID        REFERENCES users(user_id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_by       UUID        REFERENCES users(user_id),
  modified_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE
);

-- 9. Transactions
CREATE TABLE transactions (
  transaction_id   VARCHAR(20)    PRIMARY KEY,
  account_id       VARCHAR(16)    NOT NULL REFERENCES accounts(account_id),
  instrument_id    VARCHAR(16)    NOT NULL REFERENCES instruments(instrument_id),
  transaction_type VARCHAR(20)    NOT NULL CHECK (transaction_type IN ('BUY', 'SELL', 'DIVIDEND', 'FEE')),
  trade_date       DATE           NOT NULL,
  quantity         NUMERIC(18, 6) NOT NULL CHECK (quantity >= 0),
  price            NUMERIC(18, 4) NOT NULL CHECK (price >= 0),
  amount           NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  status           VARCHAR(20)    NOT NULL CHECK (status IN ('SETTLED', 'PENDING', 'REVERSED')),
  import_batch_id  UUID           REFERENCES import_batches(batch_id),
  created_by       UUID           REFERENCES users(user_id),
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  modified_by      UUID           REFERENCES users(user_id),
  modified_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  is_active        BOOLEAN        NOT NULL DEFAULT TRUE
);

-- 10. Goals + Sequence for new goal IDs (G00178+)
CREATE SEQUENCE goal_id_seq START WITH 178 INCREMENT BY 1;

CREATE TABLE goals (
  goal_id               VARCHAR(16)    PRIMARY KEY DEFAULT ('G' || LPAD(nextval('goal_id_seq')::TEXT, 5, '0')),
  customer_id           VARCHAR(16)    NOT NULL REFERENCES customers(customer_id),
  goal_type             VARCHAR(30)    NOT NULL CHECK (goal_type IN ('WEALTH_CREATION', 'EMERGENCY_FUND', 'EDUCATION', 'HOME_PURCHASE', 'RETIREMENT', 'TRAVEL')),
  goal_name             VARCHAR(150)   NOT NULL,
  target_amount         NUMERIC(18, 2) NOT NULL CHECK (target_amount > 0),
  current_funded_amount NUMERIC(18, 2) NOT NULL CHECK (current_funded_amount >= 0),
  target_date           DATE           NOT NULL,
  priority              VARCHAR(10)    NOT NULL CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  created_by            UUID           REFERENCES users(user_id),
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  modified_by           UUID           REFERENCES users(user_id),
  modified_at           TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  is_active             BOOLEAN        NOT NULL DEFAULT TRUE
);

-- Query-Pattern Indexes
CREATE INDEX idx_customers_city_segment ON customers (city, segment) WHERE is_active = TRUE;
CREATE INDEX idx_customers_full_name ON customers (LOWER(full_name)) WHERE is_active = TRUE;
CREATE INDEX idx_accounts_customer_id ON accounts (customer_id) WHERE is_active = TRUE;
CREATE INDEX idx_holdings_account_snapshot ON holdings_snapshot (account_id, snapshot_date DESC) WHERE is_active = TRUE;
CREATE INDEX idx_holdings_instrument_id ON holdings_snapshot (instrument_id) WHERE is_active = TRUE;
CREATE INDEX idx_transactions_account_trade_date ON transactions (account_id, trade_date DESC) WHERE is_active = TRUE;
CREATE INDEX idx_transactions_instrument_type ON transactions (instrument_id, transaction_type) WHERE is_active = TRUE;
CREATE INDEX idx_transactions_status ON transactions (status) WHERE is_active = TRUE;
CREATE INDEX idx_goals_customer_priority ON goals (customer_id, priority) WHERE is_active = TRUE;
CREATE INDEX idx_import_batches_checksum ON import_batches (entity_type, file_checksum) WHERE is_active = TRUE;
CREATE INDEX idx_import_rejections_batch_id ON import_rejections (batch_id);

COMMIT;