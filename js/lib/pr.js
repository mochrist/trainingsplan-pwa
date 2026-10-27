// PR-Erkennung (ohne DOM). PRs werden nie gespeichert, sondern immer aus der Historie abgeleitet.
import { isWorkSet, estimate1RM } from './workout.js';

/**
 * Ein Arbeitssatz ist ein PR, wenn sein Gewicht über dem bisherigen Maximalgewicht der Übung liegt
 * oder sein geschätztes 1RM über dem bisherigen Maximum. „Bisher“ heißt: aus früheren Workouts.
 * Beim allerersten Training einer Übung gibt es keinen PR. Pro Übung und Workout höchstens ein PR
 * (der Satz mit dem besten 1RM, bei Gleichstand dem höheren Gewicht).
 *
 * @param workouts abgeschlossene Workouts und optional das aktive (nur erledigte Sätze zählen)
 * @returns Set der Satz-IDs mit PR
 */
export function computePRs(workouts) {
  const best = new Map(); // exerciseId → { weight, e1rm }
  const prSetIds = new Set();
  const ordered = [...workouts].sort((a, b) => a.startedAt - b.startedAt);

  for (const workout of ordered) {
    const updates = [];
    for (const item of workout.items) {
      const sets = item.sets.filter(isWorkSet);
      if (!sets.length) continue;
      const previous = best.get(item.exerciseId);

      let maxWeight = -Infinity;
      let maxE1rm = -Infinity;
      let candidate = null;
      for (const set of sets) {
        const e1rm = estimate1RM(set.weight, set.reps);
        maxWeight = Math.max(maxWeight, set.weight);
        maxE1rm = Math.max(maxE1rm, e1rm);
        if (!previous || (set.weight <= previous.weight && e1rm <= previous.e1rm)) continue;
        if (!candidate || e1rm > candidate.e1rm || (e1rm === candidate.e1rm && set.weight > candidate.weight)) {
          candidate = { id: set.id, e1rm, weight: set.weight };
        }
      }
      if (candidate) prSetIds.add(candidate.id);
      // Erst nach dem Workout übernehmen, damit Sätze desselben Workouts nur gegen frühere Workouts zählen
      updates.push([item.exerciseId, previous, maxWeight, maxE1rm]);
    }
    for (const [exerciseId, previous, weight, e1rm] of updates) {
      best.set(exerciseId, {
        weight: Math.max(previous?.weight ?? -Infinity, weight),
        e1rm: Math.max(previous?.e1rm ?? -Infinity, e1rm),
      });
    }
  }
  return prSetIds;
}
