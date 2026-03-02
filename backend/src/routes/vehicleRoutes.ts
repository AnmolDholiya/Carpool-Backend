import { Router } from 'express';
import { addVehicle, getMyVehicles, removeVehicle } from '../controllers/vehicleController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/', requireAuth, addVehicle);
router.get('/my', requireAuth, getMyVehicles);
router.delete('/:id', requireAuth, removeVehicle);

export default router;


