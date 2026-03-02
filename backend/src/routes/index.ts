import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import adminRoutes from './adminRoutes.js';
import vehicleRoutes from './vehicleRoutes.js';
import rideRoutes from './rideRoutes.js';
import bookingRoutes from './bookingRoutes.js';
import reportRoutes from './reportRoutes.js';
import ratingRoutes from './ratingRoutes.js';
import locationRoutes from './locationRoutes.js';
import templateRoutes from './templateRoutes.js';


const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/rides', rideRoutes);
router.use('/bookings', bookingRoutes);
router.use('/reports', reportRoutes);
router.use('/ratings', ratingRoutes);
router.use('/locations', locationRoutes);
router.use('/templates', templateRoutes);


export default router;


