import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, DATA_VERSION } from '../js/lib/migrate.js';

test('aktuelle Version bleibt unverändert', () => {
  const data = { exercises: [], templates: [], workouts: [], bodyweights: [], charts: [], settings: {} };
  assert.deepEqual(migrate(data, DATA_VERSION), data);
});

test('neuere oder ungültige Versionen werden abgelehnt', () => {
  assert.throws(() => migrate({}, DATA_VERSION + 1), /neueren App-Version/);
  assert.throws(() => migrate({}, 0), /Ungültige/);
  assert.throws(() => migrate({}, '1'), /Ungültige/);
});
