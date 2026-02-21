import path from 'path';
import type { Request, Response } from 'express';
import { registerUser, loginUser, verifyEmailOtp } from '../services/authService';
import { createEmailOtp } from '../services/otpService';
import { sendOtpEmail } from '../services/emailService';
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

  // Domain restriction for regular users (this endpoint is for regular users)
  if (!isValidUniversityEmail(email)) {
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

    const { user } = await registerUser({
      full_name,
      email,
      phone,
      password,
      profile_photo: photoPath ?? null,
      gender: gender || null,
      id_card_photo: idCardPath ?? null,
    });

    const otp = await createEmailOtp(user.user_id);
    await sendOtpEmail(user.email, otp);

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
      message: 'User registered. Please verify email with the OTP sent to your email address.',
      user_id: user.user_id,
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
  console.log(req.body);

  const { user_id, otp } = req.body;

  if (!user_id || !otp) {
    return res.status(400).json({ message: 'userId and otp are required' });
  }

  try {
    const ok = await verifyEmailOtp(Number(user_id), String(otp));
    if (!ok) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }
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
