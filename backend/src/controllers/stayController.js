import { asyncHandler } from '../utils/asyncHandler.js';
import * as stayService from '../services/stayService.js';

export const ownerStays = asyncHandler(async (req, res) => res.json({ success: true, data: await stayService.listOwnerStays(req.user, req.query) }));
export const hostelStays = asyncHandler(async (req, res) => res.json({ success: true, data: await stayService.listHostelStays(req.user, req.params.hostelId, req.query) }));
export const tenantStays = asyncHandler(async (req, res) => res.json({ success: true, data: await stayService.listTenantStays(req.user, req.params.tenantId, req.query) }));
export const getStay = asyncHandler(async (req, res) => res.json({ success: true, data: { stay: await stayService.getStay(req.user, req.params.stayId) } }));
export const markLeft = asyncHandler(async (req, res) => res.json({ success: true, data: { stay: await stayService.markStayLeft(req.user, req.params.stayId, req.body) } }));
