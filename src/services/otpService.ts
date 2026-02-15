import { pool } from '../db/pool';

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function createEmailOtp(userId: number) {
  const otp = generateOtp();
  // 10 minutes from now
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await pool.query(
    `INSERT INTO email_verifications (user_id, otp, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, otp, expiresAt],
  );

  return otp;
}

export async function verifyEmailOtp(userId: number, otp: string) {
  const result = await pool.query(
    `SELECT id, otp, expires_at, used
     FROM email_verifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );

  if (result.rowCount === 0) {
    return false;
  }

  const row = result.rows[0] as {
    id: number;
    otp: string;
    expires_at: Date;
    used: boolean;
  };

  if (row.used) return false;
  if (row.otp !== otp) return false;
  if (new Date(row.expires_at) < new Date()) return false;

  await pool.query(
    `UPDATE email_verifications
     SET used = true
     WHERE id = $1`,
    [row.id],
  );

  await pool.query(
    `UPDATE users
     SET email_verified = true
     WHERE user_id = $1`,
    [userId],
  );

  return true;
}


