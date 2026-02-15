import { Router } from 'express';
import { createRating } from '../controllers/ratingController';

const router = Router();

router.post('/', createRating);

export default router;


