import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import * as controller from '../controllers/rentPaymentController.js';
import { rentDueParamsSchema, rentQuerySchema, validate } from '../validators/rentPaymentValidators.js';

const router = Router();
router.use(authenticate);
router.get('/summary', authorize('OWNER', 'ADMIN'), validate(rentQuerySchema, 'query'), controller.rentSummary);
router.post('/reconcile', authorize('OWNER', 'ADMIN'), controller.reconcileDues);
router.get('/hostels/:hostelId', authorize('OWNER', 'ADMIN'), (req, _res, next) => { req.query.hostelId = req.params.hostelId; next(); }, validate(rentQuerySchema, 'query'), controller.listDues);
router.get('/', authorize('OWNER', 'ADMIN'), validate(rentQuerySchema, 'query'), controller.listDues);
router.get('/:rentDueId', authorize('OWNER', 'ADMIN'), validate(rentDueParamsSchema, 'params'), controller.getDue);
export default router;
