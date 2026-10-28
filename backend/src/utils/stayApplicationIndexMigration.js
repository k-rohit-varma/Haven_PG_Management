const expectedIndexName = 'applicationId_1_partial';
const expectedFilter = { applicationId: { $type: 'objectId' } };

function isSingleApplicationIdIndex(index) {
  return index.key?.applicationId === 1 && Object.keys(index.key).length === 1;
}

function isExpectedPartialIndex(index) {
  return index.unique === true
    && index.partialFilterExpression?.applicationId?.$type === 'objectId'
    && Object.keys(index.partialFilterExpression).length === 1;
}

export async function migrateStayApplicationIndex(collection) {
  const indexes = await collection.indexes();
  const relevant = indexes.filter(isSingleApplicationIdIndex);
  const legacyUnique = relevant.filter((index) => index.unique && !index.partialFilterExpression);
  const partialUnique = relevant.filter((index) => index.unique && index.partialFilterExpression);
  const namedExpectedIndex = indexes.find((index) => index.name === expectedIndexName);

  if (legacyUnique.length > 1) throw new Error('Multiple legacy unique applicationId indexes found; refusing to change indexes automatically.');
  if (partialUnique.some((index) => !isExpectedPartialIndex(index))) throw new Error('A conflicting partial applicationId index exists; refusing to change indexes automatically.');
  if (partialUnique.length > 1) throw new Error('Multiple partial unique applicationId indexes found; refusing to change indexes automatically.');
  if (namedExpectedIndex && (!isSingleApplicationIdIndex(namedExpectedIndex) || !isExpectedPartialIndex(namedExpectedIndex))) {
    throw new Error('The expected partial applicationId index name is already used by a conflicting index; refusing to change indexes automatically.');
  }

  const droppedIndex = legacyUnique[0] || null;
  if (droppedIndex) await collection.dropIndex(droppedIndex.name);

  if (!partialUnique.length) {
    await collection.createIndex({ applicationId: 1 }, {
      name: expectedIndexName,
      unique: true,
      partialFilterExpression: expectedFilter,
    });
  }

  const verifiedIndexes = await collection.indexes();
  const verifiedRelevant = verifiedIndexes.filter(isSingleApplicationIdIndex);
  if (verifiedRelevant.some((index) => index.unique && !index.partialFilterExpression)
    || !verifiedRelevant.some(isExpectedPartialIndex)) {
    throw new Error('Stay applicationId index migration verification failed.');
  }

  return { droppedIndex: droppedIndex?.name || null, partialIndex: expectedIndexName };
}
