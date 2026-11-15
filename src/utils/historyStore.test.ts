import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCohortPositionChanges } from './historyStore';

test('computeCohortPositionChanges returns current exposure when only one bucket exists', () => {
  const result = computeCohortPositionChanges(
    [],
    [
      { marketId: '1', cohort: 'whale', longUsd: 500000, shortUsd: 100000, positionCount: 4 },
      { marketId: '2', cohort: 'shrimp', longUsd: 5000, shortUsd: 12000, positionCount: 9 },
    ],
    null,
    1794700800000
  );
  assert.equal(result.mode, 'current');
  assert.equal(result.fromTime, null);
  assert.equal(result.changes.length, 2);
  assert.equal(result.changes[0].marketId, '1');
  assert.equal(result.changes[0].deltaNetUsd, null);
  assert.equal(result.changes[0].currentNetUsd, 400000);
});

test('computeCohortPositionChanges computes net delta across two distinct buckets', () => {
  const result = computeCohortPositionChanges(
    [{ marketId: '1', cohort: 'whale', longUsd: 300000, shortUsd: 100000, positionCount: 3 }],
    [{ marketId: '1', cohort: 'whale', longUsd: 500000, shortUsd: 100000, positionCount: 5 }],
    1794697200000,
    1794700800000
  );
  assert.equal(result.mode, 'changes');
  assert.equal(result.changes[0].previousNetUsd, 200000);
  assert.equal(result.changes[0].currentNetUsd, 400000);
  assert.equal(result.changes[0].deltaNetUsd, 200000);
});

test('computeCohortPositionChanges handles empty snapshots as unavailable', () => {
  const result = computeCohortPositionChanges([], [], null, null);
  assert.equal(result.mode, 'unavailable');
  assert.equal(result.changes.length, 0);
});
