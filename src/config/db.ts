import { Pool } from 'pg';
import { env } from './env';

// Prefer individual DB_* variables; fall back to DATABASE_URL for containerised / CI environments.
const pool = new Pool(
  env.DB_HOST
    ? {
        host: env.DB_HOST,
        port: env.DB_PORT,
        database: env.DB_NAME,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      }
    : {
        connectionString: env.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      },
);

pool.on('error', (err) => {
  // Log to stderr without crashing the process; individual queries will surface errors.
  process.stderr.write(`[pg pool] idle client error: ${err.message}\n`);
});

/**
 * Executes SELECT 1 against the pool to verify database reachability.
 * Returns true on success, throws on failure.
 */
export async function checkDbHealth(): Promise<true> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}

export default pool;
