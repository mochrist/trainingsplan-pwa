// Session-Detail (Kalender), Zusammenfassung nach dem Beenden und nachträgliches Bearbeiten.
import * as store from '../store.js';
import { esc } from '../lib/html.js';
import { formatNumber, parseInteger } from '../lib/numbers.js';
import { formatDateLong, formatTime, formatMinutes, toDateInput, toTimeInput, combineDateTime } from '../lib/time.js';
import { workoutTotals } from '../lib/stats.js';
import { finalizeWorkout, countFilledSets } from '../lib/workout.js';
import { mountWorkoutEditor } from '../components/workout-editor.js';
import { confirmDialog } from '../components/sheet.js';
import { toast, toastError } from '../components/toast.js';
import { icons } from '../components/icons.js';
import { navigate } from '../nav.js';

let cleanup = null;

export function render(root, [id, mode] = []) {
  const workout = store.getWorkout(id);
  if (!workout || workout.status !== 'finished') {
    root.innerHTML = `
      <a href="#/calendar" class="btn">‹ Kalender</a>
      <p class="empty-state">Training nicht gefunden.</p>
    `;
    return;
  }
  showView(root, id, mode === 'summary');
}

export function destroy() {
  cleanup?.();
  cleanup = null;
}

/** Ersetzt den Inhalt durch ein frisches Element, damit alte Listener verschwinden. */
function freshContainer(root) {
  destroy();
  const container = document.createElement('div');
  root.replaceChildren(container);
  window.scrollTo(0, 0);
  return container;
}

// ---------- Ansicht ----------

function showView(root, id, isSummary) {
  const workout = store.getWorkout(id);
  const container = freshContainer(root);
  const settings = store.getSettings();
  const prSetIds = store.getPrSetIds();
  const totals = workoutTotals(workout, prSetIds);

  container.innerHTML = `
    <div class="toolbar">
      ${isSummary ? '<span></span>' : '<a href="#/calendar" class="btn">‹ Kalender</a>'}
      <button type="button" class="btn" data-action="edit">Bearbeiten</button>
    </div>

    ${isSummary ? '<p class="summary-kicker">Training beendet</p>' : ''}
    <h1>${esc(workout.name)}</h1>
    <p class="muted subtitle">${formatDateLong(workout.startedAt)} · ${formatTime(workout.startedAt)}–${formatTime(workout.endedAt)} Uhr</p>

    <div class="stat-grid">
      <div class="stat"><span class="stat-value">${formatMinutes(totals.durationMs)}</span><span class="stat-label">Dauer</span></div>
      <div class="stat"><span class="stat-value">${totals.setCount}</span><span class="stat-label">Sätze</span></div>
      <div class="stat"><span class="stat-value">${formatNumber(Math.round(totals.volume))} kg</span><span class="stat-label">Volumen</span></div>
      <div class="stat"><span class="stat-value">${totals.prCount}</span><span class="stat-label">PRs</span></div>
    </div>

    ${workout.items.map((item) => renderItem(item, prSetIds, settings)).join('')}

    ${isSummary ? '<a href="#/today" class="btn btn-primary btn-block">Fertig</a>' : ''}
  `;

  container.querySelector('[data-action="edit"]').addEventListener('click', () => showEdit(root, id));
}

function renderItem(item, prSetIds, settings) {
  let workNumber = 0;
  const rows = item.sets
    .map((set) => {
      const label = set.type === 'warmup' ? 'W' : ++workNumber;
      const rpe = settings.rpeEnabled && set.rpe != null ? ` <span class="muted">@${formatNumber(set.rpe)}</span>` : '';
      return `
        <li class="detail-set${set.type === 'warmup' ? ' is-warmup' : ''}">
          <span class="detail-set-num">${label}</span>
          <span class="detail-set-values">${formatNumber(set.weight)} kg × ${set.reps}${rpe}</span>
          ${prSetIds.has(set.id) ? `<span class="pr-inline" title="Persönlicher Rekord">${icons.trophy}</span>` : ''}
          ${set.note ? `<span class="detail-set-note muted small">${esc(set.note)}</span>` : ''}
        </li>`;
    })
    .join('');
  return `
    <section class="card">
      <h3 class="detail-ex-name">${esc(store.exerciseName(item.exerciseId))}</h3>
      <ul class="detail-sets">${rows}</ul>
    </section>
  `;
}

