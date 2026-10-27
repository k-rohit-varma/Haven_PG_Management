import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/authenticate.js';
import * as controller from '../controllers/stayController.js';
import * as depositController from '../controllers/depositController.js';
import { markLeftSchema, stayPaginationSchema, stayParamsSchema, tenantParamsSchema, validate } from '../validators/stayValidators.js';
import { createDepositSchema, depositParamsSchema, depositQuerySchema, validateDeposit } from '../validators/depositValidators.js';

const router = Router();
const hostelParams = z.object({ hostelId: z.string().regex(/^[a-f\d]{24}$/i) }).strict();

router.use(authenticate);
router.get('/my', authorize('TENANT'), validate(stayPaginationSchema, 'query'), controller.myStays);
router.get('/owner', authorize('OWNER', 'ADMIN'), validate(stayPaginationSchema, 'query'), controller.ownerStays);
router.get('/tenants/:tenantId', authorize('OWNER', 'ADMIN'), validate(tenantParamsSchema, 'params'), validate(stayPaginationSchema, 'query'), controller.tenantStays);
router.get('/hostels/:hostelId', authorize('OWNER', 'ADMIN'), validate(hostelParams, 'params'), validate(stayPaginationSchema, 'query'), controller.hostelStays);
router.get('/:stayId/deposit', validateDeposit(depositParamsSchema, 'params'), depositController.get);
router.get('/:stayId/deposit/transactions', validateDeposit(depositParamsSchema, 'params'), validateDeposit(depositQuerySchema, 'query'), depositController.transactions);
router.post('/:stayId/deposit/transactions', authorize('OWNER', 'ADMIN'), validateDeposit(depositParamsSchema, 'params'), validateDeposit(createDepositSchema), depositController.create);
router.get('/:stayId', validate(stayParamsSchema, 'params'), controller.getStay);
router.post('/:stayId/mark-left', authorize('OWNER', 'ADMIN'), validate(stayParamsSchema, 'params'), validate(markLeftSchema), controller.markLeft);

export default router;
