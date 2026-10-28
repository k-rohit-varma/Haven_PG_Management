import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import * as controller from '../controllers/rentPaymentController.js';
import { paymentParamsSchema, paymentQuerySchema, recordPaymentSchema, validate } from '../validators/rentPaymentValidators.js';

const router = Router();
router.use(authenticate);
router.post('/', authorize('OWNER', 'ADMIN'), validate(recordPaymentSchema), controller.recordPayment);
router.get('/owner', authorize('OWNER', 'ADMIN'), validate(paymentQuerySchema, 'query'), controller.listPayments);
router.get('/:paymentId/history', validate(paymentParamsSchema, 'params'), controller.paymentHistory);
router.get('/:paymentId', validate(paymentParamsSchema, 'params'), controller.getPayment);
export default router;
