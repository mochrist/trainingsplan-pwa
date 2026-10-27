// Regeln für Workouts und Sätze (ohne DOM).
import { newId } from './html.js';

export function createSet(type = 'work') {
  return { id: newId(), type, weight: null, reps: null, rpe: null, note: '', done: false, doneAt: null };
}

export function createItem(exerciseId, setCount = 0) {
  return { id: newId(), exerciseId, sets: Array.from({ length: setCount }, () => createSet()) };
}

export function createWorkout({ name, templateId = null, items = [], now = Date.now() }) {
  return {
    id: newId(),
    name,
    templateId,
    status: 'active',
    startedAt: now,
    endedAt: null,
    updatedAt: now,
    items,
  };
}

/** Gewicht und Wiederholungen ausgefüllt (Gewicht 0 zählt als ausgefüllt). */
export function isFilled(set) {
  return set.weight != null && set.reps != null;
}

/** Zählt für Volumen, Maximalgewicht, 1RM, PRs, „Letzte Werte" und Diagramme. */
export function isWorkSet(set) {
  return set.type === 'work' && set.done && isFilled(set) && set.reps > 0;
}

/** Geschätztes 1RM nach Epley, bei einer Wiederholung das Gewicht selbst. */
export function estimate1RM(weight, reps) {
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

/**
 * Regeln beim Beenden bzw. Speichern eines abgeschlossenen Workouts:
 * ausgefüllte Sätze gelten als erledigt, leere Sätze und Übungen ohne Sätze entfallen.
 * Gibt ein neues Objekt zurück.
 */
export function finalizeWorkout(workout, endedAt) {
  const items = workout.items
    .map((item) => ({
      ...item,
      sets: item.sets
        .filter(isFilled)
        .map((set) => (set.done ? { ...set } : { ...set, done: true, doneAt: endedAt })),
    }))
    .filter((item) => item.sets.length > 0);
  return { ...workout, items, status: 'finished', endedAt, updatedAt: Date.now() };
}

export function countFilledSets(workout) {
  return workout.items.reduce((sum, item) => sum + item.sets.filter(isFilled).length, 0);
}
