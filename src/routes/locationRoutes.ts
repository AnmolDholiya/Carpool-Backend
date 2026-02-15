import { Router } from 'express';
import { addLocationPoint, listLocationPoints } from '../controllers/locationController';

const router = Router();

router.post('/:rideId', addLocationPoint);
router.get('/:rideId', listLocationPoints);

export default router;


