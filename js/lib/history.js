// Auswertungen über die Trainingshistorie (ohne DOM).
import { isWorkSet } from './workout.js';

/** Map exerciseId → { count, lastAt } über alle Workouts (für das Ranking der Autovervollständigung). */
export function usageStats(workouts) {
  const usage = new Map();
  for (const workout of workouts) {
    for (const item of workout.items) {
      const entry = usage.get(item.exerciseId) ?? { count: 0, lastAt: 0 };
      entry.count += 1;
      entry.lastAt = Math.max(entry.lastAt, workout.startedAt);
      usage.set(item.exerciseId, entry);
    }
  }
  return usage;
}

/**
 * Letzte abgeschlossene Session mit mindestens einem Arbeitssatz der Übung.
 * @param excludeWorkoutId das aktuelle Workout
 * @param before nur Sessions, die vor diesem Zeitpunkt begonnen haben (beim Bearbeiten alter Sessions)
 * @returns { workoutId, startedAt, sets } mit nur den Arbeitssätzen, oder null
 */
export function lastSession(workouts, exerciseId, { excludeWorkoutId = null, before = Infinity } = {}) {
  let best = null;
  for (const workout of workouts) {
    if (workout.status !== 'finished' || workout.id === excludeWorkoutId || workout.startedAt >= before) continue;
    if (best && workout.startedAt <= best.startedAt) continue;
    const item = workout.items.find((i) => i.exerciseId === exerciseId);
    const sets = item?.sets.filter(isWorkSet) ?? [];
    if (sets.length) best = { workoutId: workout.id, startedAt: workout.startedAt, sets };
  }
  return best;
}
