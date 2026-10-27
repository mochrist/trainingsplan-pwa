// Backup-Format, Validierung und Erinnerungslogik (ohne DOM).
import { DATA_VERSION, migrate } from './migrate.js';
import { dayKey } from './time.js';
import { SOURCES, METRICS, RANGES, CHART_TYPES, BODYWEIGHT_STATES } from './stats.js';

export const APP_ID = 'trainingsplan';
export const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
export const REMINDER_OPTIONS = [7, 14, 30, 0]; // 0 = aus

const DAY_MS = 24 * 60 * 60 * 1000;

/** data: { exercises, templates, workouts, bodyweights, charts, settings } */
export function buildBackup(data, now = Date.now()) {
  return { app: APP_ID, schemaVersion: DATA_VERSION, exportedAt: now, data };
}

export function backupFileName(now = Date.now()) {
  return `trainingsplan-backup-${dayKey(now)}.json`;
}

export function summarizeData(data) {
  return {
    exercises: data.exercises.length,
    templates: data.templates.length,
    workouts: data.workouts.filter((w) => w.status === 'finished').length,
    bodyweights: data.bodyweights.length,
    charts: data.charts.length,
  };
}

/**
 * Liest und prüft eine Backup-Datei. Ältere Versionen werden migriert.
 * @returns { data, exportedAt, summary }
 * @throws Error mit verständlicher Meldung
 */
export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine gültige JSON-Datei.');
  }
  if (!isObject(parsed) || parsed.app !== APP_ID) throw new Error('Die Datei ist kein Trainingsplan-Backup.');
  if (!Number.isInteger(parsed.schemaVersion)) throw new Error('Die Datei hat keine gültige Schema-Version.');
  if (!isObject(parsed.data)) throw new Error('Die Datei enthält keine Daten.');
  const data = migrate(parsed.data, parsed.schemaVersion);
  validateData(data);
  return { data, exportedAt: parsed.exportedAt ?? null, summary: summarizeData(data) };
}

// ---------- Validierung ----------

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isString = (v) => typeof v === 'string';
const isNonEmptyString = (v) => isString(v) && v.trim().length > 0;
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isNullOr = (check) => (v) => v === null || check(v);

class ValidationError extends Error {}

function check(condition, message) {
  if (!condition) throw new ValidationError(message);
}

function checkUnique(values, message) {
  check(new Set(values).size === values.length, message);
}

export function validateData(data) {
  try {
    validate(data);
  } catch (err) {
    if (err instanceof ValidationError) throw new Error(`Backup ist beschädigt: ${err.message}`);
    throw err;
  }
}

