import { Router } from 'express';
import { getMe, uploadProfilePhoto, updateProfile, uploadLicense } from '../controllers/userController';
import { requireAuth } from '../middleware/authMiddleware';
import { upload } from '../middleware/uploadMiddleware';

const router = Router();

// Protected route: requires a valid JWT token
router.get('/me', requireAuth, getMe);
router.put('/me', requireAuth, upload.single('profile_photo'), updateProfile);
router.post('/me/profile-photo', requireAuth, upload.single('photo'), uploadProfilePhoto);
router.post('/me/license', requireAuth, upload.single('license_pdf'), uploadLicense);

export default router;
