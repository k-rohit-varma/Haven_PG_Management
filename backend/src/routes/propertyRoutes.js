import { Router } from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import * as controller from '../controllers/propertyController.js';
import { assignHostelOwnerSchema, createHostelSchema, createRoomSchema, listQuerySchema, roomListQuerySchema, updateHostelSchema, updateRoomSchema, validate } from '../validators/propertyValidators.js';
import { z } from 'zod';

const router = Router();
const reasonSchema = z.object({ reason: z.string().trim().max(300).default('') }).strict();
const blockSchema = z.object({ blocked: z.boolean(), reason: z.string().trim().max(300).default('') }).strict();
const hostelParams = z.object({ hostelId: z.string().regex(/^[a-f\d]{24}$/i) }).strict();

router.use(authenticate);
router.get('/', validate(listQuerySchema, 'query'), controller.listHostels);
router.post('/', authorize('ADMIN'), validate(createHostelSchema), controller.createHostel);
router.patch('/:hostelId/owner', authorize('ADMIN'), validate(hostelParams, 'params'), validate(assignHostelOwnerSchema), controller.assignHostelOwner);
router.patch('/:hostelId/block', authorize('ADMIN'), validate(hostelParams, 'params'), validate(blockSchema), controller.setHostelBlocked);
router.get('/:hostelId/rooms', validate(hostelParams, 'params'), validate(roomListQuerySchema, 'query'), controller.listRooms);
router.post('/:hostelId/rooms', authorize('OWNER', 'ADMIN'), validate(hostelParams, 'params'), validate(createRoomSchema), controller.createRoom);
router.get('/:hostelId', validate(hostelParams, 'params'), controller.getHostel);
router.patch('/:hostelId', authorize('OWNER', 'ADMIN'), validate(hostelParams, 'params'), validate(updateHostelSchema), controller.updateHostel);
router.delete('/:hostelId', authorize('OWNER', 'ADMIN'), validate(hostelParams, 'params'), validate(reasonSchema), controller.deleteHostel);

export default router;
