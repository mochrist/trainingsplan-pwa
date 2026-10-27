// Testdaten-Bausteine.
let counter = 0;
const id = (prefix) => `${prefix}${++counter}`;

/** Satz: w(40, 10) = erledigter Arbeitssatz, Optionen überschreiben Felder. */
export function w(weight, reps, extra = {}) {
  return { id: id('s'), type: 'work', weight, reps, rpe: null, note: '', done: true, doneAt: 1, ...extra };
}

export function warm(weight, reps, extra = {}) {
  return w(weight, reps, { type: 'warmup', ...extra });
}

export function item(exerciseId, sets) {
  return { id: id('i'), exerciseId, sets };
}

export function workout(startedAt, items, extra = {}) {
  return {
    id: id('w'),
    name: 'Test',
    templateId: null,
    status: 'finished',
    startedAt,
    endedAt: startedAt + 45 * 60000,
    updatedAt: startedAt,
    items,
    ...extra,
  };
}
