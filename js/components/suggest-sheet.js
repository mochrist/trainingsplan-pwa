// Sheet „Training vorschlagen“: Fokus bzw. Muskelgruppen wählen, Vorschlag anpassen, starten oder als Template speichern.
import * as store from '../store.js';
import { esc } from '../lib/html.js';
import { MUSCLES } from '../lib/catalog.js';
import {
  FOCUS_PRESETS,
  DEFAULT_SUGGESTION_COUNT,
  MIN_SUGGESTION_COUNT,
  MAX_SUGGESTION_COUNT,
  buildCandidates,
  generateSuggestion,
  alternativeFor,
  lastTrainedByMuscle,
  lastTrainedForFocus,
  recommendFocus,
} from '../lib/suggest.js';
import { lastSession } from '../lib/history.js';
import { formatSet } from '../lib/numbers.js';
import { formatDaysAgo } from '../lib/time.js';
import { openSheet, promptDialog } from './sheet.js';
import { toast, toastError } from './toast.js';
import { navigate } from '../nav.js';

const sameMuscles = (a, b) => a.length === b.length && a.every((m) => b.includes(m));

/** @param onChange nach dem Speichern als Template (Startseite neu rendern) */
export function openSuggestionSheet({ onChange } = {}) {
  const exercisesById = new Map(store.getExercises().map((e) => [e.id, e]));
  const lastByMuscle = lastTrainedByMuscle(store.getWorkouts(), exercisesById);
  const recommended = recommendFocus(lastByMuscle);
  const usage = store.getExerciseUsage();
  const candidates = buildCandidates(store.getExercises());
  const rpeEnabled = store.getSettings().rpeEnabled;

  let focus = recommended ?? 'push';
  let muscles = [...FOCUS_PRESETS[focus].muscles];
  let count = DEFAULT_SUGGESTION_COUNT;
  let picks = [];
  let busy = false;

  function regenerate() {
    picks = generateSuggestion({ candidates, muscles, count, usage });
  }

  function workoutName() {
    if (focus) return FOCUS_PRESETS[focus].label;
    return muscles.length && muscles.length <= 2 ? muscles.map((m) => MUSCLES[m]).join(' + ') : 'Training';
  }

  /** Eine Übung ergänzen: für die Muskelgruppe mit den wenigsten Übungen, sofern dort noch etwas frei ist. */
  function addOne() {
    const bySlotCount = [...muscles].sort(
      (a, b) => picks.filter((p) => p.slot === a).length - picks.filter((p) => p.slot === b).length,
    );
    for (const slot of bySlotCount) {
      const next = alternativeFor({ slot }, { candidates, picks, usage });
      if (next) {
        picks.push(next);
        picks.sort((a, b) => Number(b.compound) - Number(a.compound));
        return;
      }
    }
  }

  function detailLine(pick) {
    const parts = [MUSCLES[pick.slot]];
    if (!pick.exerciseId) {
      parts.push('neu aus dem Katalog');
    } else {
      const last = lastSession(store.getWorkouts(), pick.exerciseId);
      if (last) parts.push(`zuletzt ${formatDaysAgo(last.startedAt)}: ${last.sets.map((s) => formatSet(s, { withRpe: rpeEnabled })).join(' · ')}`);
      else parts.push('noch nicht trainiert');
    }
    return parts.join(' · ');
  }

  function emptyText() {
    if (!muscles.length) return 'Bitte mindestens eine Muskelgruppe wählen.';
    return count ? 'Keine passenden Übungen gefunden.' : 'Keine Übungen ausgewählt.';
  }

  function renderHint() {
    if (!recommended) return '<p class="muted small suggest-hint">Wähle, was du heute trainieren willst.</p>';
    const at = lastTrainedForFocus(recommended, lastByMuscle);
    return `<p class="muted small suggest-hint">Empfehlung: <strong>${esc(FOCUS_PRESETS[recommended].label)}</strong>,
      am längsten nicht trainiert (${at ? `zuletzt ${formatDaysAgo(at)}` : 'noch nie'}).</p>`;
  }

  openSheet({
    title: 'Training vorschlagen',
    render(body, close) {
      function draw() {
        body.innerHTML = `
          ${renderHint()}
          <div class="chip-row" role="radiogroup" aria-label="Fokus">
            ${Object.entries(FOCUS_PRESETS)
              .map(([key, preset]) => `<button type="button" role="radio" class="state-chip" data-focus="${key}" aria-checked="${key === focus}">${esc(preset.label)}</button>`)
              .join('')}
          </div>
          <p class="field-label">Muskelgruppen</p>
          <div class="chip-row">
            ${Object.entries(MUSCLES)
              .map(([key, label]) => `<button type="button" class="state-chip chip-multi" data-muscle="${key}" aria-pressed="${muscles.includes(key)}">${esc(label)}</button>`)
              .join('')}
          </div>
          <div class="suggest-count">
            <span class="muted">Übungen</span>
            <div class="stepper">
              <button type="button" class="icon-btn" data-action="count-dec" aria-label="Weniger Übungen" ${count <= MIN_SUGGESTION_COUNT ? 'disabled' : ''}>−</button>
              <span class="stepper-value">${count}</span>
              <button type="button" class="icon-btn" data-action="count-inc" aria-label="Mehr Übungen" ${count >= MAX_SUGGESTION_COUNT ? 'disabled' : ''}>+</button>
            </div>
          </div>
          ${
            picks.length
              ? `<ol class="list suggest-list">
                  ${picks
                    .map(
                      (pick, index) => `
                        <li class="suggest-item" data-index="${index}">
                          <div class="suggest-item-text">
                            <div class="suggest-item-name">${esc(pick.name)}</div>
                            <div class="muted small">${esc(detailLine(pick))}</div>
                          </div>
                          <button type="button" class="icon-btn" data-action="swap" aria-label="Andere Übung">↻</button>
                          <button type="button" class="icon-btn" data-action="remove" aria-label="Entfernen">✕</button>
                        </li>`,
                    )
                    .join('')}
                </ol>`
              : `<p class="empty-state">${emptyText()}</p>`
          }
          ${picks.length < count && picks.length ? '<p class="muted small">Für diese Auswahl gibt es nicht mehr Übungen.</p>' : ''}
          <button type="button" class="btn-link" data-action="reroll" ${muscles.length ? '' : 'disabled'}>Neu würfeln</button>
          <div class="sheet-actions">
            <button type="button" class="btn" data-action="save-template" ${picks.length ? '' : 'disabled'}>Als Template</button>
            <button type="button" class="btn btn-primary" data-action="start" ${picks.length ? '' : 'disabled'}>Starten</button>
          </div>
        `;
      }

      async function materialize() {
        busy = true;
        try {
          return await store.ensureExercises(picks);
        } finally {
          busy = false;
        }
      }

      body.addEventListener('click', async (event) => {
        if (busy) return;
        const focusChip = event.target.closest('[data-focus]');
        const muscleChip = event.target.closest('[data-muscle]');
        const target = event.target.closest('[data-action]');
        const index = Number(event.target.closest('[data-index]')?.dataset.index);

        if (focusChip) {
          focus = focusChip.dataset.focus;
          muscles = [...FOCUS_PRESETS[focus].muscles];
          regenerate();
        } else if (muscleChip) {
          const key = muscleChip.dataset.muscle;
          muscles = muscles.includes(key) ? muscles.filter((m) => m !== key) : [...muscles, key];
          focus = Object.keys(FOCUS_PRESETS).find((k) => sameMuscles(FOCUS_PRESETS[k].muscles, muscles)) ?? null;
          regenerate();
        } else if (!target || target.disabled) {
          return;
        } else if (target.dataset.action === 'count-dec') {
          count--;
          picks = picks.slice(0, count);
        } else if (target.dataset.action === 'count-inc') {
          count++;
          addOne();
        } else if (target.dataset.action === 'reroll') {
          regenerate();
        } else if (target.dataset.action === 'swap') {
          const next = alternativeFor(picks[index], { candidates, picks, usage });
          if (!next) {
            toast('Keine weitere Übung für diese Muskelgruppe.');
            return;
          }
          picks[index] = next;
        } else if (target.dataset.action === 'remove') {
          picks.splice(index, 1);
          count = picks.length;
        } else if (target.dataset.action === 'start') {
          try {
            const exerciseIds = await materialize();
            await store.startWorkout({ exerciseIds, name: workoutName() });
            close();
            navigate('workout');
          } catch (err) {
            toastError(err);
          }
          return;
        } else if (target.dataset.action === 'save-template') {
          const name = await promptDialog({ title: 'Als Template speichern', label: 'Name', value: workoutName(), confirmLabel: 'Speichern' });
          if (name == null) return;
          try {
            const exerciseIds = await materialize();
            const template = await store.createTemplate(name, exerciseIds);
            toast(`Template „${template.name}“ gespeichert`);
            close();
            onChange?.();
          } catch (err) {
            toastError(err);
          }
          return;
        }
        draw();
      });

      regenerate();
      draw();
    },
  });
}
