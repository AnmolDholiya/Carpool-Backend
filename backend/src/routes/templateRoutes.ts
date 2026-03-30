import { Router } from 'express';
import { createTemplate, getMyTemplates, deleteTemplate } from '../controllers/templateController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

router.post('/', requireAuth as any, createTemplate);
router.get('/my', requireAuth as any, getMyTemplates);
router.delete('/:id', requireAuth as any, deleteTemplate);

export default router;
