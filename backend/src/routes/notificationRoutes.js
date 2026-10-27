import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import * as controller from '../controllers/notificationController.js';
import { AppError } from '../errors/AppError.js';

const router = Router();
const paramsSchema = z.object({ notificationId: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
function validateParams(req, _res, next) {
  const parsed = paramsSchema.safeParse(req.params);
  if (!parsed.success) return next(new AppError(422, 'Invalid notification identifier.', 'VALIDATION_ERROR'));
  req.params = parsed.data;
  next();
}

router.use(authenticate);
router.get('/', controller.list);
router.patch('/read-all', controller.readAll);
router.patch('/:notificationId/read', validateParams, controller.read);
export default router;
