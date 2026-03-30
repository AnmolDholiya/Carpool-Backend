import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware';
import { getAllUsers, updateUserRole, deleteUser, getPendingLicenses, verifyLicense, getPendingIdCards, verifyIdCardAdmin, reVerifyIdCard, getUserFullDetails } from '../controllers/adminController';

const router = Router();

// All routes require authentication and ADMIN role
router.use(requireAuth);
router.use(requireRole('ADMIN'));

// Get all users
router.get('/users', getAllUsers);

// Update user role
router.put('/users/:userId/role', updateUserRole);

// Delete user
router.delete('/users/:userId', deleteUser);

// Get users with pending licenses
router.get('/pending-licenses', getPendingLicenses);

// Verify user license
router.post('/verify/:userId', verifyLicense);

// ID card verification
router.get('/pending-id-cards', getPendingIdCards);
router.post('/verify-id-card/:userId', verifyIdCardAdmin);
router.post('/re-verify-id-card/:userId', reVerifyIdCard);

// Get extra details (vehicles, ratings) for a user
router.get('/users/:userId/details', getUserFullDetails);

export default router;
