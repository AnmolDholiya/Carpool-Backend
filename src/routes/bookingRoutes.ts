import { Router } from 'express';
import { cancelBooking, createBooking } from '../controllers/bookingController';

const router = Router();

router.post('/', createBooking);
router.patch('/:id/cancel', cancelBooking);

export default router;


