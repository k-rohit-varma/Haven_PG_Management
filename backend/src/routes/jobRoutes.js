import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/environment.js';
import { AppError } from '../errors/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { generateRentDues } from '../services/rentPaymentService.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.post('/generate-rent-dues', asyncHandler(async (req, res) => {
  const provided = req.get('x-job-secret') || '';
  const configured = env.JOB_SECRET || '';
  if (!configured) throw new AppError(503, 'Rent generation job is not configured.', 'JOB_NOT_CONFIGURED');
  const providedBuffer = Buffer.from(provided);
  const configuredBuffer = Buffer.from(configured);
  if (providedBuffer.length !== configuredBuffer.length || !timingSafeEqual(providedBuffer, configuredBuffer)) throw new AppError(401, 'Invalid job credentials.', 'INVALID_JOB_SECRET');
  const startedAt = Date.now();
  try {
    const result = await generateRentDues();
    logger.info({ event: 'rent_due_generation_completed', operation: 'generate_rent_dues', requestId: req.id, durationMs: Date.now() - startedAt, checkedCount: result.checked, createdCount: result.created, skippedCount: result.skipped });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ event: 'rent_due_generation_failed', operation: 'generate_rent_dues', requestId: req.id, durationMs: Date.now() - startedAt, errorName: error.name, errorMessage: error.message, ...(process.env.NODE_ENV === 'production' ? {} : { stack: error.stack }) });
    throw error;
  }
}));
export default router;
