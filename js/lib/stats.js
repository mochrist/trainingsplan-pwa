// Kennzahlen für Zusammenfassung und Diagramme (ohne DOM).
import { isWorkSet, estimate1RM } from './workout.js';
import { parseDayKey, rangeStart } from './time.js';

export const SOURCES = {
  exercise: 'Übung',
  bodyweight: 'Körpergewicht',
  duration: 'Trainingsdauer',
};

export const METRICS = {
  maxWeight: { label: 'Maximalgewicht', unit: 'kg', source: 'exercise' },
  volume: { label: 'Gesamtvolumen', unit: 'kg', source: 'exercise' },
  e1rm: { label: 'Geschätztes 1RM', unit: 'kg', source: 'exercise' },
  reps: { label: 'Wiederholungen gesamt', unit: 'Wdh.', source: 'exercise' },
  avgRpe: { label: 'Ø RPE', unit: '', source: 'exercise' },
  kg: { label: 'Körpergewicht', unit: 'kg', source: 'bodyweight' },
  minutes: { label: 'Minuten', unit: 'min', source: 'duration' },
};

export const RANGES = {
  '4w': '4 Wochen',
  '3m': '3 Monate',
  '6m': '6 Monate',
  '1y': '1 Jahr',
  all: 'Alles',
};

export const CHART_TYPES = {
  line: 'Linie',
  bar: 'Balken',
};

const HOUR_MS = 60 * 60 * 1000;

/** Kennzahlen eines Workouts. Volumen nur aus Arbeitssätzen. */
export function workoutTotals(workout, prSetIds = new Set()) {
  let setCount = 0;
  let volume = 0;
  let prCount = 0;
  for (const item of workout.items) {
    for (const set of item.sets) {
      if (!set.done) continue;
      setCount++;
      if (isWorkSet(set)) volume += set.weight * set.reps;
      if (prSetIds.has(set.id)) prCount++;
    }
  }
  return {
    durationMs: (workout.endedAt ?? Date.now()) - workout.startedAt,
    exerciseCount: workout.items.length,
    setCount,
    volume: Math.round(volume * 100) / 100,
    prCount,
  };
}

/** Gibt es RPE-Werte für diese Übung? (Ø RPE wird nur dann angeboten.) */
export function hasRpeData(workouts, exerciseId) {
  return workouts.some((w) =>
    w.items.some((item) => item.exerciseId === exerciseId && item.sets.some((s) => isWorkSet(s) && s.rpe != null)),
  );
}

/** Metriken, die für eine Datenquelle wählbar sind. */
export function metricsFor(kind, { hasRpe = false } = {}) {
  return Object.keys(METRICS).filter((key) => METRICS[key].source === kind && (key !== 'avgRpe' || hasRpe));
}

export function defaultTitle(chart, exerciseName = '') {
  if (chart.source.kind === 'exercise') return `${exerciseName} · ${METRICS[chart.metric]?.label ?? ''}`;
  return SOURCES[chart.source.kind];
}

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Wert einer Übungs-Metrik für die Arbeitssätze eines Trainings, oder null. */
function exerciseMetric(metric, sets) {
  switch (metric) {
    case 'maxWeight':
      return Math.max(...sets.map((s) => s.weight));
    case 'volume':
      return round(sets.reduce((sum, s) => sum + s.weight * s.reps, 0));
    case 'e1rm':
      return round(Math.max(...sets.map((s) => estimate1RM(s.weight, s.reps))), 1);
    case 'reps':
      return sets.reduce((sum, s) => sum + s.reps, 0);
    case 'avgRpe': {
      const rated = sets.filter((s) => s.rpe != null);
      return rated.length ? round(rated.reduce((sum, s) => sum + s.rpe, 0) / rated.length, 1) : null;
    }
    default:
      return null;
  }
}

/**
 * Datenpunkte { x: Zeitstempel, y } eines Diagramms, chronologisch.
 * Ein Punkt je Training (bei Körpergewicht je Tag). Aufwärmsätze zählen nicht.
 */
export function chartSeries(chart, { workouts, bodyweights }, now = Date.now()) {
  const start = rangeStart(chart.range, now);
  const finished = workouts.filter((w) => w.status === 'finished' && w.startedAt >= start);
  const points = [];

  if (chart.source.kind === 'exercise') {
    for (const workout of finished) {
      const item = workout.items.find((i) => i.exerciseId === chart.source.exerciseId);
      const sets = item?.sets.filter(isWorkSet) ?? [];
      if (!sets.length) continue;
      const y = exerciseMetric(chart.metric, sets);
      if (y != null) points.push({ x: workout.startedAt, y });
    }
  } else if (chart.source.kind === 'bodyweight') {
    for (const entry of bodyweights) {
      // Mittag, damit der Punkt mittig auf dem Tag liegt
      const x = parseDayKey(entry.date).getTime() + 12 * HOUR_MS;
      if (x >= start) points.push({ x, y: entry.kg });
    }
  } else if (chart.source.kind === 'duration') {
    for (const workout of finished) {
      points.push({ x: workout.startedAt, y: Math.round((workout.endedAt - workout.startedAt) / 60000) });
    }
  }

  return points.sort((a, b) => a.x - b.x);
}

/** Letzter Wert und Änderung im Zeitraum (erster → letzter Punkt). */
export function seriesSummary(points) {
  if (!points.length) return null;
  const last = points.at(-1).y;
  return { last, change: points.length > 1 ? round(last - points[0].y) : null };
}

function niceStep(rough) {
  const exponent = Math.floor(Math.log10(rough));
  const fraction = rough / 10 ** exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * 10 ** exponent;
}

/**
 * Gut gerundete Achsenwerte, die min und max einschließen.
 * @returns { min, max, step, ticks }
 */
export function niceTicks(min, max, targetCount = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, step: 1, ticks: [0, 1] };
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const step = niceStep((max - min) / targetCount);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + step / 1000; v += step) ticks.push(round(v, 6));
  return { min: round(niceMin, 6), max: round(niceMax, 6), step, ticks };
}
