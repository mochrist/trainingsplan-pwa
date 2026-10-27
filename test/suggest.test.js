import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCandidates, generateSuggestion, alternativeFor, lastTrainedByMuscle, lastTrainedForFocus, recommendFocus, FOCUS_PRESETS,
} from '../js/lib/suggest.js';
import { CATALOG } from '../js/lib/catalog.js';
import { normalizeName } from '../js/lib/normalize.js';
import { w, item, workout } from './helpers.js';

const DAY = 86400000;
const NOW = 1000 * DAY;

/** Deterministischer Zufall (LCG), damit Tests reproduzierbar sind. */
function seeded(seed = 1) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const own = (id, name, muscles, compound = false, extra = {}) =>
  ({ id, name, nameNorm: normalizeName(name), note: '', archived: false, createdAt: 1, muscles, compound, ...extra });

const exercises = [
  own('curl', 'Bizeps-Curls (SZ-Stange)', ['biceps']),
  own('push', 'Trizepsdrücken (Kabel)', ['triceps']),
  own('lat', 'Latzug', ['back', 'biceps'], true),
  own('old', 'Hammer-Curls', ['biceps', 'forearms'], false, { archived: true }),
  own('untagged', 'Mein Zirkel', []),
];

test('Kandidaten: eigene Übungen plus Katalog ohne Doppelte, archivierte blenden den Katalogeintrag aus', () => {
  const candidates = buildCandidates(exercises);
  const names = candidates.map((c) => normalizeName(c.name));
  assert.equal(new Set(names).size, names.length);
  assert.ok(candidates.some((c) => c.exerciseId === 'curl'));
  assert.ok(!names.includes(normalizeName('Hammer-Curls')), 'archivierte Übung wird nicht vorgeschlagen');
  assert.ok(!candidates.some((c) => c.exerciseId === 'untagged'), 'ohne Muskelgruppe kein Vorschlag');
  // 3 eigene aktive mit Muskelgruppe, Katalog ohne die 4 gleichnamigen (inkl. archivierter)
  assert.equal(candidates.length, 3 + CATALOG.length - 4);
});

test('Arme: 5 Übungen abwechselnd Bizeps und Trizeps, keine doppelt', () => {
  const candidates = buildCandidates(exercises);
  for (let seed = 1; seed <= 20; seed++) {
    const picks = generateSuggestion({ candidates, muscles: FOCUS_PRESETS.arms.muscles, count: 5, rng: seeded(seed), now: NOW });
    assert.equal(picks.length, 5);
    assert.equal(new Set(picks.map((p) => p.key)).size, 5);
    assert.equal(picks.filter((p) => p.slot === 'biceps').length, 3);
    assert.equal(picks.filter((p) => p.slot === 'triceps').length, 2);
    for (const pick of picks) assert.equal(pick.muscles[0], pick.slot);
  }
});

test('Grundübungen kommen zuerst', () => {
  const candidates = buildCandidates(exercises);
  for (let seed = 1; seed <= 20; seed++) {
    const picks = generateSuggestion({ candidates, muscles: FOCUS_PRESETS.push.muscles, count: 6, rng: seeded(seed), now: NOW });
    const firstIsolation = picks.findIndex((p) => !p.compound);
    assert.ok(firstIsolation === -1 || picks.slice(firstIsolation).every((p) => !p.compound));
  }
});

test('Pro Muskelgruppe höchstens eine Grundübung, solange Isolationsübungen da sind', () => {
  const candidates = buildCandidates(exercises);
  for (let seed = 1; seed <= 20; seed++) {
    const picks = generateSuggestion({ candidates, muscles: FOCUS_PRESETS.push.muscles, count: 8, rng: seeded(seed), now: NOW });
    for (const muscle of FOCUS_PRESETS.push.muscles) {
      assert.ok(picks.filter((p) => p.slot === muscle && p.compound).length <= 1, `${muscle}, Seed ${seed}`);
    }
  }
  // Nur Grundübungen vorhanden: trotzdem auffüllen
  const onlyCompound = buildCandidates([], [
    { name: 'A', muscles: ['quads'], compound: true },
    { name: 'B', muscles: ['quads'], compound: true },
  ]);
  assert.equal(generateSuggestion({ candidates: onlyCompound, muscles: ['quads'], count: 2, rng: seeded() }).length, 2);
});

test('Oft gemachte Übungen werden bevorzugt, kürzlich gemachte seltener', () => {
  const candidates = buildCandidates(exercises);
  const hits = (usage) => {
    let count = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const picks = generateSuggestion({ candidates, muscles: ['biceps'], count: 1, usage, rng: seeded(seed), now: NOW });
      if (picks[0].exerciseId === 'curl') count++;
    }
    return count;
  };
  const often = hits(new Map([['curl', { count: 3, lastAt: NOW - 10 * DAY }]]));
  const recent = hits(new Map([['curl', { count: 3, lastAt: NOW - 1 * DAY }]]));
  const never = hits(new Map());
  assert.ok(often > 180, `oft gemacht: ${often}`);
  assert.ok(recent < often, `kürzlich: ${recent}`);
  assert.ok(never < often, `nie: ${never}`);
});

test('Zu wenig Übungen: weniger Vorschläge statt Endlosschleife', () => {
  const candidates = buildCandidates([], [{ name: 'A', muscles: ['calves'], compound: false }]);
  assert.equal(generateSuggestion({ candidates, muscles: ['calves', 'abs'], count: 5, rng: seeded() }).length, 1);
  assert.deepEqual(generateSuggestion({ candidates, muscles: [], count: 5 }), []);
});

test('Austausch: gleiche Muskelgruppe, nicht schon enthalten', () => {
  const candidates = buildCandidates(exercises);
  const picks = generateSuggestion({ candidates, muscles: ['biceps', 'triceps'], count: 4, rng: seeded(3), now: NOW });
  const next = alternativeFor(picks[0], { candidates, picks, rng: seeded(4), now: NOW });
  assert.equal(next.slot, picks[0].slot);
  assert.ok(!picks.some((p) => p.key === next.key));
  const tiny = buildCandidates([], [{ name: 'A', muscles: ['calves'], compound: false }]);
  const only = generateSuggestion({ candidates: tiny, muscles: ['calves'], count: 1 });
  assert.equal(alternativeFor(only[0], { candidates: tiny, picks: only }), null);
});

test('Empfehlung: Split, der am längsten nicht dran war', () => {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  byId.set('squat', own('squat', 'Kniebeugen (Langhantel)', ['quads', 'glutes'], true));
  const history = [
    workout(NOW - 2 * DAY, [item('lat', [w(50, 10)])]),
    workout(NOW - 6 * DAY, [item('squat', [w(80, 5)])]),
    workout(NOW - 4 * DAY, [item('push', [w(20, 12)])]),
    workout(NOW - 1 * DAY, [item('squat', [w(80, 5)])], { status: 'active', endedAt: null }),
  ];
  const last = lastTrainedByMuscle(history, byId);
  assert.equal(last.get('quads'), NOW - 6 * DAY, 'aktive Workouts zählen nicht');
  assert.equal(last.get('biceps'), undefined, 'nur die Hauptmuskelgruppe zählt');
  assert.equal(lastTrainedForFocus('pull', last), NOW - 2 * DAY);
  assert.equal(recommendFocus(last), 'legs');
  assert.equal(recommendFocus(new Map()), null);
  // Nie trainierter Split geht vor
  assert.equal(recommendFocus(new Map([['back', NOW], ['chest', NOW]])), 'legs');
});
