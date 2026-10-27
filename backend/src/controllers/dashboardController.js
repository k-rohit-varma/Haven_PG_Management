import { asyncHandler } from '../utils/asyncHandler.js';
import * as service from '../services/dashboardService.js';

export const owner = asyncHandler(async (req, res) => res.json({ success: true, data: { dashboard: await service.ownerDashboard(req.user, req.query) } }));
export const tenant = asyncHandler(async (req, res) => res.json({ success: true, data: { dashboard: await service.tenantDashboard(req.user) } }));
