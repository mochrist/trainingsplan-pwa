// Aktives Workout als Vollbild-Ansicht.
import * as store from '../store.js';
import { esc } from '../lib/html.js';
import { countFilledSets } from '../lib/workout.js';
import { formatDuration } from '../lib/time.js';
import { mountWorkoutEditor } from '../components/workout-editor.js';
import { confirmDialog, promptDialog } from '../components/sheet.js';
import { toastError } from '../components/toast.js';
import { icons } from '../components/icons.js';
import { navigate } from '../nav.js';

let cleanup = [];

export function render(root) {
  const workout = store.getActiveWorkout();
  if (!workout) {
    root.innerHTML = `
      <a href="#/today" class="btn">‹ Heute</a>
      <p class="empty-state">Kein aktives Training.</p>
    `;
    return;
  }

  root.innerHTML = `
    <header class="workout-header">
      <a href="#/today" class="icon-btn" aria-label="Zurück zu Heute">${icons.back}</a>
      <button type="button" class="workout-title" data-action="rename">${esc(workout.name)}</button>
      <span class="workout-clock" data-clock aria-label="Trainingsdauer">${formatDuration(Date.now() - workout.startedAt)}</span>
      <button type="button" class="btn btn-primary" data-action="finish">Beenden</button>
    </header>
    <div data-editor></div>
  `;

  const save = (structural) => {
    if (structural) store.saveWorkout(workout).catch(toastError);
    else store.saveWorkoutSoon(workout);
  };

  const editor = mountWorkoutEditor(root.querySelector('[data-editor]'), {
    workout,
    mode: 'live',
    onChange: save,
    getPrSetIds: () => new Set(),
  });

  const clock = root.querySelector('[data-clock]');
  const clockTimer = setInterval(() => {
    clock.textContent = formatDuration(Date.now() - workout.startedAt);
  }, 1000);

  cleanup = [
    () => clearInterval(clockTimer),
    () => editor.destroy(),
    () => store.flushPendingSaves(),
  ];

  root.querySelector('[data-action="rename"]').addEventListener('click', async (event) => {
    const name = await promptDialog({ title: 'Training umbenennen', label: 'Name', value: workout.name });
    if (!name?.trim()) return;
    workout.name = name.trim();
    event.target.textContent = workout.name;
    save(true);
  });

  root.querySelector('[data-action="finish"]').addEventListener('click', () => finish(workout));
}

async function finish(workout) {
  try {
    await store.flushPendingSaves();
    if (countFilledSets(workout) === 0) {
      const discard = await confirmDialog({
        title: 'Keine Sätze eingetragen',
        message: 'Das Training enthält keinen ausgefüllten Satz. Soll es verworfen werden?',
        confirmLabel: 'Verwerfen',
        cancelLabel: 'Weiter trainieren',
        danger: true,
      });
      if (!discard) return;
      await store.deleteWorkout(workout.id);
      navigate('today');
      return;
    }
    const ok = await confirmDialog({
      title: 'Training beenden?',
      message: 'Ausgefüllte Sätze werden übernommen, leere Sätze verworfen.',
      confirmLabel: 'Beenden',
    });
    if (!ok) return;
    const finished = await store.finishWorkout(workout);
    navigate(`session/${finished.id}/summary`);
  } catch (err) {
    toastError(err);
  }
}

export function destroy() {
  for (const fn of cleanup) fn();
  cleanup = [];
}
