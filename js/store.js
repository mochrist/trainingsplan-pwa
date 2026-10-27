// Datenzugriff für die Views: In-Memory-Cache über IndexedDB.
// Lesen geht synchron auf den Cache, Schreiben erst nach IndexedDB, dann in den Cache.
import { openDatabase, readAll, write, keyOf, STORES } from './db.js';
import { cleanName, normalizeName, findByName } from './lib/normalize.js';
import { usageStats } from './lib/history.js';
import { computePRs } from './lib/pr.js';
import { DEFAULT_BODYWEIGHT_STATE } from './lib/stats.js';
import { newId } from './lib/html.js';
import { createItem, createWorkout, finalizeWorkout } from './lib/workout.js';
import { roundWeight } from './lib/numbers.js';

const STARTER_EXERCISES = [
  'Bankdrücken (Langhantel)',
  'Schrägbankdrücken (Kurzhantel)',
  'Schulterdrücken (Kurzhantel)',
  'Seitheben (Kurzhantel)',
  'Butterfly (Maschine)',
  'Trizepsdrücken (Kabel)',
  'Latzug',
  'High Row',
  'Rudern am Kabel (sitzend)',
  'Face Pulls',
  'Bizeps-Curls (SZ-Stange)',
  'Reverse Butterfly',
];

// Standard-Diagramme beim ersten Start (unabhängig von Übungen)
const DEFAULT_CHARTS = [
  { title: 'Körpergewicht', source: { kind: 'bodyweight' }, metric: 'kg', range: '3m', chartType: 'line' },
  { title: 'Trainingsdauer', source: { kind: 'duration' }, metric: 'minutes', range: '3m', chartType: 'bar' },
];

export const DEFAULT_SETTINGS = {
  restSeconds: 90,
  weightStep: 2.5,
  rpeEnabled: false,
  backupReminderDays: 14,
};

let db = null;
const cache = Object.fromEntries(STORES.map((name) => [name, new Map()]));
const listeners = new Set();
let errorHandler = (err) => console.error(err);

// ---------- Kern ----------

export async function init({ onVersionChange, onBlocked } = {}) {
  db = await openDatabase({ onVersionChange, onBlocked });
  const data = await readAll(db);
  for (const name of STORES) {
    cache[name].clear();
    for (const record of data[name]) cache[name].set(keyOf(name, record), record);
  }
  if (!getKv('seeded')) await seed();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setErrorHandler(fn) {
  errorHandler = fn;
}

function applyToCache(op) {
  const map = cache[op.store];
  if (op.type === 'put') map.set(keyOf(op.store, op.value), op.value);
  else if (op.type === 'delete') map.delete(op.key);
  else if (op.type === 'clear') map.clear();
}

/**
 * Zentraler Schreibweg. Bei Nutzerdaten wird in derselben Transaktion
 * kv.backup.lastChangeAt gesetzt (Grundlage der Backup-Erinnerung).
 */
export async function commit(ops, { userData = true } = {}) {
  const allOps = userData
    ? [...ops, kvOp('backup', { ...getBackupMeta(), lastChangeAt: Date.now() })]
    : ops;
  await write(db, allOps);
  for (const op of allOps) applyToCache(op);
  const stores = new Set(allOps.map((op) => op.store));
  for (const fn of listeners) fn(stores);
}

const put = (store, value) => ({ store, type: 'put', value });
const del = (store, key) => ({ store, type: 'delete', key });
const kvOp = (key, value) => put('kv', { key, value });

export function getKv(key) {
  return cache.kv.get(key)?.value;
}

async function seed() {
  const now = Date.now();
  const ops = STARTER_EXERCISES.map((name, i) =>
    put('exercises', { id: newId(), name, nameNorm: normalizeName(name), note: '', archived: false, createdAt: now + i }),
  );
  DEFAULT_CHARTS.forEach((chart, order) => ops.push(put('charts', { id: newId(), ...chart, order })));
  if (!getKv('settings')) ops.push(kvOp('settings', { ...DEFAULT_SETTINGS }));
  ops.push(kvOp('seeded', true));
  await commit(ops, { userData: false });
}

// ---------- Einstellungen und Gerätedaten ----------

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...getKv('settings') };
}

