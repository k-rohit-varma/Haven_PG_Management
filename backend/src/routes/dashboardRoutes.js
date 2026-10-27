import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import * as controller from '../controllers/dashboardController.js';
import { dashboardQuerySchema, validate } from '../validators/rentPaymentValidators.js';

const router = Router();
router.use(authenticate);
router.get('/owner', authorize('OWNER', 'ADMIN'), validate(dashboardQuerySchema, 'query'), controller.owner);
router.get('/tenant', authorize('TENANT'), controller.tenant);
export default router;
