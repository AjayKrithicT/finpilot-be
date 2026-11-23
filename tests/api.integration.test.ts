/**
 * Integration tests — Supertest against the real Express app + live PostgreSQL.
 *
 * Prerequisites: `npm run db:setup` must have been run so the seeded data exists.
 * Run with:  npm test
 *
 * Coverage:
 *  - GET  /api/v1/health           → 200 + X-Request-Id header
 *  - POST /api/v1/auth/login       → 200 ADMIN, 200 VIEWER, 401 bad password
 *  - GET  /api/v1/customers        → search, pagination
 *  - GET  /api/v1/customers/:id    → 200 known, 404 unknown
 *  - GET  /api/v1/customers/C0001/portfolio  → 0 totals, empty arrays
 *  - GET  /api/v1/customers/C0002/portfolio  → non-zero totals, accounts, allocation
 *  - GET  /api/v1/customers/:id/transactions → filters, pagination
 *  - GET  /api/v1/customers/:id/goals        → list
 *  - POST /api/v1/customers/:id/goals        → 201 created, 400 on invalid input
 *  - PATCH /api/v1/goals/:goalId             → 200 updated, 400 on invalid, 404 unknown
 *  - GET  /api/v1/instruments      → non-empty array
 *  - POST /api/v1/admin/imports/transactions → 403 VIEWER, 200 ADMIN mixed, 409 duplicate
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import pool from '../src/config/db';

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
let adminToken = '';
let viewerToken = '';
let createdGoalId = '';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@finpilot.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';
const VIEWER_EMAIL = process.env.SEED_VIEWER_EMAIL ?? 'viewer@finpilot.local';
const VIEWER_PASSWORD = process.env.SEED_VIEWER_PASSWORD ?? 'Viewer@123';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
beforeAll(async () => {
  // Obtain tokens once; reuse across all tests
  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  adminToken = adminRes.body.token as string;

  const viewerRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: VIEWER_EMAIL, password: VIEWER_PASSWORD });
  viewerToken = viewerRes.body.token as string;
});

afterAll(async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// 1. Health
// ---------------------------------------------------------------------------
describe('GET /api/v1/health', () => {
  it('returns 200 with db connected and X-Request-Id header', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.uptime_seconds).toBeTypeOf('number');
    expect(res.headers['x-request-id']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Auth
// ---------------------------------------------------------------------------
describe('POST /api/v1/auth/login', () => {
  it('returns 200 and a JWT for valid ADMIN credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.user.email).toBe(ADMIN_EMAIL);
  });

  it('returns 200 and a JWT for valid VIEWER credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: VIEWER_EMAIL, password: VIEWER_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user.role).toBe('VIEWER');
  });

  it('returns 401 for a wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'wrong_password' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 for a non-existent email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'irrelevant' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 400 for missing password field', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 for requests without a Bearer token on protected routes', async () => {
    const res = await request(app).get('/api/v1/customers');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

// ---------------------------------------------------------------------------
// 3. Customers — list & search
// ---------------------------------------------------------------------------
describe('GET /api/v1/customers', () => {
  it('returns paginated customer list with portfolio totals', async () => {
    const res = await request(app)
      .get('/api/v1/customers')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 20,
    });
    expect(res.body.pagination.total_items).toBeGreaterThan(0);
    // Every summary should have a numeric total_market_value
    for (const c of res.body.data as Array<{ total_market_value: unknown }>) {
      expect(typeof c.total_market_value).toBe('number');
    }
  });

  it('filters by kyc_status=VERIFIED', async () => {
    const res = await request(app)
      .get('/api/v1/customers?kyc_status=VERIFIED')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    for (const c of res.body.data as Array<{ kyc_status: string }>) {
      expect(c.kyc_status).toBe('VERIFIED');
    }
  });

  it('applies search across full_name', async () => {
    const res = await request(app)
      .get('/api/v1/customers?search=Rohan')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(
      (res.body.data as Array<{ full_name: string }>).some((c) =>
        c.full_name.toLowerCase().includes('rohan'),
      ),
    ).toBe(true);
  });

  it('respects page and limit params', async () => {
    const res = await request(app)
      .get('/api/v1/customers?page=1&limit=2')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect((res.body.data as unknown[]).length).toBeLessThanOrEqual(2);
    expect(res.body.pagination.limit).toBe(2);
  });

  it('returns 400 for invalid limit value', async () => {
    const res = await request(app)
      .get('/api/v1/customers?limit=abc')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 4. Customer detail
// ---------------------------------------------------------------------------
describe('GET /api/v1/customers/:id', () => {
  it('returns full customer detail for C0001', async () => {
    const res = await request(app)
      .get('/api/v1/customers/C0001')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.customer_id).toBe('C0001');
    expect(res.body.full_name).toBeTypeOf('string');
    expect(Array.isArray(res.body.accounts)).toBe(true);
    // risk_profile may be null or an object
    expect(res.body).toHaveProperty('risk_profile');
  });

  it('returns 404 for an unknown customer ID', async () => {
    const res = await request(app)
      .get('/api/v1/customers/UNKNOWN_XYZ')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CUSTOMER_NOT_FOUND');
    expect(res.body.error.request_id).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Portfolio — C0001 (zero positions) and C0002 (with holdings)
// ---------------------------------------------------------------------------
describe('GET /api/v1/customers/:id/portfolio', () => {
  it('C0001: returns 200 with zero totals and empty positions/allocation arrays', async () => {
    const res = await request(app)
      .get('/api/v1/customers/C0001/portfolio')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.customer_id).toBe('C0001');
    expect(res.body.totals.total_market_value).toBe(0);
    expect(res.body.totals.total_cost_basis).toBe(0);
    expect(res.body.totals.total_unrealised_gain_loss).toBe(0);
    expect(res.body.totals.total_unrealised_gain_loss_pct).toBe(0);
    expect(res.body.positions).toHaveLength(0);
    expect(res.body.allocation_by_asset_class).toHaveLength(0);
    // accounts array should still be populated with C0001's accounts
    expect(Array.isArray(res.body.accounts)).toBe(true);
  });

  it('C0002: returns non-zero totals, populated positions, and valid allocation percentages', async () => {
    const res = await request(app)
      .get('/api/v1/customers/C0002/portfolio')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.customer_id).toBe('C0002');
    expect(res.body.totals.total_market_value).toBeGreaterThan(0);
    expect(Array.isArray(res.body.positions)).toBe(true);
    expect((res.body.positions as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.allocation_by_asset_class)).toBe(true);
    expect((res.body.allocation_by_asset_class as unknown[]).length).toBeGreaterThan(0);

    // allocation_pct values must sum to ~100
    const totalPct = (
      res.body.allocation_by_asset_class as Array<{ allocation_pct: number }>
    ).reduce((sum, a) => sum + a.allocation_pct, 0);
    expect(totalPct).toBeGreaterThan(99);
    expect(totalPct).toBeLessThanOrEqual(100.01);

    // portfolio math consistency: total_market_value == sum of account market values
    const accountTotal = (
      res.body.accounts as Array<{ market_value: number }>
    ).reduce((sum, a) => sum + a.market_value, 0);
    expect(Math.abs(accountTotal - res.body.totals.total_market_value)).toBeLessThan(0.02);
  });

  it('returns 404 for an unknown customer', async () => {
    const res = await request(app)
      .get('/api/v1/customers/NO_SUCH/portfolio')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CUSTOMER_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// 6. Transactions
// ---------------------------------------------------------------------------
describe('GET /api/v1/customers/:id/transactions', () => {
  it('returns paginated transactions for C0002', async () => {
    const res = await request(app)
      .get('/api/v1/customers/C0002/transactions')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination.page).toBe(1);
  });

  it('filters by transaction_type=BUY', async () => {
    const res = await request(app)
      .get('/api/v1/customers/C0002/transactions?transaction_type=BUY')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    for (const tx of res.body.data as Array<{ transaction_type: string }>) {
      expect(tx.transaction_type).toBe('BUY');
    }
  });

  it('filters by status=SETTLED', async () => {
    const res = await request(app)
      .get('/api/v1/customers/C0002/transactions?status=SETTLED')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    for (const tx of res.body.data as Array<{ status: string }>) {
      expect(tx.status).toBe('SETTLED');
    }
  });

  it('applies from_date and to_date range filters', async () => {
    const res = await request(app)
      .get('/api/v1/customers/C0002/transactions?from_date=2024-01-01&to_date=2025-12-31')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    for (const tx of res.body.data as Array<{ trade_date: string }>) {
      expect(tx.trade_date >= '2024-01-01').toBe(true);
      expect(tx.trade_date <= '2025-12-31').toBe(true);
    }
  });

  it('sorts by amount DESC', async () => {
    const res = await request(app)
      .get('/api/v1/customers/C0002/transactions?sort_by=amount&sort_dir=desc&limit=5')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    const amounts = (res.body.data as Array<{ amount: number }>).map((t) => t.amount);
    for (let i = 1; i < amounts.length; i++) {
      expect(amounts[i - 1]).toBeGreaterThanOrEqual(amounts[i] as number);
    }
  });

  it('returns 400 for an invalid sort_by value', async () => {
    const res = await request(app)
      .get('/api/v1/customers/C0002/transactions?sort_by=injected_column')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('scopes results to the requested customer — C0001 sees no C0002 transactions', async () => {
    // Get C0002 transactions
    const c2Res = await request(app)
      .get('/api/v1/customers/C0002/transactions?limit=100')
      .set('Authorization', `Bearer ${viewerToken}`);

    const c2Ids = new Set(
      (c2Res.body.data as Array<{ transaction_id: string }>).map((t) => t.transaction_id),
    );

    // Get C0001 transactions — none of the IDs should overlap with C0002's
    const c1Res = await request(app)
      .get('/api/v1/customers/C0001/transactions?limit=100')
      .set('Authorization', `Bearer ${viewerToken}`);

    for (const tx of c1Res.body.data as Array<{ transaction_id: string }>) {
      expect(c2Ids.has(tx.transaction_id)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Goals
// ---------------------------------------------------------------------------
describe('Goals CRUD', () => {
  it('GET /customers/C0001/goals returns goal list with derived fields', async () => {
    const res = await request(app)
      .get('/api/v1/customers/C0001/goals')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const g of res.body as Array<{
      funded_percentage: number;
      is_overdue: boolean;
      is_overfunded: boolean;
      target_amount: number;
      current_funded_amount: number;
    }>) {
      expect(typeof g.funded_percentage).toBe('number');
      expect(typeof g.is_overdue).toBe('boolean');
      expect(typeof g.is_overfunded).toBe('boolean');
      // Consistency: funded_percentage == ROUND(funded/target*100, 2)
      const expected = Math.round((g.current_funded_amount / g.target_amount) * 100 * 100) / 100;
      expect(Math.abs(g.funded_percentage - expected)).toBeLessThan(0.01);
    }
  });

  it('POST /customers/C0002/goals creates a goal and returns 201', async () => {
    const res = await request(app)
      .post('/api/v1/customers/C0002/goals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        goal_type: 'EDUCATION',
        goal_name: 'Integration Test Goal',
        target_amount: 500000,
        current_funded_amount: 100000,
        target_date: '2035-06-30',
        priority: 'HIGH',
      });

    expect(res.status).toBe(201);
    expect(res.body.goal_id).toBeTypeOf('string');
    expect(res.body.customer_id).toBe('C0002');
    expect(res.body.funded_percentage).toBeCloseTo(20, 1);
    expect(res.body.is_overfunded).toBe(false);

    createdGoalId = res.body.goal_id as string;
  });

  it('POST /customers/:id/goals returns 400 when target_amount <= 0', async () => {
    const res = await request(app)
      .post('/api/v1/customers/C0002/goals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        goal_type: 'TRAVEL',
        goal_name: 'Bad Goal',
        target_amount: 0,         // invalid
        current_funded_amount: 0,
        target_date: '2030-01-01',
        priority: 'LOW',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = (res.body.error.details as Array<{ field: string }> | undefined)?.map(
      (d) => d.field,
    );
    expect(fields).toContain('target_amount');
  });

  it('POST /customers/:id/goals returns 400 when current_funded_amount < 0', async () => {
    const res = await request(app)
      .post('/api/v1/customers/C0002/goals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        goal_type: 'TRAVEL',
        goal_name: 'Negative Fund',
        target_amount: 10000,
        current_funded_amount: -1,  // invalid
        target_date: '2030-01-01',
        priority: 'LOW',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /customers/:id/goals returns 400 for invalid date format', async () => {
    const res = await request(app)
      .post('/api/v1/customers/C0002/goals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        goal_type: 'TRAVEL',
        goal_name: 'Bad Date',
        target_amount: 10000,
        current_funded_amount: 0,
        target_date: '30-01-2030',  // wrong format
        priority: 'LOW',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH /goals/:goalId updates the goal and recomputes derived fields', async () => {
    // createdGoalId is set by the POST test above; skip gracefully if missing
    if (!createdGoalId) return;

    const res = await request(app)
      .patch(`/api/v1/goals/${createdGoalId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ current_funded_amount: 250000 });

    expect(res.status).toBe(200);
    expect(res.body.current_funded_amount).toBe(250000);
    expect(res.body.funded_percentage).toBeCloseTo(50, 1);
  });

  it('PATCH /goals/:goalId returns 404 for an unknown goalId', async () => {
    const res = await request(app)
      .patch('/api/v1/goals/G99999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ goal_name: 'Ghost Goal' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('GOAL_NOT_FOUND');
  });

  it('PATCH /goals/:goalId returns 400 when body is empty', async () => {
    if (!createdGoalId) return;

    const res = await request(app)
      .patch(`/api/v1/goals/${createdGoalId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// 8. Instruments
// ---------------------------------------------------------------------------
describe('GET /api/v1/instruments', () => {
  it('returns a non-empty array of instrument options', async () => {
    const res = await request(app)
      .get('/api/v1/instruments')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as unknown[]).length).toBeGreaterThan(0);
    const first = res.body[0] as {
      instrument_id: string;
      symbol: string;
      asset_class: string;
    };
    expect(first.instrument_id).toBeDefined();
    expect(first.symbol).toBeDefined();
    expect(first.asset_class).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 9. Admin CSV import
// ---------------------------------------------------------------------------
describe('POST /api/v1/admin/imports/transactions', () => {
  const TODAY = new Date().toISOString().slice(0, 10);

  function csvBuffer(rows: string[]): Buffer {
    const header =
      'transaction_id,account_id,instrument_id,transaction_type,trade_date,quantity,price,amount,status';
    return Buffer.from([header, ...rows].join('\n'), 'utf8');
  }

  it('returns 403 when called with a VIEWER token', async () => {
    const buf = csvBuffer([
      `TX_VIEW_001,A00002,I0001,BUY,${TODAY},10,100.00,1000.00,SETTLED`,
    ]);

    const res = await request(app)
      .post('/api/v1/admin/imports/transactions')
      .set('Authorization', `Bearer ${viewerToken}`)
      .attach('file', buf, { filename: 'test.csv', contentType: 'text/csv' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 400 when no file is attached', async () => {
    const res = await request(app)
      .post('/api/v1/admin/imports/transactions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CSV_FORMAT');
  });

  it('ADMIN: imports valid rows and quarantines bad rows', async () => {
    // Keep transaction IDs within VARCHAR(20) — use last 8 digits of timestamp
    const unique = Date.now() % 100000000;
    const buf = csvBuffer([
      `TX_OK_${unique},A00002,I0001,BUY,${TODAY},5,200.00,1000.00,SETTLED`,
      `TX_BAD_${unique},A00002,I9999,BUY,${TODAY},5,200.00,1000.00,SETTLED`, // bad instrument
    ]);

    const res = await request(app)
      .post('/api/v1/admin/imports/transactions')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buf, { filename: `import_${unique}.csv`, contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.total_rows).toBe(2);
    expect(res.body.imported_rows).toBe(1);
    expect(res.body.rejected_rows).toBe(1);
    expect(res.body.batch_id).toBeTypeOf('string');
    expect(res.body.rejections[0].error_code).toBe('INVALID_INSTRUMENT_FK');
  });

  it('returns 409 DUPLICATE_FILE_UPLOAD on second upload of the same file', async () => {
    const unique2 = Date.now() % 100000000;
    const buf = csvBuffer([
      `TX_DUP_${unique2},A00002,I0001,BUY,${TODAY},3,150.00,450.00,SETTLED`,
    ]);
    const filename = `dup_test_${unique2}.csv`;

    // First upload
    const first = await request(app)
      .post('/api/v1/admin/imports/transactions')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buf, { filename, contentType: 'text/csv' });
    expect(first.status).toBe(200);

    // Second upload — same content, same checksum
    const second = await request(app)
      .post('/api/v1/admin/imports/transactions')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buf, { filename, contentType: 'text/csv' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('DUPLICATE_FILE_UPLOAD');
  });

  it('returns 400 INVALID_CSV_FORMAT for missing required headers', async () => {
    const badCsv = Buffer.from(
      'transaction_id,account_id\nTX_BAD_HDR,A00001',
      'utf8',
    );

    const res = await request(app)
      .post('/api/v1/admin/imports/transactions')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', badCsv, { filename: 'bad_headers.csv', contentType: 'text/csv' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CSV_FORMAT');
  });
});
