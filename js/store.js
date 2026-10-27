// Datenzugriff für die Views: In-Memory-Cache über IndexedDB.
// Lesen geht synchron auf den Cache, Schreiben erst nach IndexedDB, dann in den Cache.
import { openDatabase, readAll, write, keyOf, STORES } from './db.js';
import { cleanName, normalizeName, findByName } from './lib/normalize.js';
import { usageStats } from './lib/history.js';
import { newId } from './lib/html.js';

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
