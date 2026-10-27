import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import * as controller from '../controllers/roomChangeController.js';
import { createRoomChangeSchema, roomChangeDecision, roomChangeParams, roomChangeQuery, validateRoomChange } from '../validators/roomChangeValidators.js';

const router = Router();
router.use(authenticate);
router.post('/', authorize('TENANT'), validateRoomChange(createRoomChangeSchema), controller.create);
router.get('/my', authorize('TENANT'), validateRoomChange(roomChangeQuery, 'query'), controller.list);
router.get('/owner', authorize('OWNER', 'ADMIN'), validateRoomChange(roomChangeQuery, 'query'), controller.list);
router.patch('/:requestId/decision', authorize('OWNER', 'ADMIN'), validateRoomChange(roomChangeParams, 'params'), validateRoomChange(roomChangeDecision), controller.decide);
export default router;
