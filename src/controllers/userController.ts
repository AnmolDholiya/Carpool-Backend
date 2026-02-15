import path from 'path';
import type { Response } from 'express';
import type { AuthedRequest } from '../middleware/authMiddleware';
import { getUserById, updateUserProfilePhoto, updateUiProfile, updateLicense } from '../services/userService';

// ... (previous functions)

// POST /api/users/me/license
export async function uploadLicense(req: AuthedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const { license_no, license_expiry_date } = req.body;
  if (!license_no || !license_expiry_date) {
    return res.status(400).json({ message: 'License number and expiry date are required' });
  }

  try {
    const filename = path.basename(req.file.path);
    const relativePath = `uploads/${filename}`;

    const user = await updateLicense(req.user.userId, {
      license_no,
      license_pdf: relativePath,
      license_expiry_date,
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({
      message: 'License uploaded successfully and is now pending verification.',
      user,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to upload license' });
  }
}

// GET /api/users/me
export async function getMe(req: AuthedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  const user = await getUserById(req.user.userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json(user);
}

// POST /api/users/me/profile-photo
export async function uploadProfilePhoto(req: AuthedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  // Store relative path like "uploads/filename.jpg"
  const filename = path.basename(req.file.path);
  const relativePath = `uploads/${filename}`;

  const user = await updateUserProfilePhoto(req.user.userId, relativePath);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json({
    message: 'Profile photo updated',
    user,
  });
}

// PUT /api/users/me
export async function updateProfile(req: AuthedRequest, res: Response) {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  const { full_name, phone } = req.body;
  let profile_photo: string | undefined;

  if (req.file) {
    const filename = path.basename(req.file.path);
    profile_photo = `uploads/${filename}`;
  }

  const updateData: { full_name?: string; phone?: string; profile_photo?: string } = {};
  if (full_name) updateData.full_name = full_name;
  if (phone) updateData.phone = phone;
  if (profile_photo) updateData.profile_photo = profile_photo;

  try {
    const user = await updateUiProfile(req.user.userId, updateData);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json(user);
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Phone number already exists' });
    }
    console.error(err);
    return res.status(500).json({ message: 'Failed to update profile' });
  }
}
