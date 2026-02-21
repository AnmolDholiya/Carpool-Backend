import { OAuth2Client } from 'google-auth-library';
import { getConfig } from '../config/config';
import { pool } from '../db/pool';
import { signToken } from '../utils/jwt';

const { googleClientId } = getConfig();
const client = new OAuth2Client(googleClientId);

type GooglePayload = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

export async function verifyGoogleIdToken(idToken: string) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: googleClientId,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email || !payload.sub) {
    throw new Error('Invalid Google token');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? '',
    picture: payload.picture ?? null,
  } as GooglePayload;
}

export async function loginOrRegisterWithGoogle(google: GooglePayload) {
  // Try to find existing user by email
  let result = await pool.query(
    `SELECT user_id, full_name, email, phone, profile_photo, role, email_verified, created_at
     FROM users
     WHERE email = $1`,
    [google.email],
  );

  let user: any;

  if (result.rowCount === 0) {
    // Domain restriction for new users
    const email = google.email.toLowerCase();
    const isUnivEmail = email.endsWith('@charusat.edu.in') || email.endsWith('@charusat.ac.in');

    if (!isUnivEmail) {
      throw new Error('Registration is restricted to Charusat university emails.');
    }

    // Create new user with verified email and no password (cannot login with password)
    result = await pool.query(
      `INSERT INTO users (full_name, email, phone, password, role, profile_photo, email_verified)
       VALUES ($1, $2, $3, $4, 'USER', $5, true)
       RETURNING user_id, full_name, email, phone, profile_photo, role, email_verified, created_at`,
      [google.name || 'Google User', google.email, null, null, google.picture],
    );
  }

  user = result.rows[0];

  const token = signToken({ userId: user.user_id, role: user.role });

  return { token, user };
}


