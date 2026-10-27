import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import * as controller from '../controllers/rentChangeController.js';
import { createRentChangeSchema, decideRentChangeSchema, rentChangeParamsSchema, rentChangeQuerySchema, rentChangeStayParamsSchema, validateRentChange } from '../validators/rentChangeValidators.js';

const router = Router();
router.use(authenticate);
router.post('/', authorize('TENANT'), validateRentChange(createRentChangeSchema), controller.create);
router.get('/my', authorize('TENANT'), validateRentChange(rentChangeQuerySchema, 'query'), controller.mine);
router.get('/owner', authorize('OWNER', 'ADMIN'), validateRentChange(rentChangeQuerySchema, 'query'), controller.owner);
router.get('/stays/:stayId', validateRentChange(rentChangeStayParamsSchema, 'params'), validateRentChange(rentChangeQuerySchema, 'query'), controller.forStay);
router.patch('/:requestId/decision', authorize('OWNER', 'ADMIN'), validateRentChange(rentChangeParamsSchema, 'params'), validateRentChange(decideRentChangeSchema), controller.decide);
export default router;
