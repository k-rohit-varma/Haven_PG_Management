import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import * as controller from '../controllers/rentPaymentController.js';
import { paymentDecisionSchema, paymentParamsSchema, paymentQuerySchema, submitPaymentSchema, validate } from '../validators/rentPaymentValidators.js';

const router = Router();
router.use(authenticate);
router.post('/', authorize('TENANT'), validate(submitPaymentSchema), controller.submitPayment);
router.get('/my', authorize('TENANT'), validate(paymentQuerySchema, 'query'), controller.listPayments);
router.get('/owner', authorize('OWNER', 'ADMIN'), validate(paymentQuerySchema, 'query'), controller.listPayments);
router.get('/:paymentId/history', validate(paymentParamsSchema, 'params'), controller.paymentHistory);
router.get('/:paymentId', validate(paymentParamsSchema, 'params'), controller.getPayment);
router.patch('/:paymentId/decision', authorize('OWNER', 'ADMIN'), validate(paymentParamsSchema, 'params'), validate(paymentDecisionSchema), controller.decidePayment);
export default router;
