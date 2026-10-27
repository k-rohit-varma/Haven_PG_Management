import mongoose from 'mongoose';
import { env } from './environment.js';
import { logger } from '../utils/logger.js';

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  logger.info({ event: 'database_connected', host: mongoose.connection.host });
}
