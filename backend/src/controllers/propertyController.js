import { asyncHandler } from '../utils/asyncHandler.js';
import * as propertyService from '../services/propertyService.js';

export const listHostels = asyncHandler(async (req, res) => res.json({ success: true, data: await propertyService.listHostels(req.user, req.query) }));
export const getHostel = asyncHandler(async (req, res) => res.json({ success: true, data: await propertyService.getHostel(req.user, req.params.hostelId) }));
export const createHostel = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: { hostel: await propertyService.createHostel(req.user, req.body) } }));
export const assignHostelOwner = asyncHandler(async (req, res) => res.json({ success: true, data: { hostel: await propertyService.assignHostelOwner(req.user, req.params.hostelId, req.body.ownerId) } }));
export const setHostelBlocked = asyncHandler(async (req, res) => res.json({ success: true, data: { hostel: await propertyService.setHostelBlocked(req.user, req.params.hostelId, req.body.blocked, req.body.reason) } }));
export const updateHostel = asyncHandler(async (req, res) => res.json({ success: true, data: { hostel: await propertyService.updateHostel(req.user, req.params.hostelId, req.body) } }));
export const deleteHostel = asyncHandler(async (req, res) => res.json({ success: true, data: await propertyService.softDeleteHostel(req.user, req.params.hostelId, req.body.reason) }));
export const listRooms = asyncHandler(async (req, res) => res.json({ success: true, data: await propertyService.listRooms(req.user, req.params.hostelId, req.query) }));
export const createRoom = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: { room: await propertyService.createRoom(req.user, req.params.hostelId, req.body) } }));
export const updateRoom = asyncHandler(async (req, res) => res.json({ success: true, data: { room: await propertyService.updateRoom(req.user, req.params.roomId, req.body) } }));
export const deleteRoom = asyncHandler(async (req, res) => res.json({ success: true, data: await propertyService.softDeleteRoom(req.user, req.params.roomId, req.body.reason) }));
export const roomHistory = asyncHandler(async (req, res) => res.json({ success: true, data: await propertyService.getRoomHistory(req.user, req.params.roomId) }));
export const roomDetails = asyncHandler(async (req, res) => res.json({ success: true, data: await propertyService.getRoomDetails(req.user, req.params.roomId) }));
