import { asyncHandler } from '../utils/asyncHandler.js';
import * as stayService from '../services/stayService.js';

export const createApplication = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: { application: await stayService.createApplication(req.user, req.body.hostelId) } }));
export const myApplications = asyncHandler(async (req, res) => res.json({ success: true, data: await stayService.listMyApplications(req.user, req.query) }));
export const ownerApplications = asyncHandler(async (req, res) => res.json({ success: true, data: await stayService.listOwnerApplications(req.user, req.query, req.query.hostelId) }));
export const hostelApplications = asyncHandler(async (req, res) => res.json({ success: true, data: await stayService.listOwnerApplications(req.user, req.query, req.params.hostelId) }));
export const rejectApplication = asyncHandler(async (req, res) => res.json({ success: true, data: { application: await stayService.rejectApplication(req.user, req.params.applicationId, req.body.reason) } }));
export const approveApplication = asyncHandler(async (req, res) => res.json({ success: true, data: { application: await stayService.approveApplication(req.user, req.params.applicationId) } }));
export const cancelApplication = asyncHandler(async (req, res) => res.json({ success: true, data: { application: await stayService.cancelApplication(req.user, req.params.applicationId) } }));
export const approveAndAssign = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: { stay: await stayService.approveAndAssign(req.user, req.params.applicationId, req.body) } }));
export const myStays = asyncHandler(async (req, res) => res.json({ success: true, data: await stayService.listMyStays(req.user, req.query) }));
export const ownerStays = asyncHandler(async (req, res) => res.json({ success: true, data: await stayService.listOwnerStays(req.user, req.query) }));
export const hostelStays = asyncHandler(async (req, res) => res.json({ success: true, data: await stayService.listHostelStays(req.user, req.params.hostelId, req.query) }));
export const tenantStays = asyncHandler(async (req, res) => res.json({ success: true, data: await stayService.listTenantStays(req.user, req.params.tenantId, req.query) }));
export const getStay = asyncHandler(async (req, res) => res.json({ success: true, data: { stay: await stayService.getStay(req.user, req.params.stayId) } }));
export const markLeft = asyncHandler(async (req, res) => res.json({ success: true, data: { stay: await stayService.markStayLeft(req.user, req.params.stayId, req.body) } }));
