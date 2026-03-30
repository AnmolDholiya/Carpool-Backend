import { pool } from '../db/pool';

/**
 * Marks a user as verified in the local database.
 * The actual OTP verification is now handled by Supabase Auth.
 */
export async function verifyEmailOtp(userId: number, _otp: string) {
  if (!userId) return false;

  await pool.query(
    `UPDATE users
     SET email_verified = true
     WHERE user_id = $1`,
    [userId],
  );

  return true;
}


