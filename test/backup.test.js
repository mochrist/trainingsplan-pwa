import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, shouldRemind, backupFileName, SNOOZE_MS } from '../js/lib/backup.js';
import { DATA_VERSION } from '../js/lib/migrate.js';
import { normalizeName } from '../js/lib/normalize.js';
import { w, warm, item, workout } from './helpers.js';

const DAY = 86400000;

function sampleData() {
  const exercise = (id, name) => ({ id, name, nameNorm: normalizeName(name), note: '', archived: false, createdAt: 1 });
  return {
    exercises: [exercise('row', 'High Row'), { ...exercise('press', 'Bankdrücken'), note: 'Bank 3', archived: true }],
    templates: [{ id: 't1', name: 'Pull', items: [{ id: 'ti1', exerciseId: 'row', plannedSets: 3 }], createdAt: 1, updatedAt: 2 }],
    workouts: [
      workout(1000, [item('row', [warm(20, 10), w(42.5, 8, { rpe: 8.5, note: 'gut' })])]),
      workout(5000, [item('press', [w(null, null, { done: false })])], { status: 'active', endedAt: null }),
    ],
    bodyweights: [{ date: '2026-10-27', kg: 80.4 }],
    charts: [
      { id: 'c1', title: 'Körpergewicht', source: { kind: 'bodyweight' }, metric: 'kg', range: '3m', chartType: 'line', order: 0 },
      { id: 'c2', title: 'High Row', source: { kind: 'exercise', exerciseId: 'row' }, metric: 'e1rm', range: 'all', chartType: 'bar', order: 1 },
    ],
    settings: { restSeconds: 120, weightStep: 1.25, rpeEnabled: true, backupReminderDays: 7 },
  };
}

test('Round-Trip: Export → JSON → Import ergibt identische Daten', () => {
  const data = sampleData();
  const json = JSON.stringify(buildBackup(data, 123));
  const parsed = parseBackup(json);
  assert.deepEqual(parsed.data, data);
  assert.equal(parsed.exportedAt, 123);
  assert.deepEqual(parsed.summary, { exercises: 2, templates: 1, workouts: 1, bodyweights: 1, charts: 2 });
});

test('Backup enthält App-Kennung und Schema-Version', () => {
  const backup = buildBackup(sampleData(), 1);
  assert.equal(backup.app, 'trainingsplan');
  assert.equal(backup.schemaVersion, DATA_VERSION);
});

test('Dateiname mit Datum', () => {
  assert.match(backupFileName(new Date(2026, 9, 27).getTime()), /^trainingsplan-backup-2026-10-27\.json$/);
});

test('ungültige Dateien werden abgelehnt', () => {
  assert.throws(() => parseBackup('kein json'), /keine gültige JSON/);
  assert.throws(() => parseBackup('{"app":"andere-app","schemaVersion":1,"data":{}}'), /kein Trainingsplan-Backup/);
  assert.throws(() => parseBackup('{"app":"trainingsplan","data":{}}'), /Schema-Version/);
  assert.throws(() => parseBackup(JSON.stringify(buildBackup({ ...sampleData(), workouts: 'x' }))), /beschädigt/);
  const future = { ...buildBackup(sampleData()), schemaVersion: DATA_VERSION + 1 };
  assert.throws(() => parseBackup(JSON.stringify(future)), /neueren App-Version/);
});

test('Struktur- und Referenzfehler werden erkannt', () => {
  const cases = [
    (d) => { d.workouts[0].items[0].exerciseId = 'unbekannt'; },
    (d) => { d.templates[0].items[0].exerciseId = 'unbekannt'; },
    (d) => { d.charts[1].source.exerciseId = 'unbekannt'; },
    (d) => { d.exercises.push({ ...d.exercises[0], id: 'dup' }); },
    (d) => { d.workouts[0].items[0].sets[0].reps = 'zehn'; },
    (d) => { d.workouts[0].endedAt = null; },
    (d) => { d.workouts.push({ ...d.workouts[1], id: 'second-active' }); },
    (d) => { d.bodyweights.push({ date: '2026-10-27', kg: 81 }); },
    (d) => { d.charts[0].metric = 'maxWeight'; },
    (d) => { d.settings.backupReminderDays = 3; },
    (d) => { delete d.settings; },
  ];
  for (const mutate of cases) {
    const data = sampleData();
    mutate(data);
    assert.throws(() => parseBackup(JSON.stringify(buildBackup(data))), /beschädigt/, mutate.toString());
  }
});

test('Erinnerung: nie exportiert, aber Änderungen und ein abgeschlossenes Training', () => {
  const backup = { lastExportAt: null, lastChangeAt: 1000, snoozedUntil: null };
  assert.equal(shouldRemind({ backup, reminderDays: 14, hasFinishedWorkout: true, now: 2000 }), true);
  assert.equal(shouldRemind({ backup, reminderDays: 14, hasFinishedWorkout: false, now: 2000 }), false);
});

test('Erinnerung: nur nach Ablauf des Intervalls und nur mit ungesicherten Änderungen', () => {
  const now = 100 * DAY;
  const exported = now - 15 * DAY;
  assert.equal(shouldRemind({ backup: { lastExportAt: exported, lastChangeAt: exported + 1, snoozedUntil: null }, reminderDays: 14, hasFinishedWorkout: true, now }), true);
  assert.equal(shouldRemind({ backup: { lastExportAt: exported, lastChangeAt: exported + 1, snoozedUntil: null }, reminderDays: 30, hasFinishedWorkout: true, now }), false);
  // Keine Änderungen seit dem Export
  assert.equal(shouldRemind({ backup: { lastExportAt: exported, lastChangeAt: exported, snoozedUntil: null }, reminderDays: 14, hasFinishedWorkout: true, now }), false);
});

test('Erinnerung: „Später“ und „aus“', () => {
  const backup = { lastExportAt: null, lastChangeAt: 1, snoozedUntil: 10 + SNOOZE_MS };
  assert.equal(shouldRemind({ backup, reminderDays: 14, hasFinishedWorkout: true, now: 10 }), false);
  assert.equal(shouldRemind({ backup, reminderDays: 14, hasFinishedWorkout: true, now: 11 + SNOOZE_MS }), true);
  assert.equal(shouldRemind({ backup: { ...backup, snoozedUntil: null }, reminderDays: 0, hasFinishedWorkout: true, now: 10 }), false);
});
