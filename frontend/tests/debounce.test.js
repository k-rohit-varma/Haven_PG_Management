import test from 'node:test';
import assert from 'node:assert/strict';
import { createDebouncer, SEARCH_DEBOUNCE_MS } from '../src/utils/debounce.js';

const wait = (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

test('server-backed search uses a 1,500 ms trailing debounce and cancels pending callbacks', async () => {
  assert.equal(SEARCH_DEBOUNCE_MS, 1500);
  const values = [];
  const schedule = createDebouncer((value) => values.push(value), 35);
  schedule('old');
  await wait(20);
  schedule('new');
  await wait(20);
  assert.deepEqual(values, []);
  await wait(25);
  assert.deepEqual(values, ['new']);
  schedule('cancelled');
  schedule.cancel();
  await wait(40);
  assert.deepEqual(values, ['new']);
});
