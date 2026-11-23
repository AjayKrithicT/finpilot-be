import 'dotenv/config';

function require_env(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional_env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  NODE_ENV: optional_env('NODE_ENV', 'development'),
  PORT: parseInt(optional_env('PORT', '8000'), 10),
  CORS_ORIGIN: optional_env('CORS_ORIGIN', 'http://localhost:3000'),

  // DB individual fields (preferred) — DATABASE_URL is the fallback
  DB_HOST: process.env['DB_HOST'],
  DB_PORT: parseInt(optional_env('DB_PORT', '5432'), 10),
  DB_NAME: process.env['DB_NAME'],
  DB_USER: process.env['DB_USER'],
  DB_PASSWORD: process.env['DB_PASSWORD'],
  DATABASE_URL: process.env['DATABASE_URL'],

  JWT_SECRET: require_env('JWT_SECRET'),
  JWT_EXPIRES_IN: optional_env('JWT_EXPIRES_IN', '8h'),
} as const;

// Validate that at least one DB connection method is present at startup
if (!env.DB_HOST && !env.DATABASE_URL) {
  throw new Error(
    'Database configuration missing: set DB_HOST (+ DB_PORT, DB_NAME, DB_USER, DB_PASSWORD) or DATABASE_URL',
  );
}
