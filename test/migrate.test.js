import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrate, migrateBodyweightV1, migrateExerciseV2, DATA_VERSION } from '../js/lib/migrate.js';

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
  assert.equal(DATA_VERSION, 3);
  assert.deepEqual(v2.bodyweights, [{ date: '2026-10-01', kg: 80, state: 'neutral' }]);
  assert.deepEqual(v1.bodyweights[0], { date: '2026-10-01', kg: 80 }, 'Original bleibt unverändert');
  assert.equal(migrateBodyweightV1({ date: 'x', kg: 1, state: 'fed' }).state, 'fed');
});

test('v2 → v3: Übungen bekommen Muskelgruppen aus dem Katalog oder aus dem Namen', () => {
  const exercise = (name) => ({ id: name, name, nameNorm: name.toLowerCase(), note: '', archived: false, createdAt: 1 });
  const v2 = { exercises: [exercise('Latzug'), exercise('Beinstrecker einbeinig'), exercise('Mein Zirkel')], templates: [], workouts: [], bodyweights: [], charts: [], settings: {} };
  const v3 = migrate(v2, 2);
  assert.deepEqual(v3.exercises.map((e) => [e.muscles, e.compound]), [
    [['back', 'biceps'], true],
    [['quads'], false],
    [[], false],
  ]);
  assert.equal(v2.exercises[0].muscles, undefined, 'Original bleibt unverändert');
  // Bereits gesetzte Zuordnung bleibt erhalten
  const tagged = { ...exercise('Latzug'), muscles: ['shoulders'], compound: false };
  assert.deepEqual(migrateExerciseV2(tagged).muscles, ['shoulders']);
});
