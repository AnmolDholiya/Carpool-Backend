import { Router } from 'express';
import { getMe, uploadProfilePhoto, updateProfile, uploadLicense, getDashboardStats, getPublicProfile, submitRating, getNotifications, markNotificationAsRead, getMyRides } from '../controllers/userController';
import { requireAuth } from '../middleware/authMiddleware';
import { upload } from '../middleware/uploadMiddleware';

const router = Router();

// Protected route: requires a valid JWT token
router.get('/me', requireAuth, getMe);
router.get('/me/dashboard', requireAuth, getDashboardStats);
router.get('/me/rides', requireAuth, getMyRides);
router.get('/profile/:id', requireAuth, getPublicProfile);
router.put('/me', requireAuth, upload.fields([
    { name: 'profile_photo', maxCount: 1 },
    { name: 'id_card_photo', maxCount: 1 },
]), updateProfile);
router.post('/me/profile-photo', requireAuth, upload.single('photo'), uploadProfilePhoto);
router.post('/me/license', requireAuth, upload.single('license_pdf'), uploadLicense);
router.post('/rate', requireAuth, submitRating);
router.get('/notifications', requireAuth, getNotifications);
router.patch('/notifications/:id/read', requireAuth, markNotificationAsRead);

export default router;