export function updateSettings(patch) {
  return commit([kvOp('settings', { ...getSettings(), ...patch })]);
}

export function getBackupMeta() {
  return { lastExportAt: null, lastChangeAt: null, snoozedUntil: null, ...getKv('backup') };
}

// ---------- Übungen ----------

export function getExercises() {
  return [...cache.exercises.values()];
}

export function getExercise(id) {
  return cache.exercises.get(id) ?? null;
}

export function exerciseName(id) {
  return getExercise(id)?.name ?? 'Unbekannte Übung';
}

export function getExerciseUsage() {
  return usageStats([...cache.workouts.values()]);
}

/**
 * Legt eine Übung an. Gibt es den Namen (normalisiert) schon, wird die vorhandene Übung
 * zurückgegeben und bei Bedarf wieder aktiviert.
 */
export async function createExercise(name) {
  const clean = cleanName(name);
  if (!clean) throw new Error('Bitte einen Namen eingeben.');
  const existing = findByName(getExercises(), clean);
  if (existing) {
    if (existing.archived) await commit([put('exercises', { ...existing, archived: false })]);
    return getExercise(existing.id);
  }
  const exercise = { id: newId(), name: clean, nameNorm: normalizeName(clean), note: '', archived: false, createdAt: Date.now() };
  await commit([put('exercises', exercise)]);
  return exercise;
}

export async function renameExercise(id, name) {
  const clean = cleanName(name);
  if (!clean) throw new Error('Bitte einen Namen eingeben.');
  const other = findByName(getExercises(), clean);
  if (other && other.id !== id) {
    throw new Error(`„${other.name}“ gibt es schon${other.archived ? ' (archiviert)' : ''}.`);
  }
  await commit([put('exercises', { ...getExercise(id), name: clean, nameNorm: normalizeName(clean) })]);
}

export function updateExerciseNote(id, note) {
  return commit([put('exercises', { ...getExercise(id), note: String(note ?? '') })]);
}

export function setExerciseArchived(id, archived) {
  return commit([put('exercises', { ...getExercise(id), archived })]);
}

/** Wird die Übung in einem Workout, Template oder Diagramm verwendet? */
export function isExerciseUsed(id) {
  const inItems = (record) => record.items.some((item) => item.exerciseId === id);
  return (
    [...cache.workouts.values()].some(inItems) ||
    [...cache.templates.values()].some(inItems) ||
    [...cache.charts.values()].some((chart) => chart.source.exerciseId === id)
  );
}

export async function deleteExercise(id) {
  if (isExerciseUsed(id)) throw new Error('Die Übung wird verwendet und kann nur archiviert werden.');
  await commit([del('exercises', id)]);
}

// ---------- Templates ----------

export const DEFAULT_PLANNED_SETS = 3;

export function getTemplates() {
  return [...cache.templates.values()].sort((a, b) => a.name.localeCompare(b.name, 'de') || a.createdAt - b.createdAt);
}

export function getTemplate(id) {
  return cache.templates.get(id) ?? null;
}

export async function createTemplate(name) {
  const clean = cleanName(name);
  if (!clean) throw new Error('Bitte einen Namen eingeben.');
  const now = Date.now();
  const template = { id: newId(), name: clean, items: [], createdAt: now, updatedAt: now };
  await commit([put('templates', template)]);
  return template;
}

/** Speichert ein geändertes Template (als Kopie, der Cache wird erst nach dem Schreiben ersetzt). */
export async function saveTemplate(template) {
  const clean = cleanName(template.name);
  if (!clean) throw new Error('Bitte einen Namen eingeben.');
  await commit([put('templates', { ...structuredClone(template), name: clean, updatedAt: Date.now() })]);
}

