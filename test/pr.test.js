import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePRs } from '../js/lib/pr.js';
import { w, warm, item, workout } from './helpers.js';

test('kein PR beim allerersten Training einer Übung', () => {
  const first = workout(1000, [item('row', [w(40, 10), w(50, 5)])]);
  assert.equal(computePRs([first]).size, 0);
});

test('Gewichts-PR', () => {
  const a = workout(1000, [item('row', [w(40, 10)])]);
  const heavier = w(42.5, 3); // 1RM 46,75 < 53,33, aber schwerer
  const b = workout(2000, [item('row', [w(40, 8), heavier])]);
  assert.deepEqual([...computePRs([a, b])], [heavier.id]);
});

test('1RM-PR bei gleichem Gewicht und mehr Wiederholungen', () => {
  const a = workout(1000, [item('row', [w(40, 10)])]);
  const more = w(40, 12);
  const b = workout(2000, [item('row', [more])]);
  assert.deepEqual([...computePRs([a, b])], [more.id]);
});

test('kein PR bei Gleichstand oder schlechter', () => {
  const a = workout(1000, [item('row', [w(40, 10)])]);
  const b = workout(2000, [item('row', [w(40, 10), w(35, 12)])]);
  assert.equal(computePRs([a, b]).size, 0);
});

test('höchstens ein PR pro Übung und Training, nämlich der beste', () => {
  const a = workout(1000, [item('row', [w(40, 10)])]);
  const s1 = w(45, 8);
  const s2 = w(50, 6); // bestes 1RM: 60
  const s3 = w(42.5, 12);
  const b = workout(2000, [item('row', [s1, s2, s3]), item('press', [w(20, 10)])]);
  const prs = computePRs([a, b]);
  assert.deepEqual([...prs], [s2.id]);
});

test('Sätze im selben Training zählen nur gegen frühere Trainings', () => {
  const a = workout(1000, [item('row', [w(40, 10)])]);
  const b = workout(2000, [item('row', [w(50, 10), w(45, 10)])]);
  const c = workout(3000, [item('row', [w(48, 10)])]);
  const prs = computePRs([a, b, c]);
  assert.equal(prs.size, 1);
  assert.ok(prs.has(b.items[0].sets[0].id));
});

test('Aufwärmsätze werden ignoriert', () => {
  const a = workout(1000, [item('row', [warm(100, 10), w(40, 10)])]);
  const s = w(45, 10);
  const b = workout(2000, [item('row', [warm(120, 10), s])]);
  assert.deepEqual([...computePRs([a, b])], [s.id]);
});

test('Training nur mit Aufwärmsätzen gilt nicht als erstes Training', () => {
  const a = workout(1000, [item('row', [warm(20, 10)])]);
  const b = workout(2000, [item('row', [w(40, 10)])]);
  assert.equal(computePRs([a, b]).size, 0);
});

test('nicht erledigte Sätze im aktiven Workout zählen nicht', () => {
  const a = workout(1000, [item('row', [w(40, 10)])]);
  const active = workout(2000, [item('row', [w(60, 10, { done: false })])], { status: 'active' });
  assert.equal(computePRs([a, active]).size, 0);
});

test('Reihenfolge nach startedAt, nicht nach Array-Position (nachträgliches Bearbeiten)', () => {
  const later = workout(3000, [item('row', [w(50, 10)])]);
  const earlier = workout(1000, [item('row', [w(40, 10)])]);
  const prs = computePRs([later, earlier]);
  assert.deepEqual([...prs], [later.items[0].sets[0].id]);
});
