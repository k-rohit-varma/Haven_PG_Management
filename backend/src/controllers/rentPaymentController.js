import { asyncHandler } from '../utils/asyncHandler.js';
import * as service from '../services/rentPaymentService.js';

export const listDues = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listRentDues(req.user, req.query) }));
export const getDue = asyncHandler(async (req, res) => res.json({ success: true, data: { rentDue: await service.getRentDue(req.user, req.params.rentDueId) } }));
export const rentSummary = asyncHandler(async (req, res) => res.json({ success: true, data: { summary: await service.getRentSummary(req.user, req.query) } }));
export const submitPayment = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: { payment: await service.submitPayment(req.user, req.body) } }));
export const listPayments = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listPayments(req.user, req.query) }));
export const getPayment = asyncHandler(async (req, res) => res.json({ success: true, data: { payment: await service.getPayment(req.user, req.params.paymentId) } }));
export const decidePayment = asyncHandler(async (req, res) => res.json({ success: true, data: { payment: await service.decidePayment(req.user, req.params.paymentId, req.body) } }));
export const paymentHistory = asyncHandler(async (req, res) => {
  const payment = await service.getPayment(req.user, req.params.paymentId);
  res.json({ success: true, data: { items: payment.events } });
});
