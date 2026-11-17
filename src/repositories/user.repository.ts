import pool from '../config/db';
import type { UserRow } from '../types/auth.types';

/**
 * Looks up an active user by email.
 * Returns undefined when no matching active row exists.
 */
export async function findActiveUserByEmail(email: string): Promise<UserRow | undefined> {
  const result = await pool.query<UserRow>(
    `SELECT user_id, email, password_hash, full_name, role, is_active, created_at, modified_at
       FROM users
      WHERE email = $1
        AND is_active = TRUE
      LIMIT 1`,
    [email],
  );
  return result.rows[0];
}

/**
 * Looks up an active user by their UUID primary key.
 * Returns undefined when no matching active row exists.
 */
export async function findActiveUserById(userId: string): Promise<UserRow | undefined> {
  const result = await pool.query<UserRow>(
    `SELECT user_id, email, password_hash, full_name, role, is_active, created_at, modified_at
       FROM users
      WHERE user_id = $1
        AND is_active = TRUE
      LIMIT 1`,
    [userId],
  );
  return result.rows[0];
}
