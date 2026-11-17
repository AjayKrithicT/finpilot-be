BEGIN;

-- View 1: Position-level valuation & unrealised P&L
CREATE OR REPLACE VIEW v_customer_portfolio_positions AS
SELECT
  a.customer_id,
  a.account_id,
  a.account_type,
  a.provider,
  a.status AS account_status,
  h.holding_id,
  h.snapshot_date,
  i.instrument_id,
  i.symbol,
  i.instrument_name,
  i.asset_class,
  i.sector,
  i.exchange,
  i.risk_band,
  h.quantity,
  h.avg_cost,
  i.last_price,
  i.price_as_of,
  ROUND(h.quantity * h.avg_cost, 2) AS cost_basis,
  ROUND(h.quantity * i.last_price, 2) AS market_value,
  ROUND((h.quantity * i.last_price) - (h.quantity * h.avg_cost), 2) AS unrealised_gain_loss,
  CASE
    WHEN h.avg_cost > 0 THEN ROUND(((i.last_price - h.avg_cost) / h.avg_cost) * 100, 2)
    ELSE 0
  END AS unrealised_gain_loss_pct
FROM holdings_snapshot h
JOIN accounts a ON a.account_id = h.account_id
JOIN instruments i ON i.instrument_id = h.instrument_id
WHERE h.is_active = TRUE
  AND a.is_active = TRUE
  AND i.is_active = TRUE;

-- View 2: Customer-level consolidated AUM & data freshness
CREATE OR REPLACE VIEW v_customer_portfolio_summary AS
SELECT
  c.customer_id,
  c.full_name,
  c.segment,
  c.kyc_status,
  COALESCE(SUM(p.cost_basis), 0)::NUMERIC(18, 2) AS total_cost_basis,
  COALESCE(SUM(p.market_value), 0)::NUMERIC(18, 2) AS total_market_value,
  COALESCE(SUM(p.unrealised_gain_loss), 0)::NUMERIC(18, 2) AS total_unrealised_gain_loss,
  MAX(p.snapshot_date) AS latest_snapshot_date,
  MAX(p.price_as_of) AS latest_price_as_of
FROM customers c
LEFT JOIN v_customer_portfolio_positions p ON p.customer_id = c.customer_id
WHERE c.is_active = TRUE
GROUP BY c.customer_id, c.full_name, c.segment, c.kyc_status;

-- View 3: Data-quality & reconciliation exceptions
CREATE OR REPLACE VIEW v_reconciliation_exceptions AS
SELECT
  r.rejection_id,
  b.batch_id,
  b.entity_type,
  b.file_name,
  r.row_number,
  r.record_identifier,
  r.error_code,
  r.error_reason,
  r.raw_payload,
  r.created_at AS detected_at
FROM import_rejections r
JOIN import_batches b ON b.batch_id = r.batch_id
WHERE r.is_active = TRUE
  AND b.is_active = TRUE;

COMMIT;