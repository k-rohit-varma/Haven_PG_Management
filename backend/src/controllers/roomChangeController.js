import { asyncHandler } from '../utils/asyncHandler.js';
import * as service from '../services/roomChangeService.js';

export const create = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: { request: await service.createRequest(req.user, req.body) } }));
export const list = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listRequests(req.user, req.query) }));
export const decide = asyncHandler(async (req, res) => res.json({ success: true, data: { request: await service.decideRequest(req.user, req.params.requestId, req.body) } }));
