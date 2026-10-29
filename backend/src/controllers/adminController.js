import { asyncHandler } from '../utils/asyncHandler.js';
import * as service from '../services/adminService.js';

export const users = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listUsers(req.query) }));
export const createOwner = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: { user: await service.createOwner(req.user, req.body, req.id) } }));
export const ownerPassword = asyncHandler(async (req, res) => res.json({ success: true, data: { user: await service.changeOwnerPassword(req.user, req.params.userId, req.body, req.id) } }));
export const summary = asyncHandler(async (_req, res) => res.json({ success: true, data: { summary: await service.getSystemSummary() } }));
export const hostels = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listHostels(req.query) }));
export const rooms = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listRooms(req.query) }));
export const userStatus = asyncHandler(async (req, res) => res.json({ success: true, data: { user: await service.setUserStatus(req.user, req.params.userId, req.body, req.id) } }));
export const userRole = asyncHandler(async (req, res) => res.json({ success: true, data: { user: await service.setUserRole(req.user, req.params.userId, req.body, req.id) } }));
export const auditLogs = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listAuditLogs(req.query) }));
export const restore = asyncHandler(async (req, res) => res.json({ success: true, data: { record: await service.restoreRecord(req.user, req.params.entityType, req.params.entityId, req.body.reason, req.id) } }));
export const financialCorrection = asyncHandler(async (req, res) => res.json({ success: true, data: { correction: await service.correctStayFinancials(req.user, req.params.stayId, req.body, req.id) } }));
