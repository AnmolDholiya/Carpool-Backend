import { Router } from 'express';
import { cancelBooking, createBooking, getMyBookings, handleBookingAction } from '../controllers/bookingController';

import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.use(requireAuth);
router.post('/', createBooking);
router.get('/my-bookings', getMyBookings);
router.patch('/:id/cancel', cancelBooking);
router.patch('/:id/action', handleBookingAction);

export default router;


