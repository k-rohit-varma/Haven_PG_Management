import app from './app.js';
import { env } from './config/environment.js';
import { connectDatabase } from './config/database.js';
import mongoose from 'mongoose';
import { ensureInitialAdmin } from './services/initialAdminService.js';
import { logger } from './utils/logger.js';

let server;
let shuttingDown = false;
try {
  await connectDatabase();
  const initialAdmin = await ensureInitialAdmin();
  if (initialAdmin) logger.info({ event: 'initial_admin_ready' });
  server = app.listen(env.PORT, () => logger.info({ event: 'server_started', port: env.PORT }));
} catch (error) {
  logger.error({ event: 'startup_failed', errorName: error.name, errorMessage: error.message, ...(process.env.NODE_ENV === 'production' ? {} : { stack: error.stack }) });
  process.exit(1);
}

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ event: 'shutdown_started', signal });
  server?.close(async () => { await mongoose.disconnect(); process.exit(exitCode); });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => { logger.error({ event: 'unhandled_rejection', errorMessage: reason instanceof Error ? reason.message : String(reason), ...(process.env.NODE_ENV === 'production' || !(reason instanceof Error) ? {} : { stack: reason.stack }) }); void shutdown('unhandledRejection', 1); });
process.on('uncaughtException', (error) => { logger.error({ event: 'uncaught_exception', errorName: error.name, errorMessage: error.message, ...(process.env.NODE_ENV === 'production' ? {} : { stack: error.stack }) }); void shutdown('uncaughtException', 1); });
