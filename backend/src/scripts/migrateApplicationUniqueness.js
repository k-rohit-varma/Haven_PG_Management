import mongoose from 'mongoose';
import { env } from '../config/environment.js';

await mongoose.connect(env.MONGODB_URI);
try {
  const collection = mongoose.connection.collection('tenantapplications');
  const duplicates = await collection.aggregate([
    { $match: { status: 'PENDING' } },
    { $group: { _id: { tenantId: '$tenantId', hostelId: '$hostelId' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]).toArray();
  if (duplicates.length) throw new Error('Duplicate pending applications exist for the same tenant and hostel; resolve them before migrating the unique index.');
  const indexes = await collection.indexes();
  const legacy = indexes.find((index) => index.unique && index.key?.tenantId === 1 && !index.key?.hostelId);
  if (legacy) await collection.dropIndex(legacy.name);
  await collection.createIndex({ tenantId: 1, hostelId: 1 }, { name: 'tenantId_1_hostelId_1_pending_unique', unique: true, partialFilterExpression: { status: 'PENDING' } });
  process.stdout.write('Pending-application uniqueness now applies per tenant and hostel.\n');
} finally {
  await mongoose.disconnect();
}
