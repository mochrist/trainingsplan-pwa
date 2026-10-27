import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalizeWorkout, isFilled, isWorkSet, estimate1RM, createItem, countFilledSets } from '../js/lib/workout.js';
import { parseDecimal, parseInteger, stepWeight, roundWeight, formatNumber, formatSet } from '../js/lib/numbers.js';
import { w, warm, item, workout } from './helpers.js';

test('finalizeWorkout: ausgefüllt → erledigt, leer → verworfen, leere Übungen entfallen', () => {
  const draft = workout(1000, [
    item('a', [w(40, 10), w(40, 8, { done: false, doneAt: null }), w(null, null, { done: false })]),
    item('b', [w(null, 10, { done: false })]),
  ], { status: 'active', endedAt: null });
  const result = finalizeWorkout(draft, 5000);
  assert.equal(result.status, 'finished');
  assert.equal(result.endedAt, 5000);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].sets.length, 2);
  assert.ok(result.items[0].sets.every((s) => s.done));
  assert.equal(result.items[0].sets[1].doneAt, 5000);
  assert.equal(result.items[0].sets[0].doneAt, 1);
  // Original bleibt unverändert
  assert.equal(draft.items.length, 2);
  assert.equal(draft.status, 'active');
});

test('Gewicht 0 zählt als ausgefüllt', () => {
  assert.ok(isFilled({ weight: 0, reps: 8 }));
  assert.ok(!isFilled({ weight: null, reps: 8 }));
});

test('isWorkSet: nur erledigte, ausgefüllte Arbeitssätze', () => {
  assert.ok(isWorkSet(w(40, 10)));
  assert.ok(!isWorkSet(warm(40, 10)));
  assert.ok(!isWorkSet(w(40, 10, { done: false })));
  assert.ok(!isWorkSet(w(40, 0)));
});

test('estimate1RM nach Epley, bei 1 Wdh. = Gewicht', () => {
  assert.equal(estimate1RM(100, 1), 100);
  assert.equal(estimate1RM(100, 10), 100 * (1 + 10 / 30));
});

test('createItem legt leere Sätze an, countFilledSets zählt ausgefüllte', () => {
  const it = createItem('x', 3);
  assert.equal(it.sets.length, 3);
  assert.ok(it.sets.every((s) => s.weight === null && !s.done && s.type === 'work'));
  assert.equal(countFilledSets(workout(1, [it, item('y', [w(1, 1)])])), 1);
});

test('parseDecimal akzeptiert Komma und Punkt', () => {
  assert.equal(parseDecimal('42,5'), 42.5);
  assert.equal(parseDecimal('42.5'), 42.5);
  assert.equal(parseDecimal(' 40 '), 40);
  assert.equal(parseDecimal('0'), 0);
  assert.equal(parseDecimal(''), null);
  assert.equal(parseDecimal('abc'), null);
  assert.equal(parseDecimal('1,2,3'), null);
  assert.equal(parseDecimal('12,345'), 12.35);
});

test('parseInteger', () => {
  assert.equal(parseInteger('10'), 10);
  assert.equal(parseInteger(''), null);
  assert.equal(parseInteger('8,5'), null);
});

test('stepWeight rechnet ohne Fließkommafehler und nie unter 0', () => {
  let value = 0;
  for (let i = 0; i < 17; i++) value = stepWeight(value, 2.5, 1);
  assert.equal(value, 42.5);
  assert.equal(stepWeight(0.1, 0.2, 1), 0.3);
  assert.equal(stepWeight(1, 2.5, -1), 0);
  assert.equal(stepWeight(21.25, 1.25, 1), 22.5);
  assert.equal(roundWeight(0.1 + 0.2), 0.3);
});

test('Formatierung im deutschen Format', () => {
  assert.equal(formatNumber(42.5), '42,5');
  assert.equal(formatNumber(1250), '1.250');
  assert.equal(formatNumber(null), '');
  assert.equal(formatSet({ weight: 40, reps: 10, rpe: 8.5 }), '40×10 @8,5');
  assert.equal(formatSet({ weight: 40, reps: 10, rpe: 8.5 }, { withRpe: false }), '40×10');
});
