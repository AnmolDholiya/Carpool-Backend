import { Router } from 'express';
import healthRoutes from './healthRoutes';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import adminRoutes from './adminRoutes';
import vehicleRoutes from './vehicleRoutes';
import rideRoutes from './rideRoutes';
import bookingRoutes from './bookingRoutes';
import reportRoutes from './reportRoutes';
import ratingRoutes from './ratingRoutes';
import locationRoutes from './locationRoutes';
import templateRoutes from './templateRoutes';


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


