import { Router } from 'express';
import { login, register, verifyEmail, loginWithGoogle, resendOtp } from '../controllers/authController.js';
import { upload } from '../middleware/uploadMiddleware.js';

const router = Router();

// registration now accepts multipart/form-data with a file field "profile_photo"
router.post('/register', upload.fields([
    { name: 'profile_photo', maxCount: 1 },
    { name: 'id_card_photo', maxCount: 1 },
]), register);
router.post('/verify-email', verifyEmail);
router.post('/resend-otp', resendOtp);
router.post('/login', login);
router.post('/google', loginWithGoogle);

export default router;


