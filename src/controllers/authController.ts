import path from 'path';
import type { Request, Response } from 'express';
import { registerUser, loginUser, verifyEmailOtp } from '../services/authService';
import { pool } from '../db/pool';
import { supabase } from '../utils/supabase';
import { verifyGoogleIdToken, loginOrRegisterWithGoogle } from '../services/googleAuthService';
import { verifyIdCard } from '../services/idCardVerificationService';


function isStrongPassword(password: string) {
  // At least 8 chars, 1 upper, 1 lower, 1 digit, 1 special character
  const pattern =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
  return pattern.test(password);
}

function isValidUniversityEmail(email: string) {
  const domains = ['charusat.edu.in', 'charusat.ac.in'];
  return domains.some(domain => email.toLowerCase().endsWith(`@${domain}`));
}

// POST /api/auth/register
export async function register(req: Request, res: Response) {
  const { full_name, email, phone, password, profile_photo, gender } = req.body;

  if (!full_name || !email || !phone || !password) {
    return res.status(400).json({
      message: 'full_name, email, phone, password are required',
    });
  }

  // Domain restriction for regular users (admin email is exempt)
  const ADMIN_EMAIL = 'poolingcar1@gmail.com';
  if (!isValidUniversityEmail(email) && email.toLowerCase() !== ADMIN_EMAIL) {
    return res.status(400).json({
      message: 'Registration is restricted to Charusat university emails (@charusat.edu.in or @charusat.ac.in)',
    });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      message:
        'Password must be at least 8 characters and include uppercase, lowercase, digit, and special character',
    });
  }

  try {
    // 0. Early check in local DB to avoid unnecessary external API calls
    const existingUserRes = await pool.query(
      'SELECT user_id, email, email_verified FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (existingUserRes.rowCount && existingUserRes.rowCount > 0) {
      const u = existingUserRes.rows[0];
      if (u.email_verified) {
        return res.status(409).json({ message: 'Email or phone already exists and is verified. Please login.' });
      } else {
        // User exists but is unverified. They might be retrying registration.
        // Instead of a full re-registration, we can just resend the OTP.
        // This is much faster than deleting and re-creating.
        const { error: resendError } = await supabase.auth.resend({
          type: 'signup',
          email: email
        });

        if (resendError) {
          console.error('[Supabase Resend Error]', resendError);
          // If resend fails, they might be stale in Supabase, so we continue to the normal flow
        } else {
          return res.status(200).json({
            message: 'User already registered but not verified. A fresh OTP has been sent to your email.',
            user_id: u.user_id,
            email: email
          });
        }
      }
    }

    // Handle upload.fields() — req.files is a dict keyed by field name
    const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;

    let photoPath: string | null = null;
    if (files?.profile_photo?.[0]) {
      photoPath = `uploads/${path.basename(files.profile_photo[0].path)}`;
    } else if (profile_photo) {
      photoPath = profile_photo;
    }

    let idCardPath: string | null = null;
    if (files?.id_card_photo?.[0]) {
      idCardPath = `uploads/${path.basename(files.id_card_photo[0].path)}`;
    }

    // 1. Sign up user in Supabase Auth (This will trigger the OTP email)
    let { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      console.error('[Supabase SignUp Error]', authError);

      if (authError.message?.toLowerCase().includes('already registered')) {
        try {
          // Targeted search using listUsers with limited results if possible, 
          // but unfortunately the SDK doesn't support email filters in listUsers.
          // We only do this if the user is NOT in our local DB (stale case).
          const { data: listData } = await supabase.auth.admin.listUsers();
          const staleUser = listData?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());

          if (staleUser) {
            await supabase.auth.admin.deleteUser(staleUser.id);
            console.log('[Auth] Deleted stale Supabase Auth user:', staleUser.id);
          }

          const retry = await supabase.auth.signUp({ email, password });
          if (retry.error) throw retry.error;
          authData = retry.data;
        } catch (cleanupErr: any) {
          console.error('[Auth Cleanup Error]', cleanupErr);
          return res.status(400).json({ message: cleanupErr.message || 'Failed to sync authentication record.' });
        }
      } else {
        return res.status(authError.status || 400).json({
          message: String(authError.message || 'Authentication service error')
        });
      }
    }

    // 2. Save additional data in local DB
    const result = await registerUser({
      full_name,
      email,
      phone,
      password,
      profile_photo: photoPath ?? null,
      gender: gender || null,
      id_card_photo: idCardPath ?? null,
    });
    const user = result.user;

    // Fire-and-forget ID card OCR verification
    if (idCardPath) {
      setImmediate(async () => {
        try {
          await verifyIdCard(user.user_id, idCardPath!, email);
        } catch (e) {
          console.error('[ID Card] Background verification error:', e);
        }
      });
    }

    return res.status(201).json({
      message: 'OTP sent to your email address. Please verify to continue.',
      user_id: user.user_id,
      email: email
    });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Email or phone already exists' });
    }
    console.error(err);
    return res.status(500).json({ message: 'Failed to register user' });
  }
}

// POST /api/auth/login
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  try {
    const result = await loginUser({ email, password });
    if (!result) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (!result.user.email_verified) {
      return res.status(403).json({ message: 'Email not verified' });
    }
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to login' });
  }
}

// POST /api/auth/verify-email
export async function verifyEmail(req: Request, res: Response) {
  const { user_id, otp, email } = req.body;

  if ((!user_id && !email) || !otp) {
    return res.status(400).json({ message: 'email (or user_id) and otp are required' });
  }

  try {
    let verificationEmail = email;

    // Fallback: If email is missing (e.g. from older frontend), fetch it from DB
    if (!verificationEmail && user_id) {
      const userRes = await pool.query('SELECT email FROM users WHERE user_id = $1', [user_id]);
      if (userRes && userRes.rowCount && userRes.rowCount > 0) {
        verificationEmail = userRes.rows[0].email;
      }
    }

    if (!verificationEmail) {
      return res.status(400).json({ message: 'Email is required for verification' });
    }

    // 1. Verify OTP with Supabase
    const { error } = await supabase.auth.verifyOtp({
      email: verificationEmail,
      token: otp,
      type: 'signup'
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    // 2. Update local DB status
    await verifyEmailOtp(Number(user_id || 0), String(otp));

    return res.json({ message: 'Email verified successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to verify email' });
  }
}

// POST /api/auth/google
export async function loginWithGoogle(req: Request, res: Response) {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ message: 'idToken is required' });
  }

  try {
    const payload = await verifyGoogleIdToken(idToken);
    const result = await loginOrRegisterWithGoogle(payload);
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(401).json({ message: 'Invalid Google token' });
  }
}
