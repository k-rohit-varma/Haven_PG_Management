import { asyncHandler } from '../utils/asyncHandler.js';
import * as service from '../services/notificationService.js';

export const list = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listNotifications(req.user) }));
export const read = asyncHandler(async (req, res) => res.json({ success: true, data: { notification: await service.markRead(req.user, req.params.notificationId) } }));
export const readAll = asyncHandler(async (req, res) => res.json({ success: true, data: await service.markAllRead(req.user) }));
