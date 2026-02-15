import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware';
import { getAllUsers, updateUserRole, deleteUser, getPendingLicenses, verifyLicense } from '../controllers/adminController';

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

export default router;