// ---------- Bearbeiten ----------

function showEdit(root, id) {
  const original = store.getWorkout(id);
  const draft = structuredClone(original);
  const container = freshContainer(root);
  const durationMinutes = Math.max(1, Math.round((draft.endedAt - draft.startedAt) / 60000));

  container.innerHTML = `
    <div class="toolbar">
      <button type="button" class="btn" data-action="cancel">Abbrechen</button>
      <button type="button" class="btn btn-primary" data-action="save">Speichern</button>
    </div>

    <h1>Training bearbeiten</h1>

    <div class="card edit-fields">
      <label class="field">
        <span>Name</span>
        <input type="text" name="name" value="${esc(draft.name)}" autocomplete="off">
      </label>
      <div class="field-row">
        <label class="field">
          <span>Datum</span>
          <input type="date" name="date" value="${toDateInput(draft.startedAt)}">
        </label>
        <label class="field">
          <span>Start</span>
          <input type="time" name="time" value="${toTimeInput(draft.startedAt)}">
        </label>
        <label class="field">
          <span>Dauer (min)</span>
          <input type="text" name="duration" inputmode="numeric" pattern="[0-9]*" value="${durationMinutes}">
        </label>
      </div>
    </div>

    <div data-editor></div>

    <div class="actions-bottom">
      <button type="button" class="btn btn-block btn-danger-outline" data-action="delete">Training löschen</button>
    </div>
  `;

  const editor = mountWorkoutEditor(container.querySelector('[data-editor]'), {
    workout: draft,
    mode: 'edit',
    onChange: () => {},
    // PR-Icons live mit dem Entwurf berechnen (gleiche Regeln wie nach dem Speichern)
    getPrSetIds: () => store.getPrSetIds(finalizeWorkout(draft, draft.endedAt)),
    historyBefore: draft.startedAt,
  });
  cleanup = () => editor.destroy();

  const field = (name) => container.querySelector(`[name="${name}"]`);

  container.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'cancel') {
      showView(root, id, false);
    } else if (action === 'save') {
      await save();
    } else if (action === 'delete') {
      const ok = await confirmDialog({
        title: 'Training löschen?',
        message: `${original.name}, ${formatDateLong(original.startedAt)}. Das lässt sich nicht rückgängig machen.`,
        confirmLabel: 'Löschen',
        danger: true,
      });
      if (!ok) return;
      try {
        await store.deleteWorkout(id);
        toast('Training gelöscht');
        navigate('calendar');
      } catch (err) {
        toastError(err);
      }
    }
  });

  async function save() {
    const name = field('name').value.trim();
    const startedAt = combineDateTime(field('date').value, field('time').value);
    const minutes = parseInteger(field('duration').value);
    if (!name) return toastError(new Error('Bitte einen Namen eingeben.'));
    if (startedAt == null) return toastError(new Error('Bitte Datum und Uhrzeit prüfen.'));
    if (!minutes || minutes < 1) return toastError(new Error('Die Dauer muss mindestens 1 Minute sein.'));

    draft.name = name;
    draft.startedAt = startedAt;
    draft.endedAt = startedAt + minutes * 60000;

    try {
      if (countFilledSets(draft) === 0) {
        const remove = await confirmDialog({
          title: 'Keine Sätze mehr',
          message: 'Das Training enthält keinen ausgefüllten Satz. Soll es gelöscht werden?',
          confirmLabel: 'Löschen',
          danger: true,
        });
        if (!remove) return;
        await store.deleteWorkout(id);
        navigate('calendar');
        return;
      }
      await store.saveEditedWorkout(draft);
      toast('Gespeichert');
      showView(root, id, false);
    } catch (err) {
      toastError(err);
    }
  }
}
