import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastSession, usageStats } from '../js/lib/history.js';
import { w, warm, item, workout } from './helpers.js';

test('liefert die letzte abgeschlossene Session mit Arbeitssätzen', () => {
  const older = workout(1000, [item('row', [w(40, 10)])]);
  const newer = workout(2000, [item('row', [w(42.5, 8), w(42.5, 7)])]);
  const result = lastSession([newer, older], 'row');
  assert.equal(result.workoutId, newer.id);
  assert.deepEqual(result.sets.map((s) => s.weight), [42.5, 42.5]);
});

test('Aufwärmsätze zählen nicht, Sessions nur mit Aufwärmsätzen werden übersprungen', () => {
  const real = workout(1000, [item('row', [warm(20, 10), w(40, 10)])]);
  const onlyWarmup = workout(2000, [item('row', [warm(20, 10)])]);
  const result = lastSession([real, onlyWarmup], 'row');
  assert.equal(result.workoutId, real.id);
  assert.deepEqual(result.sets.map((s) => s.weight), [40]);
});

test('aktuelles und aktives Workout sind ausgeschlossen, unabhängig vom Template', () => {
  const done = workout(1000, [item('row', [w(40, 10)])], { templateId: 'pull' });
  const current = workout(2000, [item('row', [w(50, 10)])], { templateId: 'other' });
  const active = workout(3000, [item('row', [w(60, 10)])], { status: 'active', endedAt: null });
  assert.equal(lastSession([done, current, active], 'row', { excludeWorkoutId: current.id }).workoutId, done.id);
});

test('nicht erledigte Sätze zählen nicht', () => {
  const s = workout(1000, [item('row', [w(40, 10, { done: false })])]);
  assert.equal(lastSession([s], 'row'), null);
});

test('before begrenzt auf frühere Sessions (Bearbeiten)', () => {
  const a = workout(1000, [item('row', [w(40, 10)])]);
  const b = workout(2000, [item('row', [w(45, 10)])]);
  assert.equal(lastSession([a, b], 'row', { before: 2000 }).workoutId, a.id);
});

test('keine Historie → null', () => {
  assert.equal(lastSession([], 'row'), null);
});

test('usageStats zählt Nutzung und letzte Verwendung', () => {
  const usage = usageStats([workout(1000, [item('a', []), item('b', [])]), workout(3000, [item('a', [])])]);
  assert.deepEqual(usage.get('a'), { count: 2, lastAt: 3000 });
  assert.deepEqual(usage.get('b'), { count: 1, lastAt: 1000 });
});
