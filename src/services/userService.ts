import { pool } from '../db/pool';

export async function getUserById(userId: number) {
  const result = await pool.query(
    `SELECT user_id, full_name, email, phone, profile_photo, role, email_verified, license_status, created_at
     FROM users
     WHERE user_id = $1`,
    [userId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

export async function updateUserProfilePhoto(userId: number, relativePath: string) {
  const result = await pool.query(
    `UPDATE users
     SET profile_photo = $1
     WHERE user_id = $2
     RETURNING user_id, full_name, email, phone, profile_photo, role, email_verified, license_status, created_at`,
    [relativePath, userId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

export async function updateUiProfile(
  userId: number,
  data: {
    full_name?: string;
    phone?: string;
    profile_photo?: string;
  },
) {
  // Dynamic query builder could be used, but this is simple enough for now
  // We'll update fields if they are provided (not undefined)

  // Fetch current user first to ensure existence and efficient update
  const currentUser = await getUserById(userId);
  if (!currentUser) return null;

  const newFullName = data.full_name ?? currentUser.full_name;
  const newPhone = data.phone ?? currentUser.phone;
  const newPhoto = data.profile_photo ?? currentUser.profile_photo;

  const result = await pool.query(
    `UPDATE users
     SET full_name = $1, phone = $2, profile_photo = $3
     WHERE user_id = $4
     RETURNING user_id, full_name, email, phone, profile_photo, role, email_verified, license_status, created_at`,
    [newFullName, newPhone, newPhoto, userId],
  );

  return result.rows[0];
}
export async function updateLicense(
  userId: number,
  data: {
    license_no: string;
    license_pdf: string;
    license_expiry_date: string;
  }
) {
  const result = await pool.query(
    `UPDATE users
     SET license_no = $1, license_pdf = $2, license_expiry_date = $3, license_status = 'PENDING'
     WHERE user_id = $4
     RETURNING user_id, full_name, email, phone, profile_photo, role, email_verified, license_no, license_pdf, license_expiry_date, license_status, created_at`,
    [data.license_no, data.license_pdf, data.license_expiry_date, userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}