export async function duplicateTemplate(id) {
  const source = getTemplate(id);
  const now = Date.now();
  const copy = {
    id: newId(),
    name: `${source.name} (Kopie)`,
    items: source.items.map((item) => ({ ...item, id: newId() })),
    createdAt: now,
    updatedAt: now,
  };
  await commit([put('templates', copy)]);
  return copy;
}

export function deleteTemplate(id) {
  return commit([del('templates', id)]);
}

// ---------- Workouts ----------

const SAVE_DELAY_MS = 300;
const pendingSaves = new Map();
let saveTimer = null;

export function getWorkouts() {
  return [...cache.workouts.values()];
}

/** Abgeschlossene Workouts, chronologisch aufsteigend. */
export function getFinishedWorkouts() {
  return getWorkouts()
    .filter((w) => w.status === 'finished')
    .sort((a, b) => a.startedAt - b.startedAt);
}

export function getWorkout(id) {
  return cache.workouts.get(id) ?? null;
}

export function getActiveWorkout() {
  return getWorkouts().find((w) => w.status === 'active') ?? null;
}

export async function startWorkout({ templateId = null } = {}) {
  if (getActiveWorkout()) throw new Error('Es läuft bereits ein Training.');
  const template = templateId ? getTemplate(templateId) : null;
  const items = template
    ? template.items.filter((item) => getExercise(item.exerciseId)).map((item) => createItem(item.exerciseId, item.plannedSets))
    : [];
  const workout = createWorkout({ name: template?.name ?? 'Training', templateId: template?.id ?? null, items });
  await commit([put('workouts', workout)]);
  return workout;
}

/**
 * Das aktive Workout wird von der Workout-Ansicht direkt verändert (gleiches Objekt wie im Cache).
 * saveWorkoutSoon speichert verzögert (Texteingaben), saveWorkout sofort.
 */
export function saveWorkoutSoon(workout) {
  pendingSaves.set(workout.id, workout);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flushPendingSaves(), SAVE_DELAY_MS);
}

export async function saveWorkout(workout) {
  pendingSaves.delete(workout.id);
  workout.updatedAt = Date.now();
  await commit([put('workouts', workout)]);
}

/** Schreibt ausstehende verzögerte Speicherungen sofort (z. B. wenn die App in den Hintergrund geht). */
export async function flushPendingSaves() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!pendingSaves.size) return;
  const workouts = [...pendingSaves.values()];
  pendingSaves.clear();
  const now = Date.now();
  for (const w of workouts) w.updatedAt = now;
  try {
    await commit(workouts.map((w) => put('workouts', w)));
  } catch (err) {
    errorHandler(new Error(`Speichern fehlgeschlagen: ${err.message}`));
  }
}

/** Beendet das aktive Workout nach den Regeln aus finalizeWorkout. */
export async function finishWorkout(workout) {
  pendingSaves.delete(workout.id);
  const finished = finalizeWorkout(workout, Date.now());
  await commit([put('workouts', finished)]);
  return finished;
}

/** Speichert ein nachträglich bearbeitetes Workout (Entwurf), mit denselben Regeln wie beim Beenden. */
export async function saveEditedWorkout(draft) {
  const finished = finalizeWorkout(draft, draft.endedAt);
  await commit([put('workouts', finished)]);
  return finished;
}

/**
 * Satz-IDs mit PR-Icon über alle Workouts inkl. aktivem.
 * @param replacement ein Entwurf, der das gespeicherte Workout mit gleicher ID ersetzt (Bearbeiten)
 */
export function getPrSetIds(replacement = null) {
  const workouts = getWorkouts().map((w) => (replacement && w.id === replacement.id ? replacement : w));
  return computePRs(workouts);
}

export async function deleteWorkout(id) {
  pendingSaves.delete(id);
  await commit([del('workouts', id)]);
}

