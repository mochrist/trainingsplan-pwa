// Trainingsvorschlag: stellt aus eigenen Übungen und dem Katalog ein Training für Muskelgruppen zusammen (ohne DOM).
import { CATALOG } from './catalog.js';
import { normalizeName } from './normalize.js';
import { DAY_MS } from './time.js';

export const FOCUS_PRESETS = {
  push: { label: 'Push', muscles: ['chest', 'shoulders', 'triceps'] },
  pull: { label: 'Pull', muscles: ['back', 'biceps'] },
  legs: { label: 'Beine', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
  arms: { label: 'Arme', muscles: ['biceps', 'triceps'] },
  upper: { label: 'Oberkörper', muscles: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
  full: { label: 'Ganzkörper', muscles: ['quads', 'chest', 'back', 'hamstrings', 'shoulders'] },
};

/** Unter diesen Splits wird der am längsten nicht trainierte empfohlen. */
const RECOMMENDABLE = ['push', 'pull', 'legs'];

export const DEFAULT_SUGGESTION_COUNT = 5;
export const MIN_SUGGESTION_COUNT = 3;
export const MAX_SUGGESTION_COUNT = 8;

const RECENT_MS = 3 * DAY_MS;
const JITTER = 1.5;
const MAX_USAGE_BONUS = 3;
const RECENT_PENALTY = 3;

/**
 * Alle Übungen, die vorgeschlagen werden können: eigene (nicht archiviert, mit Muskelgruppe) und
 * Katalogübungen, die es unter diesem Namen noch nicht gibt. Archivierte eigene Übungen blenden
 * den gleichnamigen Katalogeintrag aus.
 * @returns [{ key, exerciseId|null, name, muscles, compound }]
 */
export function buildCandidates(exercises, catalog = CATALOG) {
  const knownNames = new Set(exercises.map((e) => e.nameNorm));
  const own = exercises
    .filter((e) => !e.archived && e.muscles?.length)
    .map((e) => ({ key: e.id, exerciseId: e.id, name: e.name, muscles: e.muscles, compound: Boolean(e.compound) }));
  const extra = catalog
    .filter((entry) => !knownNames.has(normalizeName(entry.name)))
    .map((entry) => ({ key: `catalog:${normalizeName(entry.name)}`, exerciseId: null, ...entry }));
  return [...own, ...extra];
}

/**
 * Bewertung: bekannte und oft gemachte Übungen zuerst, in den letzten Tagen gemachte seltener,
 * Grundübungen leicht bevorzugt, dazu etwas Zufall für Abwechslung.
 */
function score(candidate, { usage, now, rng }) {
  const use = candidate.exerciseId ? usage.get(candidate.exerciseId) : null;
  let value = 0;
  if (candidate.exerciseId) value += 0.5;
  if (use?.count) value += 1 + Math.min(MAX_USAGE_BONUS, Math.log2(1 + use.count));
  if (use?.lastAt && now - use.lastAt < RECENT_MS) value -= RECENT_PENALTY;
  if (candidate.compound) value += 0.5;
  return value + rng() * JITTER;
}

function rankedPool(candidates, muscle, exclude, context) {
  return candidates
    .filter((c) => c.muscles[0] === muscle && !exclude.has(c.key))
    .map((c) => ({ candidate: c, score: score(c, context) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.candidate);
}

/**
 * Wählt bis zu `count` Übungen, abwechselnd auf die Muskelgruppen verteilt (nach Hauptmuskelgruppe).
 * Pro Muskelgruppe höchstens eine Grundübung, solange es dort noch Isolationsübungen gibt.
 * Grundübungen stehen vorne, sonst bleibt die Verteilungsreihenfolge.
 * @param usage Map exerciseId → { count, lastAt }
 * @param rng () → [0, 1), für Tests austauschbar
 * @returns [{ ...candidate, slot }] — slot ist die Muskelgruppe, für die die Übung gewählt wurde
 */
export function generateSuggestion({ candidates, muscles, count = DEFAULT_SUGGESTION_COUNT, usage = new Map(), now = Date.now(), rng = Math.random }) {
  const context = { usage, now, rng };
  const pools = muscles.map((muscle) => ({ muscle, list: rankedPool(candidates, muscle, new Set(), context), hasCompound: false }));
  const picks = [];
  const used = new Set();
  let index = 0;
  let misses = 0;
  while (picks.length < count && pools.length && misses < pools.length) {
    const pool = pools[index++ % pools.length];
    const free = pool.list.filter((c) => !used.has(c.key));
    const next = (pool.hasCompound && free.find((c) => !c.compound)) || free[0];
    if (!next) {
      misses++;
      continue;
    }
    misses = 0;
    used.add(next.key);
    pool.hasCompound ||= next.compound;
    picks.push({ ...next, slot: pool.muscle });
  }
  // Array.prototype.sort ist stabil: innerhalb der Gruppen bleibt die Reihenfolge
  return picks.sort((a, b) => Number(b.compound) - Number(a.compound));
}

/** Ersatz für eine Übung des Vorschlags (gleiche Muskelgruppe, nicht schon enthalten) oder null. */
export function alternativeFor(pick, { candidates, picks, usage = new Map(), now = Date.now(), rng = Math.random }) {
  const exclude = new Set(picks.map((p) => p.key));
  const next = rankedPool(candidates, pick.slot, exclude, { usage, now, rng })[0];
  return next ? { ...next, slot: pick.slot } : null;
}

/** Map Muskelgruppe → letzter Trainingszeitpunkt (abgeschlossene Workouts, nach Hauptmuskelgruppe). */
export function lastTrainedByMuscle(workouts, exercisesById) {
  const last = new Map();
  for (const workout of workouts) {
    if (workout.status !== 'finished') continue;
    for (const item of workout.items) {
      const muscle = exercisesById.get(item.exerciseId)?.muscles?.[0];
      if (muscle && (last.get(muscle) ?? 0) < workout.startedAt) last.set(muscle, workout.startedAt);
    }
  }
  return last;
}

/** Zuletzt trainiert für einen Fokus: jüngster Zeitpunkt über seine Muskelgruppen, oder null. */
export function lastTrainedForFocus(focusKey, lastByMuscle) {
  const times = FOCUS_PRESETS[focusKey].muscles.map((m) => lastByMuscle.get(m) ?? 0);
  const latest = Math.max(...times);
  return latest > 0 ? latest : null;
}

/**
 * Split (Push/Pull/Beine), der am längsten nicht dran war. Ohne jede Historie null.
 * Nie trainierte Splits gehen vor.
 */
export function recommendFocus(lastByMuscle) {
  if (!lastByMuscle.size) return null;
  let best = null;
  let bestAt = Infinity;
  for (const key of RECOMMENDABLE) {
    const at = lastTrainedForFocus(key, lastByMuscle) ?? 0;
    if (at < bestAt) {
      best = key;
      bestAt = at;
    }
  }
  return best;
}
