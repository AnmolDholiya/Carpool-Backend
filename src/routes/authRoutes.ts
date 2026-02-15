import { Router } from 'express';
import { login, register, verifyEmail, loginWithGoogle } from '../controllers/authController';
import { upload } from '../middleware/uploadMiddleware';

const router = Router();

// registration now accepts multipart/form-data with a file field "profile_photo"
router.post('/register', upload.single('profile_photo'), register);
router.post('/verify-email', verifyEmail);
router.post('/login', login);
router.post('/google', loginWithGoogle);

export default router;