function validate(data) {
  for (const key of ['exercises', 'templates', 'workouts', 'bodyweights', 'charts']) {
    check(Array.isArray(data[key]), `„${key}“ fehlt`);
  }
  check(isObject(data.settings), '„settings“ fehlt');

  // Übungen
  for (const e of data.exercises) {
    check(isObject(e) && isNonEmptyString(e.id) && isNonEmptyString(e.name) && isNonEmptyString(e.nameNorm), 'ungültige Übung');
    check(typeof e.archived === 'boolean' && isString(e.note) && isNumber(e.createdAt), `ungültige Übung „${e.name}“`);
  }
  checkUnique(data.exercises.map((e) => e.id), 'doppelte Übungs-IDs');
  checkUnique(data.exercises.map((e) => e.nameNorm), 'doppelte Übungsnamen');
  const exerciseIds = new Set(data.exercises.map((e) => e.id));
  const knownExercise = (id) => exerciseIds.has(id);

  // Templates
  for (const t of data.templates) {
    check(isObject(t) && isNonEmptyString(t.id) && isNonEmptyString(t.name) && Array.isArray(t.items), 'ungültiges Template');
    for (const item of t.items) {
      check(isObject(item) && isNonEmptyString(item.id) && knownExercise(item.exerciseId), `Template „${t.name}“ verweist auf unbekannte Übung`);
      check(Number.isInteger(item.plannedSets) && item.plannedSets >= 1, `Template „${t.name}“ hat ungültige Satzanzahl`);
    }
  }
  checkUnique(data.templates.map((t) => t.id), 'doppelte Template-IDs');

  // Workouts
  for (const w of data.workouts) {
    check(isObject(w) && isNonEmptyString(w.id) && isString(w.name) && Array.isArray(w.items), 'ungültiges Training');
    check(w.status === 'active' || w.status === 'finished', 'ungültiger Trainingsstatus');
    check(isNumber(w.startedAt), 'Training ohne Startzeit');
    check(w.status === 'active' ? w.endedAt === null : isNumber(w.endedAt) && w.endedAt >= w.startedAt, 'Training mit ungültiger Endzeit');
    for (const item of w.items) {
      check(isObject(item) && isNonEmptyString(item.id) && knownExercise(item.exerciseId), 'Training verweist auf unbekannte Übung');
      check(Array.isArray(item.sets), 'Training ohne Satzliste');
      for (const s of item.sets) {
        check(isObject(s) && isNonEmptyString(s.id) && (s.type === 'work' || s.type === 'warmup'), 'ungültiger Satz');
        check(isNullOr((v) => isNumber(v) && v >= 0)(s.weight), 'ungültiges Gewicht');
        check(isNullOr((v) => Number.isInteger(v) && v >= 0)(s.reps), 'ungültige Wiederholungen');
        check(isNullOr(isNumber)(s.rpe) && isString(s.note) && typeof s.done === 'boolean', 'ungültiger Satz');
      }
    }
  }
  checkUnique(data.workouts.map((w) => w.id), 'doppelte Trainings-IDs');
  check(data.workouts.filter((w) => w.status === 'active').length <= 1, 'mehr als ein aktives Training');

  // Körpergewicht
  for (const b of data.bodyweights) {
    check(isObject(b) && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && isNumber(b.kg) && b.kg > 0, 'ungültiger Körpergewicht-Eintrag');
    check(b.state in BODYWEIGHT_STATES, 'Körpergewicht-Eintrag mit ungültiger Messart');
  }
  checkUnique(data.bodyweights.map((b) => b.date), 'doppelte Körpergewicht-Tage');

  // Diagramme
  for (const c of data.charts) {
    check(isObject(c) && isNonEmptyString(c.id) && isString(c.title) && isObject(c.source), 'ungültiges Diagramm');
    check(c.source.kind in SOURCES, 'Diagramm mit unbekannter Datenquelle');
    check(c.source.kind !== 'exercise' || knownExercise(c.source.exerciseId), 'Diagramm verweist auf unbekannte Übung');
    check(c.metric in METRICS && METRICS[c.metric].source === c.source.kind, 'Diagramm mit ungültiger Metrik');
    check(c.range in RANGES && c.chartType in CHART_TYPES && isNumber(c.order), 'Diagramm mit ungültigen Einstellungen');
    check(
      c.states === undefined || (Array.isArray(c.states) && c.states.length > 0 && c.states.every((k) => k in BODYWEIGHT_STATES)),
      'Diagramm mit ungültiger Messart-Auswahl',
    );
  }
  checkUnique(data.charts.map((c) => c.id), 'doppelte Diagramm-IDs');

  // Einstellungen
  const s = data.settings;
  check(isNumber(s.restSeconds) && s.restSeconds > 0, 'ungültige Pausendauer');
  check(isNumber(s.weightStep) && s.weightStep > 0, 'ungültige Schrittweite');
  check(typeof s.rpeEnabled === 'boolean', 'ungültige RPE-Einstellung');
  check(REMINDER_OPTIONS.includes(s.backupReminderDays), 'ungültiges Erinnerungsintervall');
}

// ---------- Erinnerung ----------

/**
 * Banner „Zeit für ein Backup“ anzeigen?
 * @param backup { lastExportAt, lastChangeAt, snoozedUntil }
 * @param reminderDays 0 = aus
 */
export function shouldRemind({ backup, reminderDays, hasFinishedWorkout, now = Date.now() }) {
  if (!reminderDays) return false;
  if (backup.snoozedUntil && backup.snoozedUntil > now) return false;
  const dirty = backup.lastChangeAt != null && backup.lastChangeAt > (backup.lastExportAt ?? 0);
  if (!dirty) return false;
  if (backup.lastExportAt == null) return hasFinishedWorkout;
  return now - backup.lastExportAt > reminderDays * DAY_MS;
}
