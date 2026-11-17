import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { parse } from 'csv-parse/sync';
import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = process.env.DB_HOST
  ? new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'finpilot',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
    })
  : new Pool({ connectionString: process.env.DATABASE_URL });
  
const DATA_DIR = path.resolve(__dirname, '../data');

function readCsv<T = Record<string, string>>(filename: string): { rows: T[]; checksum: string } {
  const raw = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8');
  const checksum = crypto.createHash('sha256').update(raw).digest('hex');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as T[];
  return { rows, checksum };
}

async function seedUsers(client: PoolClient): Promise<string> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@finpilot.local';
  const viewerEmail = process.env.SEED_VIEWER_EMAIL || 'viewer@finpilot.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const viewerPassword = process.env.SEED_VIEWER_PASSWORD;

  if (!adminPassword || !viewerPassword) {
    throw new Error('SEED_ADMIN_PASSWORD and SEED_VIEWER_PASSWORD must be set in .env');
  }

  const adminHash = await bcrypt.hash(adminPassword, 10);
  const viewerHash = await bcrypt.hash(viewerPassword, 10);

  const adminRes = await client.query<{ user_id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, 'ADMIN')
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           full_name = EXCLUDED.full_name
     RETURNING user_id`,
    [adminEmail, adminHash, 'FinPilot Operations Admin']
  );
  const adminId = adminRes.rows[0].user_id;

  await client.query(
    `UPDATE users SET created_by = $1, modified_by = $1 WHERE user_id = $1 AND created_by IS NULL`,
    [adminId]
  );

  await client.query(
    `INSERT INTO users (email, password_hash, full_name, role, created_by, modified_by)
     VALUES ($1, $2, $3, 'VIEWER', $4, $4)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           modified_by = $4`,
    [viewerEmail, viewerHash, 'FinPilot Wealth Viewer', adminId]
  );

  return adminId;
}

async function seedAll() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const adminId = await seedUsers(client);

    // 1. Customers
    const { rows: customers } = readCsv('customers.csv');
    for (const c of customers) {
      await client.query(
        `INSERT INTO customers (
           customer_id, full_name, email, phone, city, state,
           date_of_birth, onboarded_at, kyc_status, segment, created_by, modified_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
         ON CONFLICT (customer_id) DO NOTHING`,
        [
          c.customer_id, c.full_name, c.email, c.phone, c.city, c.state,
          c.date_of_birth, c.onboarded_at, c.kyc_status, c.segment, adminId
        ]
      );
    }

    // 2. Risk Profiles
    const { rows: profiles } = readCsv('risk_profiles.csv');
    for (const r of profiles) {
      await client.query(
        `INSERT INTO risk_profiles (
           customer_id, risk_score, risk_level, assessed_at, horizon_years, liquidity_need, created_by, modified_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
         ON CONFLICT (customer_id) DO NOTHING`,
        [
          r.customer_id, Number(r.risk_score), r.risk_level, r.assessed_at,
          Number(r.horizon_years), r.liquidity_need, adminId
        ]
      );
    }

    // 3. Accounts
    const { rows: accounts } = readCsv('accounts.csv');
    const validAccountIds = new Set<string>();
    for (const a of accounts) {
      validAccountIds.add(a.account_id);
      await client.query(
        `INSERT INTO accounts (
           account_id, customer_id, account_type, provider, opened_at, status, base_currency, created_by, modified_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
         ON CONFLICT (account_id) DO NOTHING`,
        [
          a.account_id, a.customer_id, a.account_type, a.provider,
          a.opened_at, a.status, a.base_currency, adminId
        ]
      );
    }

    // 4. Instruments
    const { rows: instruments } = readCsv('instruments.csv');
    const validInstrumentIds = new Set<string>();
    for (const i of instruments) {
      validInstrumentIds.add(i.instrument_id);
      await client.query(
        `INSERT INTO instruments (
           instrument_id, symbol, instrument_name, asset_class, sector,
           exchange, currency, last_price, price_as_of, risk_band, created_by, modified_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
         ON CONFLICT (instrument_id) DO NOTHING`,
        [
          i.instrument_id, i.symbol, i.instrument_name, i.asset_class,
          i.sector === '' ? null : i.sector, i.exchange, i.currency,
          Number(i.last_price), i.price_as_of, i.risk_band, adminId
        ]
      );
    }

    // 5. Holdings Snapshot (with anomaly quarantine)
    const { rows: holdings, checksum: holdingsChecksum } = readCsv('holdings_snapshot.csv');
    const existingHoldBatch = await client.query(
      `SELECT 1 FROM import_batches WHERE entity_type = 'SEED_HOLDINGS' AND file_checksum = $1`,
      [holdingsChecksum]
    );
    if ((existingHoldBatch.rowCount ?? 0) === 0) {
      const seenHoldings = new Set<string>();
      const validHoldings: typeof holdings = [];
      const rejectedHoldings: Array<{ rowNum: number; id: string; code: string; reason: string; raw: unknown }> = [];

      holdings.forEach((h, idx) => {
        const rowNum = idx + 2;
        const compositeKey = `${h.account_id}:${h.instrument_id}:${h.snapshot_date}`;
        if (seenHoldings.has(compositeKey)) {
          rejectedHoldings.push({
            rowNum,
            id: compositeKey,
            code: 'DUPLICATE_POSITION',
            reason: `Duplicate holding snapshot for (${h.account_id}, ${h.instrument_id}, ${h.snapshot_date})`,
            raw: h,
          });
        } else if (!validAccountIds.has(h.account_id) || !validInstrumentIds.has(h.instrument_id)) {
          rejectedHoldings.push({
            rowNum,
            id: compositeKey,
            code: 'INVALID_FOREIGN_KEY',
            reason: 'Account ID or Instrument ID does not exist',
            raw: h,
          });
        } else {
          seenHoldings.add(compositeKey);
          validHoldings.push(h);
        }
      });

      const batchRes = await client.query<{ batch_id: string }>(
        `INSERT INTO import_batches (
           entity_type, file_name, file_checksum, total_rows, imported_rows, rejected_rows, status, created_by, modified_by
         ) VALUES ('SEED_HOLDINGS', 'holdings_snapshot.csv', $1, $2, $3, $4, 'COMPLETED', $5, $5)
         RETURNING batch_id`,
        [holdingsChecksum, holdings.length, validHoldings.length, rejectedHoldings.length, adminId]
      );
      const batchId = batchRes.rows[0].batch_id;

      for (const h of validHoldings) {
        await client.query(
          `INSERT INTO holdings_snapshot (
             account_id, instrument_id, snapshot_date, quantity, avg_cost, created_by, modified_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$6)`,
          [h.account_id, h.instrument_id, h.snapshot_date, Number(h.quantity), Number(h.avg_cost), adminId]
        );
      }

      for (const rej of rejectedHoldings) {
        await client.query(
          `INSERT INTO import_rejections (
             batch_id, row_number, record_identifier, error_code, error_reason, raw_payload, created_by, modified_by
           ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7)`,
          [batchId, rej.rowNum, rej.id, rej.code, rej.reason, JSON.stringify(rej.raw), adminId]
        );
      }
    }

    // 6. Transactions (with anomaly quarantine)
    const { rows: txs, checksum: txChecksum } = readCsv('transactions.csv');
    const existingTxBatch = await client.query(
      `SELECT 1 FROM import_batches WHERE entity_type = 'SEED_TRANSACTIONS' AND file_checksum = $1`,
      [txChecksum]
    );
    if ((existingTxBatch.rowCount ?? 0) === 0) {
      const todayIso = new Date().toISOString().slice(0, 10);
      const seenTxIds = new Set<string>();
      const validTxs: typeof txs = [];
      const rejectedTxs: Array<{ rowNum: number; id: string; code: string; reason: string; raw: unknown }> = [];

      txs.forEach((t, idx) => {
        const rowNum = idx + 2;
        const amount = Number(t.amount);
        const qty = Number(t.quantity);
        const price = Number(t.price);
        const isTrade = t.transaction_type === 'BUY' || t.transaction_type === 'SELL';

        if (seenTxIds.has(t.transaction_id)) {
          rejectedTxs.push({
            rowNum,
            id: t.transaction_id,
            code: 'DUPLICATE_TRANSACTION_ID',
            reason: `Duplicate transaction_id ${t.transaction_id}`,
            raw: t,
          });
        } else if (!validAccountIds.has(t.account_id)) {
          rejectedTxs.push({
            rowNum,
            id: t.transaction_id,
            code: 'INVALID_ACCOUNT_FK',
            reason: `Unknown account_id ${t.account_id}`,
            raw: t,
          });
        } else if (!validInstrumentIds.has(t.instrument_id)) {
          rejectedTxs.push({
            rowNum,
            id: t.transaction_id,
            code: 'INVALID_INSTRUMENT_FK',
            reason: `Unknown instrument_id ${t.instrument_id}`,
            raw: t,
          });
        } else if (t.trade_date > todayIso) {
          rejectedTxs.push({
            rowNum,
            id: t.transaction_id,
            code: 'FUTURE_TRADE_DATE',
            reason: `trade_date ${t.trade_date} is in the future`,
            raw: t,
          });
        } else if (Number.isNaN(amount) || amount <= 0 || qty < 0 || price < 0) {
          rejectedTxs.push({
            rowNum,
            id: t.transaction_id,
            code: 'NON_POSITIVE_AMOUNT',
            reason: `Invalid monetary/quantity values (amount=${t.amount}, quantity=${t.quantity}, price=${t.price})`,
            raw: t,
          });
        } else if (isTrade && (qty <= 0 || price <= 0)) {
          rejectedTxs.push({
            rowNum,
            id: t.transaction_id,
            code: 'INVALID_TRADE_TERMS',
            reason: `${t.transaction_type} requires positive quantity and price`,
            raw: t,
          });
        } else {
          seenTxIds.add(t.transaction_id);
          validTxs.push(t);
        }
      });

      const batchRes = await client.query<{ batch_id: string }>(
        `INSERT INTO import_batches (
           entity_type, file_name, file_checksum, total_rows, imported_rows, rejected_rows, status, created_by, modified_by
         ) VALUES ('SEED_TRANSACTIONS', 'transactions.csv', $1, $2, $3, $4, 'COMPLETED', $5, $5)
         RETURNING batch_id`,
        [txChecksum, txs.length, validTxs.length, rejectedTxs.length, adminId]
      );
      const batchId = batchRes.rows[0].batch_id;

      for (const t of validTxs) {
        await client.query(
          `INSERT INTO transactions (
             transaction_id, account_id, instrument_id, transaction_type,
             trade_date, quantity, price, amount, status, import_batch_id, created_by, modified_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
          [
            t.transaction_id, t.account_id, t.instrument_id, t.transaction_type,
            t.trade_date, Number(t.quantity), Number(t.price), Number(t.amount),
            t.status, batchId, adminId
          ]
        );
      }

      for (const rej of rejectedTxs) {
        await client.query(
          `INSERT INTO import_rejections (
             batch_id, row_number, record_identifier, error_code, error_reason, raw_payload, created_by, modified_by
           ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7)`,
          [batchId, rej.rowNum, rej.id, rej.code, rej.reason, JSON.stringify(rej.raw), adminId]
        );
      }
    }

    // 7. Goals
    const { rows: goals } = readCsv('goals.csv');
    for (const g of goals) {
      await client.query(
        `INSERT INTO goals (
           goal_id, customer_id, goal_type, goal_name, target_amount,
           current_funded_amount, target_date, priority, created_by, modified_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
         ON CONFLICT (goal_id) DO NOTHING`,
        [
          g.goal_id, g.customer_id, g.goal_type, g.goal_name,
          Number(g.target_amount), Number(g.current_funded_amount),
          g.target_date, g.priority, adminId
        ]
      );
    }

    await client.query('COMMIT');
    console.log('[SUCCESS] Database seeded cleanly.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ERROR] Seed failed and rolled back:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seedAll();