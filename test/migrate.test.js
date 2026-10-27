import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, migrateBodyweightV1, DATA_VERSION } from '../js/lib/migrate.js';

test('aktuelle Version bleibt unverändert', () => {
  const data = { exercises: [], templates: [], workouts: [], bodyweights: [], charts: [], settings: {} };
  assert.deepEqual(migrate(data, DATA_VERSION), data);
});

test('neuere oder ungültige Versionen werden abgelehnt', () => {
  assert.throws(() => migrate({}, DATA_VERSION + 1), /neueren App-Version/);
  assert.throws(() => migrate({}, 0), /Ungültige/);
  assert.throws(() => migrate({}, '1'), /Ungültige/);
});

test('v1 → v2: Körpergewicht bekommt die Messart „Normal“, vorhandene bleibt', () => {
  const v1 = { exercises: [], templates: [], workouts: [], bodyweights: [{ date: '2026-10-01', kg: 80 }], charts: [], settings: {} };
  const v2 = migrate(v1, 1);
  assert.deepEqual(v2.bodyweights, [{ date: '2026-10-01', kg: 80, state: 'neutral' }]);
  assert.deepEqual(v1.bodyweights[0], { date: '2026-10-01', kg: 80 }, 'Original bleibt unverändert');
  assert.equal(migrateBodyweightV1({ date: 'x', kg: 1, state: 'fed' }).state, 'fed');
});
