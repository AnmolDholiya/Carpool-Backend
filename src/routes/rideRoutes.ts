import { Router } from 'express';
import { createRide, getRideById, searchRides } from '../controllers/rideController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.post('/', requireAuth as any, createRide);
router.get('/search', searchRides);
router.get('/:id', getRideById);

export default router;


