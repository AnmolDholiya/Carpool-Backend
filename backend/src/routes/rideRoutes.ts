import { Router } from 'express';
import { createRide, getMyRides, getRideById, searchRides, completeRide, cancelRide, getTodayRides, startRide, getLatestLocation } from '../controllers/rideController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/', requireAuth as any, createRide);
router.get('/my-rides', requireAuth as any, getMyRides);
router.get('/today', getTodayRides);
router.get('/search', searchRides);
router.get('/:id', getRideById);
router.patch('/:id/complete', requireAuth as any, completeRide);
router.patch('/:id/cancel', requireAuth as any, cancelRide);
router.patch('/:id/start', requireAuth as any, startRide);
router.get('/:id/location', requireAuth as any, getLatestLocation);

export default router;


