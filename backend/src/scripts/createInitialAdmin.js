import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { ensureInitialAdmin } from '../services/initialAdminService.js';

try {
  await connectDatabase();
  const admin = await ensureInitialAdmin();
  if (admin) console.info('Initial administrator is ready.');
} catch (error) {
  console.error(`Initial administrator setup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
