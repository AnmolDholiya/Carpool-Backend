import { pool } from '../db/pool';
import { hashPassword, verifyPassword } from '../utils/password';
import { signToken } from '../utils/jwt';

type DbUser = {
  user_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  password: string;
  role: 'USER' | 'ADMIN';
  profile_photo: string | null;
  gender: string | null;
  email_verified: boolean;
  created_at: string;
};

export async function registerUser(input: {
  full_name: string;
  email: string;
  phone: string;
  password: string;
  profile_photo: string | null;
  gender?: string | null;
  id_card_photo?: string | null;
}) {
  const passwordHash = await hashPassword(input.password);

  const result = await pool.query(
    `INSERT INTO users (full_name, email, phone, password, role, profile_photo, gender, id_card_photo)
     VALUES ($1, $2, $3, $4, 'USER', $5, $6, $7)
     RETURNING user_id, full_name, email, phone, role, profile_photo, gender, email_verified, created_at`,
    [
      input.full_name,
      input.email,
      input.phone,
      passwordHash,
      input.profile_photo,
      input.gender ?? null,
      input.id_card_photo ?? null,
    ],
  );

  const user = result.rows[0] as Omit<DbUser, 'password'>;

  const token = signToken({ userId: user.user_id, role: user.role });

  return { token, user };
}

export async function loginUser(input: { email: string; password: string }) {
  const result = await pool.query(
    `SELECT user_id, full_name, email, phone, password, role, profile_photo, email_verified, created_at
     FROM users
     WHERE email = $1`,
    [input.email],
  );

  if (result.rowCount === 0) {
    return null;
  }

  const user = result.rows[0] as DbUser;

  const ok = await verifyPassword(input.password, user.password);
  if (!ok) {
    return null;
  }

  const token = signToken({ userId: user.user_id, role: user.role });

  const { password: _pw, ...safeUser } = user;

  return { token, user: safeUser };
}
