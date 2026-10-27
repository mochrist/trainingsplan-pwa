// Kennzahlen für Zusammenfassung und Diagramme (ohne DOM).
import { isWorkSet } from './workout.js';

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
