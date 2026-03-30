import { Router } from 'express';
import { submitRating, checkRating, submitPassengerRating, getRidePassengers, getUserRatings } from '../controllers/ratingController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.post('/', requireAuth as any, submitRating);
router.post('/passenger', requireAuth as any, submitPassengerRating);
router.get('/check', requireAuth as any, checkRating);
router.get('/ride-passengers/:rideId', requireAuth as any, getRidePassengers);
router.get('/user/:userId', getUserRatings);

export default router;
