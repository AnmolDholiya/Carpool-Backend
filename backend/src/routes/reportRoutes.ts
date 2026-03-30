import { Router } from 'express';
import { createReport } from '../controllers/reportController';

const router = Router();

router.post('/', createReport);

export default router;


