import { Router } from 'express';
import { addVehicle, getMyVehicles, removeVehicle } from '../controllers/vehicleController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.post('/', requireAuth, addVehicle);
router.get('/my', requireAuth, getMyVehicles);
router.delete('/:id', requireAuth, removeVehicle);

export default router;


