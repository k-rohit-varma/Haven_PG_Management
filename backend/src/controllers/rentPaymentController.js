import { asyncHandler } from '../utils/asyncHandler.js';
import * as service from '../services/rentPaymentService.js';

export const listDues = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listRentDues(req.user, req.query) }));
export const getDue = asyncHandler(async (req, res) => res.json({ success: true, data: { rentDue: await service.getRentDue(req.user, req.params.rentDueId) } }));
export const rentSummary = asyncHandler(async (req, res) => res.json({ success: true, data: { summary: await service.getRentSummary(req.user, req.query) } }));
export const recordPayment = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: { payment: await service.recordPayment(req.user, { ...req.body, requestId: req.id }) } }));
export const listPayments = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listPayments(req.user, req.query) }));
export const getPayment = asyncHandler(async (req, res) => res.json({ success: true, data: { payment: await service.getPayment(req.user, req.params.paymentId) } }));
export const paymentHistory = asyncHandler(async (req, res) => {
  const payment = await service.getPayment(req.user, req.params.paymentId);
  res.json({ success: true, data: { items: payment.events } });
});
