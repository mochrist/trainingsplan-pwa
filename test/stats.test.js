process.env.TZ = 'Europe/Berlin';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chartSeries, chartSeriesSets, seriesSummary, niceTicks, metricsFor, defaultTitle, hasRpeData, workoutTotals } from '../js/lib/stats.js';
import { w, warm, item, workout } from './helpers.js';

const DAY = 86400000;
const NOW = new Date(2026, 9, 27, 12).getTime();
const chart = (extra) => ({ source: { kind: 'exercise', exerciseId: 'row' }, metric: 'maxWeight', range: 'all', chartType: 'line', ...extra });

const history = [
  workout(NOW - 100 * DAY, [item('row', [warm(80, 5), w(40, 10, { rpe: 8 }), w(45, 6, { rpe: 9 })])]),
  workout(NOW - 10 * DAY, [item('row', [w(50, 5)]), item('press', [w(30, 10)])]),
  workout(NOW - 5 * DAY, [item('press', [w(32.5, 8)])]),
  workout(NOW - 1 * DAY, [item('row', [w(50, 8, { done: false })])], { status: 'active', endedAt: null }),
];
const data = { workouts: history, bodyweights: [] };

test('Maximalgewicht je Training, Aufwärmsätze und aktive Workouts ignoriert', () => {
  const points = chartSeries(chart(), data, NOW);
  assert.deepEqual(points.map((p) => p.y), [45, 50]);
  assert.equal(points[0].x, history[0].startedAt);
});

test('Gesamtvolumen, 1RM, Wiederholungen, Ø RPE', () => {
  assert.deepEqual(chartSeries(chart({ metric: 'volume' }), data, NOW).map((p) => p.y), [670, 250]);
  assert.deepEqual(chartSeries(chart({ metric: 'e1rm' }), data, NOW).map((p) => p.y), [54, 58.3]);
  assert.deepEqual(chartSeries(chart({ metric: 'reps' }), data, NOW).map((p) => p.y), [16, 5]);
  // Training ohne RPE liefert keinen Punkt
  assert.deepEqual(chartSeries(chart({ metric: 'avgRpe' }), data, NOW).map((p) => p.y), [8.5]);
});

test('Zeitraumfilter', () => {
  assert.deepEqual(chartSeries(chart({ range: '4w' }), data, NOW).map((p) => p.y), [50]);
  assert.deepEqual(chartSeries(chart({ range: '6m' }), data, NOW).map((p) => p.y), [45, 50]);
});

test('Körpergewicht: ein Punkt je Tag, chronologisch, gefiltert', () => {
  const bodyweights = [
    { date: '2026-10-25', kg: 80.2 },
    { date: '2026-05-01', kg: 82 },
    { date: '2026-10-20', kg: 80.8 },
  ];
  const points = chartSeries({ source: { kind: 'bodyweight' }, metric: 'kg', range: '4w' }, { workouts: [], bodyweights }, NOW);
  assert.deepEqual(points.map((p) => p.y), [80.8, 80.2]);
});

test('Trainingsdauer in Minuten je abgeschlossenem Training', () => {
  const points = chartSeries({ source: { kind: 'duration' }, metric: 'minutes', range: 'all' }, data, NOW);
  assert.deepEqual(points.map((p) => p.y), [45, 45, 45]);
});

test('seriesSummary: letzter Wert und Änderung', () => {
  assert.equal(seriesSummary([]), null);
  assert.deepEqual(seriesSummary([{ x: 1, y: 40 }]), { last: 40, change: null });
  assert.deepEqual(seriesSummary([{ x: 1, y: 40 }, { x: 2, y: 42.5 }]), { last: 42.5, change: 2.5 });
});

test('niceTicks liefert runde Werte, die alle Daten einschließen', () => {
  assert.deepEqual(niceTicks(41, 58).ticks, [40, 45, 50, 55, 60]);
  assert.deepEqual(niceTicks(0, 1000).ticks, [0, 250, 500, 750, 1000]);
  const single = niceTicks(80, 80);
  assert.ok(single.min < 80 && single.max > 80);
  const small = niceTicks(7.5, 9.5);
  assert.ok(small.min <= 7.5 && small.max >= 9.5);
});

test('metricsFor: Ø RPE nur mit RPE-Daten', () => {
  assert.deepEqual(metricsFor('exercise'), ['maxWeight', 'volume', 'e1rm', 'reps']);
  assert.ok(metricsFor('exercise', { hasRpe: true }).includes('avgRpe'));
  assert.deepEqual(metricsFor('bodyweight'), ['kg']);
  assert.ok(hasRpeData(history, 'row'));
  assert.ok(!hasRpeData(history, 'press'));
});

test('defaultTitle', () => {
  assert.equal(defaultTitle(chart(), 'High Row'), 'High Row · Maximalgewicht');
  assert.equal(defaultTitle({ source: { kind: 'bodyweight' }, metric: 'kg' }), 'Körpergewicht');
});

test('workoutTotals', () => {
  const totals = workoutTotals(history[0], new Set([history[0].items[0].sets[2].id]));
  assert.equal(totals.setCount, 3);
  assert.equal(totals.volume, 670);
  assert.equal(totals.prCount, 1);
  assert.equal(totals.durationMs, 45 * 60000);
});

test('Körpergewicht nach Messart in getrennte Reihen, Auswahl und feste Reihenfolge', () => {
  const bodyweights = [
    { date: '2026-10-20', kg: 80, state: 'fasted' },
    { date: '2026-10-21', kg: 81.5, state: 'fed' },
    { date: '2026-10-22', kg: 79.8, state: 'fasted' },
    { date: '2026-10-23', kg: 80.6 }, // ohne Angabe = Normal
  ];
  const base = { source: { kind: 'bodyweight' }, metric: 'kg', range: 'all', chartType: 'line' };
  const all = chartSeriesSets(base, { workouts: [], bodyweights }, NOW);
  assert.deepEqual(all.map((s) => [s.key, s.points.map((p) => p.y)]), [
    ['fasted', [80, 79.8]],
    ['neutral', [80.6]],
    ['fed', [81.5]],
  ]);
  const picked = chartSeriesSets({ ...base, states: ['fed', 'fasted'] }, { workouts: [], bodyweights }, NOW);
  assert.deepEqual(picked.map((s) => s.key), ['fasted', 'fed']);
  assert.equal(picked[0].label, 'Nüchtern');
});

test('Andere Quellen haben genau eine Reihe', () => {
  const sets = chartSeriesSets(chart(), data, NOW);
  assert.equal(sets.length, 1);
  assert.deepEqual(sets[0].points.map((p) => p.y), [45, 50]);
});

test('Titelvorschlag mit genau einer Messart', () => {
  assert.equal(defaultTitle({ source: { kind: 'bodyweight' }, metric: 'kg', states: ['fasted'] }), 'Körpergewicht · Nüchtern');
  assert.equal(defaultTitle({ source: { kind: 'bodyweight' }, metric: 'kg', states: ['fasted', 'fed'] }), 'Körpergewicht');
});
