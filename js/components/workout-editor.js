// Übungen und Satzzeilen eines Workouts. Wird im Live-Workout und beim nachträglichen Bearbeiten verwendet.
//
// Das übergebene workout-Objekt wird direkt verändert. Texteingaben rendern nichts neu (Fokus und Tastatur
// bleiben erhalten), nur strukturelle Änderungen rendern die betroffene Übung neu.
import * as store from '../store.js';
import { esc } from '../lib/html.js';
import { createSet, createItem, isFilled } from '../lib/workout.js';
import { lastSession } from '../lib/history.js';
import { parseDecimal, parseInteger, stepWeight, formatNumber, formatSet } from '../lib/numbers.js';
import { formatDateShort } from '../lib/time.js';
import { pickExercise } from './exercise-picker.js';
import { openSheet, confirmDialog } from './sheet.js';
import { icons } from './icons.js';
import { toastError } from './toast.js';

const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const NOTE_SAVE_DELAY_MS = 600;

/**
 * @param mode 'live' (mit Haken und Pausentimer) oder 'edit'
 * @param onChange(structural) nach jeder Änderung; structural = sofort speichern
 * @param onSetDone(set) wenn ein Satz abgehakt wurde (nur live)
 * @param getPrSetIds() → Set der Satz-IDs mit PR-Icon
 * @param historyBefore nur Sessions vor diesem Zeitpunkt für „Letzte Werte“ (beim Bearbeiten)
 */
