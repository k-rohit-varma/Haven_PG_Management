import { asyncHandler } from '../utils/asyncHandler.js';
import * as service from '../services/depositService.js';

export const get = asyncHandler(async (req, res) => res.json({ success: true, data: { deposit: await service.getDeposit(req.user, req.params.stayId) } }));
export const transactions = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listDepositTransactions(req.user, req.params.stayId, req.query) }));
export const create = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: { transaction: await service.createDepositTransaction(req.user, req.params.stayId, req.body) } }));
