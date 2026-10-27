// Übungsauswahl mit Autovervollständigung und „neu anlegen".
import * as store from '../store.js';
import { searchExercises, normalizeName, cleanName } from '../lib/normalize.js';
import { esc } from '../lib/html.js';
import { openSheet } from './sheet.js';
import { toastError } from './toast.js';

const MAX_RESULTS = 6;

/**
 * Öffnet die Übungsauswahl als Sheet.
 * @param excludeIds bereits enthaltene Übungen (werden nicht vorgeschlagen)
 * @returns Promise mit der gewählten Übung oder null
 */
export function pickExercise({ title = 'Übung hinzufügen', excludeIds = [] } = {}) {
  return new Promise((resolve) => {
    let result = null;
    openSheet({
      title,
      onClose: () => resolve(result),
      render(body, close) {
        mountPicker(body, {
          excludeIds: new Set(excludeIds),
          onSelect(exercise) {
            result = exercise;
            close();
          },
        });
      },
    });
  });
}

/** Eingabefeld mit Vorschlagsliste direkt darunter. */
export function mountPicker(container, { excludeIds = new Set(), onSelect }) {
  container.innerHTML = `
    <div class="picker">
      <input type="text" class="picker-input" placeholder="Übung suchen oder neu eingeben"
        autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false"
        enterkeyhint="done" aria-label="Übung">
      <ul class="picker-list" role="listbox"></ul>
    </div>
  `;
  const input = container.querySelector('.picker-input');
  const list = container.querySelector('.picker-list');
  const usage = store.getExerciseUsage();
  let options = [];

  function update() {
    const query = input.value;
    const hits = searchExercises(store.getExercises(), query, { usage, limit: MAX_RESULTS, excludeIds });
    options = hits.map((exercise) => ({ kind: 'existing', exercise }));

    const clean = cleanName(query);
    if (clean) {
      const exact = store.getExercises().find((e) => e.nameNorm === normalizeName(clean));
      // Neu anlegen, außer die Übung ist schon aktiv vorhanden (ggf. bereits im Workout)
      if (!exact || exact.archived) options.push({ kind: 'create', name: clean });
    }

    list.innerHTML = options.length
      ? options
          .map((option, index) =>
            option.kind === 'existing'
              ? `<li><button type="button" class="picker-option" data-index="${index}">${esc(option.exercise.name)}</button></li>`
              : `<li><button type="button" class="picker-option picker-create" data-index="${index}">„${esc(option.name)}“ neu anlegen</button></li>`,
          )
          .join('')
      : `<li class="picker-empty muted">Keine Übungen gefunden</li>`;
  }

  async function choose(option) {
    try {
      const exercise = option.kind === 'existing' ? option.exercise : await store.createExercise(option.name);
      if (excludeIds.has(exercise.id)) {
        input.value = '';
        update();
        return;
      }
      onSelect(exercise);
    } catch (err) {
      toastError(err);
    }
  }

  input.addEventListener('input', update);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && options.length) {
      event.preventDefault();
      choose(options[0]);
    }
  });
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-index]');
    if (button) choose(options[Number(button.dataset.index)]);
  });

  update();
  input.focus();
}
