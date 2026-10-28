import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { csrfToken, csrfProtection, login, logout, me } from '../controllers/authController.js';
import { authenticate } from '../middleware/authenticate.js';
import { loginSchema, validate } from '../validators/authValidators.js';

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' } } });

router.get('/csrf', csrfToken);
router.post('/login', loginLimiter, csrfProtection, validate(loginSchema), login);
router.post('/logout', csrfProtection, logout);
router.get('/me', authenticate, me);

export default router;
