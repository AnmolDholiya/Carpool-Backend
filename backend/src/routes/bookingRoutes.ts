import { Router } from 'express';
import { cancelBooking, createBooking, getMyBookings, handleBookingAction } from '../controllers/bookingController.js';

import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

router.use(requireAuth);
router.post('/', createBooking);
router.get('/my-bookings', getMyBookings);
router.patch('/:id/cancel', cancelBooking);
router.patch('/:id/action', handleBookingAction);

export default router;


