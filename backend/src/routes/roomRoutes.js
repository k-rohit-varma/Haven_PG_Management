import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/authenticate.js';
import * as controller from '../controllers/propertyController.js';
import { updateRoomSchema, validate } from '../validators/propertyValidators.js';

const router = Router();
const reasonSchema = z.object({ reason: z.string().trim().max(300).default('') }).strict();
const roomParams = z.object({ roomId: z.string().regex(/^[a-f\d]{24}$/i) }).strict();

router.use(authenticate);
router.get('/:roomId', validate(roomParams, 'params'), controller.roomDetails);
router.get('/:roomId/history', authorize('OWNER', 'ADMIN'), validate(roomParams, 'params'), controller.roomHistory);
router.patch('/:roomId', authorize('OWNER', 'ADMIN'), validate(roomParams, 'params'), validate(updateRoomSchema), controller.updateRoom);
router.delete('/:roomId', authorize('OWNER', 'ADMIN'), validate(roomParams, 'params'), validate(reasonSchema), controller.deleteRoom);

export default router;
