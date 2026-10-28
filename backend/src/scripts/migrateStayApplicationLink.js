import mongoose from 'mongoose';
import { env } from '../config/environment.js';
import { migrateStayApplicationIndex } from '../utils/stayApplicationIndexMigration.js';

await mongoose.connect(env.MONGODB_URI);
try {
  const collection = mongoose.connection.collection('stays');
  const result = await migrateStayApplicationIndex(collection);
  process.stdout.write(JSON.stringify({ message: 'Stay applicationId index verified.', ...result }) + '\n');
} finally {
  await mongoose.disconnect();
}
