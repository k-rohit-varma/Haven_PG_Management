import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import * as controller from '../controllers/stayController.js';
import { applicationParamsSchema, applicationPaginationSchema, assignStaySchema, createApplicationSchema, rejectApplicationSchema, validate } from '../validators/stayValidators.js';
import { z } from 'zod';

const router = Router();
const ownerQuerySchema = applicationPaginationSchema.extend({ hostelId: z.string().regex(/^[a-f\d]{24}$/i).optional() });

router.use(authenticate);
router.post('/', authorize('TENANT'), validate(createApplicationSchema), controller.createApplication);
router.get('/my', authorize('TENANT'), validate(applicationPaginationSchema, 'query'), controller.myApplications);
router.get('/owner', authorize('OWNER', 'ADMIN'), validate(ownerQuerySchema, 'query'), controller.ownerApplications);
router.post('/:applicationId/approve', authorize('OWNER', 'ADMIN'), validate(applicationParamsSchema, 'params'), controller.approveApplication);
router.post('/:applicationId/approve-and-assign', authorize('OWNER', 'ADMIN'), validate(applicationParamsSchema, 'params'), validate(assignStaySchema), controller.approveAndAssign);
router.patch('/:applicationId/decision', authorize('OWNER', 'ADMIN'), validate(applicationParamsSchema, 'params'), validate(rejectApplicationSchema), controller.rejectApplication);
router.post('/:applicationId/cancel', authorize('TENANT'), validate(applicationParamsSchema, 'params'), controller.cancelApplication);

export default router;
