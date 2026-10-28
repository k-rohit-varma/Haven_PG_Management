import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import * as controller from '../controllers/tenantController.js';
import { createTenantSchema, rejoinTenantSchema, stayParams, tenantListQuery, tenantParams, updateRentSchema, updateTenantSchema, validateTenant } from '../validators/tenantValidators.js';

const router = Router();
router.use(authenticate, authorize('OWNER', 'ADMIN'));
router.get('/', validateTenant(tenantListQuery, 'query'), controller.list);
router.post('/', validateTenant(createTenantSchema), controller.create);
router.post('/:tenantId/rejoin', validateTenant(tenantParams, 'params'), validateTenant(rejoinTenantSchema), controller.rejoin);
router.get('/:tenantId', validateTenant(tenantParams, 'params'), controller.get);
router.patch('/:tenantId', validateTenant(tenantParams, 'params'), validateTenant(updateTenantSchema), controller.update);
router.patch('/stays/:stayId/rent', validateTenant(stayParams, 'params'), validateTenant(updateRentSchema), controller.updateRent);
export default router;