export function mountWorkoutEditor(container, { workout, mode, onChange, onSetDone, getPrSetIds = () => new Set(), historyBefore = Infinity }) {
  const live = mode === 'live';
  const settings = store.getSettings();
  const openNotes = new Set();
  const noteTimers = new Map();
  const lastCache = new Map();
  let prSetIds = new Set();

  container.classList.add('workout-editor');
  container.classList.toggle('live', live);
  container.classList.toggle('rpe', settings.rpeEnabled);

  function lastFor(exerciseId) {
    if (!lastCache.has(exerciseId)) {
      lastCache.set(exerciseId, lastSession(store.getWorkouts(), exerciseId, { excludeWorkoutId: workout.id, before: historyBefore }));
    }
    return lastCache.get(exerciseId);
  }

  /** Werte der Satznummer n aus der letzten Session (nur Arbeitssätze). */
  function placeholderFor(item, set) {
    if (set.type !== 'work') return null;
    const index = item.sets.filter((s) => s.type === 'work').indexOf(set);
    return lastFor(item.exerciseId)?.sets[index] ?? null;
  }

  // ---------- Rendern ----------

  function renderSet(item, set, number) {
    const ph = placeholderFor(item, set);
    const classes = ['set-row'];
    if (set.type === 'warmup') classes.push('is-warmup');
    if (live && set.done) classes.push('is-done');
    if (prSetIds.has(set.id)) classes.push('is-pr');
    const rpeOptions = RPE_VALUES.map(
      (v) => `<option value="${v}" ${set.rpe === v ? 'selected' : ''}>${formatNumber(v)}</option>`,
    ).join('');

    return `
      <div class="set" data-set="${esc(set.id)}">
        <div class="${classes.join(' ')}">
          <button type="button" class="set-num" data-action="toggle-type" aria-label="Satztyp wechseln (Arbeitssatz/Aufwärmsatz)">
            ${set.type === 'warmup' ? 'W' : number}
            <span class="pr-badge" title="Persönlicher Rekord">${icons.trophy}</span>
          </button>
          <div class="weight-group">
            <button type="button" class="step-btn" data-action="dec" aria-label="Gewicht verringern">−</button>
            <input class="num-input" data-field="weight" inputmode="decimal" autocomplete="off"
              placeholder="${ph ? esc(formatNumber(ph.weight)) : 'kg'}" value="${esc(formatNumber(set.weight))}" aria-label="Gewicht in kg">
            <button type="button" class="step-btn" data-action="inc" aria-label="Gewicht erhöhen">+</button>
          </div>
          <input class="num-input" data-field="reps" inputmode="numeric" pattern="[0-9]*" autocomplete="off"
            placeholder="${ph ? ph.reps : 'Wdh'}" value="${set.reps ?? ''}" aria-label="Wiederholungen">
          ${settings.rpeEnabled ? `<select class="rpe-select" data-field="rpe" aria-label="RPE"><option value="">–</option>${rpeOptions}</select>` : ''}
          <button type="button" class="icon-btn set-menu${set.note ? ' has-note' : ''}" data-action="set-menu" aria-label="Satz-Optionen">
            ${set.note ? icons.note : icons.more}
          </button>
          ${
            live
              ? `<button type="button" class="check-btn" data-action="done" aria-label="Satz erledigt" aria-pressed="${set.done}" ${isFilled(set) ? '' : 'disabled'}>${icons.check}</button>`
              : ''
          }
        </div>
        ${set.note ? `<div class="set-note">${esc(set.note)}</div>` : ''}
      </div>
    `;
  }

  function renderItem(item) {
    const exercise = store.getExercise(item.exerciseId);
    // Noch nicht gespeicherte Notiz hat Vorrang vor dem Stand im Cache
    const note = noteTimers.get(item.exerciseId)?.value ?? exercise?.note ?? '';
    const last = lastFor(item.exerciseId);
    const lastLine = last
      ? `Letztes Mal (${formatDateShort(last.startedAt)}): ${last.sets.map((s) => formatSet(s, { withRpe: settings.rpeEnabled })).join(' · ')}`
      : 'Noch keine früheren Werte';
    let workNumber = 0;
    const rows = item.sets.map((set) => renderSet(item, set, set.type === 'work' ? ++workNumber : null)).join('');

    return `
      <section class="ex-block" data-item="${esc(item.id)}">
        <header class="ex-header">
          <h3>${esc(exercise?.name ?? 'Unbekannte Übung')}</h3>
          <button type="button" class="icon-btn note-toggle${note ? ' has-note' : ''}" data-action="toggle-exnote" aria-label="Übungsnotiz" aria-expanded="${openNotes.has(item.id)}">${icons.note}</button>
          <button type="button" class="icon-btn" data-action="item-menu" aria-label="Übungs-Optionen">${icons.more}</button>
        </header>
        <div class="ex-note" ${openNotes.has(item.id) ? '' : 'hidden'}>
          <textarea data-field="exnote" rows="2" placeholder="Dauerhafte Notiz, z. B. Sitzhöhe oder Griffbreite">${esc(note)}</textarea>
        </div>
        <p class="last-line">${esc(lastLine)}</p>
        ${
          item.sets.length
            ? `<div class="set-head">
                <span>Satz</span><span>kg</span><span>Wdh</span>${settings.rpeEnabled ? '<span>RPE</span>' : ''}<span></span>${live ? '<span></span>' : ''}
              </div>`
            : ''
        }
        <div class="sets">${rows}</div>
        <button type="button" class="btn add-set" data-action="add-set">+ Satz</button>
      </section>
    `;
  }

  function renderAll() {
    prSetIds = getPrSetIds();
    container.innerHTML = `
      <div class="ex-list">
        ${workout.items.length ? workout.items.map(renderItem).join('') : '<p class="empty-state">Noch keine Übungen.</p>'}
      </div>
      <button type="button" class="btn btn-block add-exercise" data-action="add-exercise">+ Übung hinzufügen</button>
    `;
  }

  function rerenderItem(item) {
    prSetIds = getPrSetIds();
    const el = container.querySelector(`[data-item="${CSS.escape(item.id)}"]`);
    if (el) el.outerHTML = renderItem(item);
  }

  function refreshPRs() {
    prSetIds = getPrSetIds();
    for (const el of container.querySelectorAll('.set')) {
      el.querySelector('.set-row').classList.toggle('is-pr', prSetIds.has(el.dataset.set));
    }
  }

  /** Zustand einer Satzzeile nach Eingaben aktualisieren, ohne neu zu rendern. */
  function updateRowState(setEl, set) {
    if (!isFilled(set) && set.done) {
      set.done = false;
      set.doneAt = null;
    }
    const row = setEl.querySelector('.set-row');
    row.classList.toggle('is-done', live && set.done);
    const check = row.querySelector('[data-action="done"]');
    if (check) {
      check.disabled = !isFilled(set);
      check.setAttribute('aria-pressed', String(set.done));
    }
  }

  // ---------- Hilfen ----------

  function locate(el) {
    const itemEl = el.closest('[data-item]');
    const item = workout.items.find((i) => i.id === itemEl?.dataset.item);
    const setEl = el.closest('[data-set]');
    const set = setEl ? item?.sets.find((s) => s.id === setEl.dataset.set) : null;
    return { item, itemEl, set, setEl };
  }

  function scheduleNoteSave(exerciseId, value) {
    clearTimeout(noteTimers.get(exerciseId)?.timer);
    const timer = setTimeout(() => saveNote(exerciseId), NOTE_SAVE_DELAY_MS);
    noteTimers.set(exerciseId, { timer, value });
  }

  function saveNote(exerciseId) {
    const pending = noteTimers.get(exerciseId);
    if (!pending) return;
    clearTimeout(pending.timer);
    noteTimers.delete(exerciseId);
    store.updateExerciseNote(exerciseId, pending.value).catch(toastError);
  }

  // ---------- Events ----------

  container.addEventListener('input', (event) => {
    const field = event.target.dataset.field;
    if (!field) return;
    const { item, set, setEl } = locate(event.target);
    if (!item) return;

    if (field === 'exnote') {
      scheduleNoteSave(item.exerciseId, event.target.value);
      event.target.closest('.ex-block').querySelector('.note-toggle').classList.toggle('has-note', Boolean(event.target.value.trim()));
      return;
    }
    if (!set) return;
    if (field === 'weight') set.weight = parseDecimal(event.target.value);
    else if (field === 'reps') set.reps = parseInteger(event.target.value);
    else if (field === 'rpe') set.rpe = event.target.value ? Number(event.target.value) : null;
    updateRowState(setEl, set);
    onChange(false);
    if (!live) refreshPRs();
  });

  // RPE-Auswahl meldet sich auf iOS zuverlässig über change
  container.addEventListener('change', (event) => {
    if (event.target.dataset.field !== 'rpe') return;
    const { set } = locate(event.target);
    if (!set) return;
    set.rpe = event.target.value ? Number(event.target.value) : null;
    onChange(false);
  });

  container.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    const { item, set, setEl } = locate(button);

    switch (action) {
      case 'toggle-type':
        set.type = set.type === 'work' ? 'warmup' : 'work';
        rerenderItem(item);
        onChange(true);
        break;

      case 'dec':
      case 'inc': {
        const direction = action === 'inc' ? 1 : -1;
        const ph = placeholderFor(item, set);
        // Leeres Feld: der erste Tap übernimmt den Wert vom letzten Mal (falls vorhanden)
        if (set.weight == null && ph) set.weight = ph.weight;
        else set.weight = stepWeight(set.weight ?? 0, settings.weightStep, direction);
        setEl.querySelector('[data-field="weight"]').value = formatNumber(set.weight);
        updateRowState(setEl, set);
        onChange(false);
        if (!live) refreshPRs();
        break;
      }

      case 'done':
        set.done = !set.done;
        set.doneAt = set.done ? Date.now() : null;
        updateRowState(setEl, set);
        onChange(true);
        refreshPRs();
        if (set.done) onSetDone?.(set);
        break;

      case 'set-menu':
        openSetMenu(item, set);
        break;

      case 'add-set':
        item.sets.push(createSet());
        rerenderItem(item);
        onChange(true);
        break;

      case 'toggle-exnote': {
        const noteEl = button.closest('.ex-block').querySelector('.ex-note');
        noteEl.hidden = !noteEl.hidden;
        button.setAttribute('aria-expanded', String(!noteEl.hidden));
        if (noteEl.hidden) openNotes.delete(item.id);
        else {
          openNotes.add(item.id);
          noteEl.querySelector('textarea').focus();
        }
        break;
      }

      case 'item-menu':
        openItemMenu(item);
        break;

      case 'add-exercise': {
        const exercise = await pickExercise({ excludeIds: workout.items.map((i) => i.exerciseId) });
        if (!exercise) return;
        const newItem = createItem(exercise.id, store.DEFAULT_PLANNED_SETS);
        workout.items.push(newItem);
        renderAll();
        onChange(true);
        container.querySelector(`[data-item="${CSS.escape(newItem.id)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        break;
      }
    }
  });

  function openSetMenu(item, set) {
    let noteInput = null;
    let deleted = false;
    openSheet({
      title: 'Satz',
      onClose() {
        if (deleted || !noteInput) return;
        const note = noteInput.value.trim();
        if (note !== set.note) {
          set.note = note;
          rerenderItem(item);
          onChange(true);
        }
      },
      render(body, close) {
        body.innerHTML = `
          <label class="field">
            <span>Notiz zu diesem Satz</span>
            <textarea rows="3" placeholder="z. B. letzte Wdh. mit Hilfe">${esc(set.note)}</textarea>
          </label>
          <div class="sheet-actions">
            <button type="button" class="btn btn-danger-outline" data-delete>Satz löschen</button>
            <button type="button" class="btn btn-primary" data-sheet-close>Fertig</button>
          </div>
        `;
        noteInput = body.querySelector('textarea');
        body.querySelector('[data-delete]').addEventListener('click', () => {
          deleted = true;
          item.sets.splice(item.sets.indexOf(set), 1);
          rerenderItem(item);
          onChange(true);
          refreshPRs();
          close();
        });
      },
    });
  }

  function openItemMenu(item) {
    const index = workout.items.indexOf(item);
    openSheet({
      title: store.exerciseName(item.exerciseId),
      render(body, close) {
        body.innerHTML = `
          <div class="stack">
            <button type="button" class="btn btn-block" data-move="-1" ${index === 0 ? 'disabled' : ''}>Nach oben</button>
            <button type="button" class="btn btn-block" data-move="1" ${index === workout.items.length - 1 ? 'disabled' : ''}>Nach unten</button>
            <button type="button" class="btn btn-block btn-danger-outline" data-remove>Übung entfernen</button>
          </div>
        `;
        body.addEventListener('click', async (event) => {
          const move = event.target.closest('[data-move]');
          if (move && !move.disabled) {
            const to = index + Number(move.dataset.move);
            [workout.items[index], workout.items[to]] = [workout.items[to], workout.items[index]];
            renderAll();
            onChange(true);
            close();
            return;
          }
          if (event.target.closest('[data-remove]')) {
            const hasValues = item.sets.some(isFilled);
            if (hasValues && !(await confirmDialog({ title: 'Übung entfernen?', message: 'Die eingetragenen Sätze gehen verloren.', confirmLabel: 'Entfernen', danger: true }))) {
              return;
            }
            workout.items.splice(workout.items.indexOf(item), 1);
            renderAll();
            onChange(true);
            close();
          }
        });
      },
    });
  }

  renderAll();

  return {
    renderAll,
    refreshPRs,
    /** Ausstehende Übungsnotizen sofort speichern. */
    destroy() {
      for (const exerciseId of [...noteTimers.keys()]) saveNote(exerciseId);
    },
  };
}
