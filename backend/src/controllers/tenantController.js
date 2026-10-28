import { asyncHandler } from '../utils/asyncHandler.js';
import * as service from '../services/tenantService.js';

export const create = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.createTenant(req.user, req.body, req.id) }));
export const rejoin = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.rejoinTenant(req.user, req.params.tenantId, req.body, req.id) }));
export const list = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listTenants(req.user, req.query) }));
export const get = asyncHandler(async (req, res) => res.json({ success: true, data: await service.getTenant(req.user, req.params.tenantId) }));
export const update = asyncHandler(async (req, res) => res.json({ success: true, data: { tenant: await service.updateTenant(req.user, req.params.tenantId, req.body, req.id) } }));
export const updateRent = asyncHandler(async (req, res) => res.json({ success: true, data: { stay: await service.updateRent(req.user, req.params.stayId, req.body, req.id) } }));