// ---------- Körpergewicht ----------

/** Einträge chronologisch aufsteigend. */
export function getBodyweights() {
  return [...cache.bodyweights.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function getBodyweight(date) {
  return cache.bodyweights.get(date) ?? null;
}

/**
 * Ein Eintrag pro Tag: erneutes Eintragen überschreibt.
 * @param state Messart: 'fasted' | 'neutral' | 'fed' (Standard „Normal“)
 */
export async function setBodyweight(date, kg, state = DEFAULT_BODYWEIGHT_STATE) {
  if (!(kg > 0)) throw new Error('Bitte ein gültiges Gewicht eingeben.');
  return commit([put('bodyweights', { date, kg: roundWeight(kg), state })]);
}

export function deleteBodyweight(date) {
  return commit([del('bodyweights', date)]);
}

// ---------- Diagramme ----------

export function getCharts() {
  return [...cache.charts.values()].sort((a, b) => a.order - b.order);
}

export function getChart(id) {
  return cache.charts.get(id) ?? null;
}

/** Neues Diagramm ans Ende, vorhandenes an seiner Position speichern. */
export async function saveChart(chart) {
  const existing = chart.id ? getChart(chart.id) : null;
  const order = existing ? existing.order : getCharts().reduce((max, c) => Math.max(max, c.order + 1), 0);
  const record = { ...structuredClone(chart), id: chart.id ?? newId(), order };
  await commit([put('charts', record)]);
  return record;
}

export async function moveChart(id, direction) {
  const charts = getCharts();
  const index = charts.findIndex((c) => c.id === id);
  const to = index + direction;
  if (index === -1 || to < 0 || to >= charts.length) return;
  [charts[index], charts[to]] = [charts[to], charts[index]];
  // Reihenfolge neu durchnummerieren
  await commit(charts.map((c, order) => put('charts', { ...c, order })));
}

export function deleteChart(id) {
  return commit([del('charts', id)]);
}

// ---------- Backup ----------

const EXPORT_STORES = ['exercises', 'templates', 'workouts', 'bodyweights', 'charts'];

/** Alle Nutzerdaten für den Export (ohne gerätelokale kv-Einträge). */
export function exportData() {
  const data = Object.fromEntries(EXPORT_STORES.map((name) => [name, structuredClone([...cache[name].values()])]));
  data.settings = getSettings();
  return data;
}

/** @param at Zeitpunkt, zu dem die Daten gelesen wurden */
export function markExported(at) {
  return commit([kvOp('backup', { ...getBackupMeta(), lastExportAt: at, snoozedUntil: null })], { userData: false });
}

export function snoozeBackupReminder(until) {
  return commit([kvOp('backup', { ...getBackupMeta(), snoozedUntil: until })], { userData: false });
}

/** Ersetzt alle Nutzerdaten atomar in einer Transaktion. data ist bereits validiert und migriert. */
export async function importData(data) {
  clearTimeout(saveTimer);
  pendingSaves.clear();
  const now = Date.now();
  const ops = [
    ...EXPORT_STORES.map((store) => ({ store, type: 'clear' })),
    ...EXPORT_STORES.flatMap((store) => data[store].map((record) => put(store, record))),
    kvOp('settings', { ...DEFAULT_SETTINGS, ...data.settings }),
    // Der Datenbestand entspricht jetzt einem Backup
    kvOp('backup', { lastExportAt: now, lastChangeAt: now, snoozedUntil: null }),
    kvOp('restTimer', { endAt: null }),
    kvOp('seeded', true),
  ];
  await commit(ops, { userData: false });
}

// ---------- Pausentimer (gerätelokal) ----------

export function getRestTimerEnd() {
  return getKv('restTimer')?.endAt ?? null;
}

export function setRestTimerEnd(endAt) {
  return commit([kvOp('restTimer', { endAt })], { userData: false });
}
