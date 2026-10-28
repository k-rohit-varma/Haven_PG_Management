import test from 'node:test';
import assert from 'node:assert/strict';
import { Stay } from '../src/models/Stay.js';
import { migrateStayApplicationIndex } from '../src/utils/stayApplicationIndexMigration.js';

test('new direct-assignment stays default to a null applicationId', () => {
  assert.equal(new Stay().applicationId, null);
});

function fakeCollection(initialIndexes) {
  const indexes = structuredClone(initialIndexes);
  const dropped = [];
  const created = [];
  return {
    dropped,
    created,
    async indexes() { return structuredClone(indexes); },
    async dropIndex(name) {
      dropped.push(name);
      const index = indexes.findIndex((item) => item.name === name);
      if (index < 0) throw new Error(`Index not found: ${name}`);
      indexes.splice(index, 1);
    },
    async createIndex(key, options) {
      created.push({ key, options });
      indexes.push({ name: options.name, key, unique: options.unique, partialFilterExpression: options.partialFilterExpression });
    },
  };
}

test('stay index migration removes the legacy null-blocking index and preserves the partial unique index', async () => {
  const collection = fakeCollection([
    { name: '_id_', key: { _id: 1 } },
    { name: 'applicationId_1', key: { applicationId: 1 }, unique: true },
    { name: 'applicationId_1_partial', key: { applicationId: 1 }, unique: true, partialFilterExpression: { applicationId: { $type: 'objectId' } } },
    { name: 'tenantId_1_status_1', key: { tenantId: 1, status: 1 }, unique: true, partialFilterExpression: { status: 'ACTIVE' } },
  ]);

  const result = await migrateStayApplicationIndex(collection);

  assert.deepEqual(result, { droppedIndex: 'applicationId_1', partialIndex: 'applicationId_1_partial' });
  assert.deepEqual(collection.dropped, ['applicationId_1']);
  assert.deepEqual(collection.created, []);
});

test('stay index migration installs the partial index when the legacy index is the only one present', async () => {
  const collection = fakeCollection([{ name: 'applicationId_1', key: { applicationId: 1 }, unique: true }]);

  const result = await migrateStayApplicationIndex(collection);

  assert.deepEqual(result, { droppedIndex: 'applicationId_1', partialIndex: 'applicationId_1_partial' });
  assert.deepEqual(collection.dropped, ['applicationId_1']);
  assert.equal(collection.created.length, 1);
  assert.deepEqual(collection.created[0].options.partialFilterExpression, { applicationId: { $type: 'objectId' } });
});

test('stay index migration refuses ambiguous or conflicting unique indexes without dropping anything', async () => {
  const collection = fakeCollection([
    { name: 'applicationId_1', key: { applicationId: 1 }, unique: true },
    { name: 'applicationId_custom', key: { applicationId: 1 }, unique: true },
  ]);

  await assert.rejects(() => migrateStayApplicationIndex(collection), /Multiple legacy unique applicationId indexes/);
  assert.deepEqual(collection.dropped, []);
  assert.deepEqual(collection.created, []);
});

test('stay index migration refuses a conflicting index that occupies the target name', async () => {
  const collection = fakeCollection([
    { name: 'applicationId_1', key: { applicationId: 1 }, unique: true },
    { name: 'applicationId_1_partial', key: { applicationId: 1 }, unique: false },
  ]);

  await assert.rejects(() => migrateStayApplicationIndex(collection), /index name is already used/);
  assert.deepEqual(collection.dropped, []);
  assert.deepEqual(collection.created, []);
});
