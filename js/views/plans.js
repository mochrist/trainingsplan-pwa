import * as store from '../store.js';
import { esc, newId } from '../lib/html.js';
import { normalizeName } from '../lib/normalize.js';
import { openSheet, confirmDialog, promptDialog } from '../components/sheet.js';
import { toast, toastError } from '../components/toast.js';
import { pickExercise } from '../components/exercise-picker.js';
import { navigate } from '../nav.js';
import { MUSCLES } from '../lib/catalog.js';

let libraryQuery = '';
let showArchived = false;

export function render(root, params = []) {
  if (params[0] === 'template') {
    renderTemplateEditor(root, params[1]);
    return;
  }

  const templates = store.getTemplates();
  root.innerHTML = `
    <h1>Pläne</h1>

    <section>
      <div class="section-header">
        <h2>Templates</h2>
        <button type="button" class="btn" data-action="new-template">+ Template</button>
      </div>
      <ul class="list">
        ${
          templates.length
            ? templates
                .map(
                  (t) => `
                    <li>
                      <a class="list-item" href="#/plans/template/${esc(t.id)}">
                        <span class="list-item-title">${esc(t.name)}</span>
                        <span class="muted small">${t.items.length} ${t.items.length === 1 ? 'Übung' : 'Übungen'}</span>
                      </a>
                    </li>`,
                )
                .join('')
            : '<li class="empty-state">Noch keine Templates, z. B. „Push“ und „Pull“.</li>'
        }
      </ul>
    </section>

    <section class="library">
      <div class="section-header">
        <h2>Übungen</h2>
        <button type="button" class="btn" data-action="new-exercise">+ Übung</button>
      </div>
      <input type="search" class="search-input" placeholder="Übungen durchsuchen" value="${esc(libraryQuery)}"
        autocomplete="off" aria-label="Übungen durchsuchen">
      <label class="switch-row">
        <input type="checkbox" data-action="toggle-archived" ${showArchived ? 'checked' : ''}>
        <span>Archivierte anzeigen</span>
      </label>
      <ul class="list" data-exercise-list></ul>
    </section>
  `;

  const listEl = root.querySelector('[data-exercise-list]');
  const renderLibrary = () => {
    listEl.innerHTML = renderExerciseList();
  };
  renderLibrary();

  root.querySelector('.search-input').addEventListener('input', (event) => {
    libraryQuery = event.target.value;
    renderLibrary();
  });

  root.addEventListener('change', (event) => {
    if (event.target.matches('[data-action="toggle-archived"]')) {
      showArchived = event.target.checked;
      renderLibrary();
    }
  });

  root.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'new-template') {
      const name = await promptDialog({ title: 'Neues Template', label: 'Name', confirmLabel: 'Anlegen' });
      if (name == null) return;
      try {
        const template = await store.createTemplate(name);
        navigate(`plans/template/${template.id}`);
      } catch (err) {
        toastError(err);
      }
    } else if (action === 'new-exercise') {
      const name = await promptDialog({ title: 'Neue Übung', label: 'Name', confirmLabel: 'Anlegen' });
      if (name == null) return;
      try {
        const existing = store.getExercises().find((e) => e.nameNorm === normalizeName(name));
        await store.createExercise(name);
        if (existing && !existing.archived) toast(`„${existing.name}“ gibt es schon.`);
        renderLibrary();
      } catch (err) {
        toastError(err);
      }
    } else if (action === 'open-exercise') {
      openExerciseSheet(target.dataset.id, renderLibrary);
    }
  });
}

function renderExerciseList() {
  const queryNorm = normalizeName(libraryQuery);
  const exercises = store
    .getExercises()
    .filter((e) => (showArchived || !e.archived) && e.nameNorm.includes(queryNorm))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  if (!exercises.length) return `<li class="empty-state">Keine Übungen gefunden</li>`;

  return exercises
    .map(
      (e) => `
        <li>
          <button type="button" class="list-item" data-action="open-exercise" data-id="${esc(e.id)}">
            <span class="list-item-title">${esc(e.name)}</span>
            ${e.muscles?.length ? `<span class="muted small">${esc(MUSCLES[e.muscles[0]])}</span>` : ''}
            ${e.archived ? '<span class="badge">archiviert</span>' : ''}
            ${e.note ? '<span class="muted list-item-sub">' + esc(e.note) + '</span>' : ''}
          </button>
        </li>`,
    )
    .join('');
}

function openExerciseSheet(id, onChange) {
  const exercise = store.getExercise(id);
  if (!exercise) return;
  const used = store.isExerciseUsed(id);
  let noteEl = null;

  openSheet({
    title: exercise.name,
    async onClose() {
      // Notiz auch speichern, wenn das Sheet ohne Blur geschlossen wird
      const current = store.getExercise(id);
      if (noteEl && current && noteEl.value !== current.note) {
        await store.updateExerciseNote(id, noteEl.value).catch(toastError);
      }
      onChange();
    },
    render(body, close) {
      body.innerHTML = `
        <form class="stack" data-form="rename">
          <label class="field">
            <span>Name</span>
            <div class="input-row">
              <input type="text" name="name" value="${esc(exercise.name)}" autocomplete="off" required>
              <button type="submit" class="btn">Umbenennen</button>
            </div>
          </label>
        </form>
        <label class="field">
          <span>Notiz (z. B. Sitzhöhe, Griffbreite)</span>
          <textarea name="note" rows="3">${esc(exercise.note)}</textarea>
        </label>
        <div data-muscles></div>
        <div class="stack">
          <button type="button" class="btn btn-block" data-action="archive">
            ${exercise.archived ? 'Wiederherstellen' : 'Archivieren'}
          </button>
          ${
            used
              ? '<p class="muted small">Wird verwendet und kann deshalb nur archiviert werden.</p>'
              : '<button type="button" class="btn btn-block btn-danger-outline" data-action="delete">Löschen</button>'
          }
        </div>
      `;

      body.querySelector('[data-form="rename"]').addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          await store.renameExercise(id, event.target.elements.name.value);
          toast('Umbenannt');
          close();
        } catch (err) {
          toastError(err);
        }
      });

      noteEl = body.querySelector('[name="note"]');
      mountMuscleEditor(body.querySelector('[data-muscles]'), id);

      body.querySelector('[data-action="archive"]').addEventListener('click', async () => {
        try {
          await store.setExerciseArchived(id, !exercise.archived);
          close();
        } catch (err) {
          toastError(err);
        }
      });

      body.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'Übung löschen?', message: exercise.name, confirmLabel: 'Löschen', danger: true }))) return;
        try {
          await store.deleteExercise(id);
          close();
        } catch (err) {
          toastError(err);
        }
      });
    },
  });
}

/** Muskelgruppen einer Übung (für den Trainingsvorschlag). Jede Änderung wird sofort gespeichert. */
function mountMuscleEditor(container, id) {
  function draw() {
    const { muscles = [], compound = false } = store.getExercise(id);
    const [primary, ...secondary] = muscles;
    container.innerHTML = `
      <p class="field-label">Hauptmuskelgruppe</p>
      <div class="chip-row" role="radiogroup" aria-label="Hauptmuskelgruppe">
        ${Object.entries(MUSCLES)
          .map(([key, label]) => `<button type="button" role="radio" class="state-chip" data-primary="${key}" aria-checked="${key === primary}">${esc(label)}</button>`)
          .join('')}
      </div>
      ${
        primary
          ? `<p class="field-label">Weitere Muskelgruppen</p>
            <div class="chip-row">
              ${Object.entries(MUSCLES)
                .filter(([key]) => key !== primary)
                .map(([key, label]) => `<button type="button" class="state-chip chip-multi" data-secondary="${key}" aria-pressed="${secondary.includes(key)}">${esc(label)}</button>`)
                .join('')}
            </div>
            <label class="switch-row">
              <input type="checkbox" data-compound ${compound ? 'checked' : ''}>
              <span>Grundübung (mehrgelenkig, kommt im Vorschlag zuerst)</span>
            </label>`
          : '<p class="muted small">Ohne Muskelgruppe wird die Übung nicht vorgeschlagen.</p>'
      }
    `;
  }

  async function save(change) {
    const { muscles = [], compound = false } = store.getExercise(id);
    const [primary = null, ...secondary] = muscles;
    try {
      await store.updateExerciseMuscles(id, { primary, secondary, compound, ...change });
    } catch (err) {
      toastError(err);
    }
    draw();
  }

  container.addEventListener('click', (event) => {
    const primaryChip = event.target.closest('[data-primary]');
    const secondaryChip = event.target.closest('[data-secondary]');
    const current = store.getExercise(id).muscles ?? [];
    if (primaryChip) {
      const key = primaryChip.dataset.primary;
      // Erneutes Tippen auf die Hauptmuskelgruppe entfernt die Zuordnung
      save(key === current[0] ? { primary: null, secondary: [] } : { primary: key, secondary: current.slice(1).filter((m) => m !== key) });
    } else if (secondaryChip) {
      const key = secondaryChip.dataset.secondary;
      const secondary = current.slice(1);
      save({ secondary: secondary.includes(key) ? secondary.filter((m) => m !== key) : [...secondary, key] });
    }
  });
  container.addEventListener('change', (event) => {
    if (event.target.matches('[data-compound]')) save({ compound: event.target.checked });
  });

  draw();
}

// ---------- Template-Editor ----------

const MAX_PLANNED_SETS = 10;

function renderTemplateEditor(root, id) {
  if (!store.getTemplate(id)) {
    root.innerHTML = `
      <a href="#/plans" class="btn">‹ Pläne</a>
      <p class="empty-state">Template nicht gefunden.</p>
    `;
    return;
  }

  // Jede Änderung arbeitet auf einer Kopie und speichert sie sofort
  async function update(mutate) {
    const draft = structuredClone(store.getTemplate(id));
    mutate(draft);
    try {
      await store.saveTemplate(draft);
    } catch (err) {
      toastError(err);
    }
    renderItems();
  }

  root.innerHTML = `
    <div class="toolbar">
      <a href="#/plans" class="btn">‹ Pläne</a>
    </div>
    <label class="field">
      <span>Name</span>
      <input type="text" name="name" value="${esc(store.getTemplate(id).name)}" autocomplete="off">
    </label>
    <ol class="list template-items" data-items></ol>
    <button type="button" class="btn btn-block" data-action="add-item">+ Übung hinzufügen</button>
    <div class="stack actions-bottom">
      <button type="button" class="btn btn-block" data-action="duplicate">Duplizieren</button>
      <button type="button" class="btn btn-block btn-danger-outline" data-action="delete">Template löschen</button>
    </div>
  `;

  const itemsEl = root.querySelector('[data-items]');

  function renderItems() {
    const { items } = store.getTemplate(id);
    itemsEl.innerHTML = items.length
      ? items
          .map(
            (item, index) => `
              <li class="template-item" data-index="${index}">
                <div class="template-item-name">${esc(store.exerciseName(item.exerciseId))}</div>
                <div class="template-item-controls">
                  <div class="stepper" aria-label="Geplante Sätze">
                    <button type="button" class="icon-btn" data-action="sets-dec" aria-label="Weniger Sätze" ${item.plannedSets <= 1 ? 'disabled' : ''}>−</button>
                    <span class="stepper-value">${item.plannedSets} ${item.plannedSets === 1 ? 'Satz' : 'Sätze'}</span>
                    <button type="button" class="icon-btn" data-action="sets-inc" aria-label="Mehr Sätze" ${item.plannedSets >= MAX_PLANNED_SETS ? 'disabled' : ''}>+</button>
                  </div>
                  <button type="button" class="icon-btn" data-action="up" aria-label="Nach oben" ${index === 0 ? 'disabled' : ''}>↑</button>
                  <button type="button" class="icon-btn" data-action="down" aria-label="Nach unten" ${index === items.length - 1 ? 'disabled' : ''}>↓</button>
                  <button type="button" class="icon-btn" data-action="remove" aria-label="Entfernen">✕</button>
                </div>
              </li>`,
          )
          .join('')
      : '<li class="empty-state">Noch keine Übungen.</li>';
  }
  renderItems();

  root.querySelector('[name="name"]').addEventListener('change', (event) => {
    update((draft) => {
      draft.name = event.target.value;
    });
  });

  root.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    const index = Number(target.closest('[data-index]')?.dataset.index);

    if (action === 'add-item') {
      const excludeIds = store.getTemplate(id).items.map((item) => item.exerciseId);
      const exercise = await pickExercise({ excludeIds });
      if (exercise) {
        update((draft) => {
          draft.items.push({ id: newId(), exerciseId: exercise.id, plannedSets: store.DEFAULT_PLANNED_SETS });
        });
      }
    } else if (action === 'sets-dec' || action === 'sets-inc') {
      update((draft) => {
        const item = draft.items[index];
        item.plannedSets = Math.min(MAX_PLANNED_SETS, Math.max(1, item.plannedSets + (action === 'sets-inc' ? 1 : -1)));
      });
    } else if (action === 'up' || action === 'down') {
      update((draft) => {
        const to = action === 'up' ? index - 1 : index + 1;
        [draft.items[index], draft.items[to]] = [draft.items[to], draft.items[index]];
      });
    } else if (action === 'remove') {
      update((draft) => {
        draft.items.splice(index, 1);
      });
    } else if (action === 'duplicate') {
      try {
        const copy = await store.duplicateTemplate(id);
        toast('Template dupliziert');
        navigate(`plans/template/${copy.id}`);
      } catch (err) {
        toastError(err);
      }
    } else if (action === 'delete') {
      const { name } = store.getTemplate(id);
      if (!(await confirmDialog({ title: 'Template löschen?', message: name, confirmLabel: 'Löschen', danger: true }))) return;
      try {
        await store.deleteTemplate(id);
        navigate('plans');
      } catch (err) {
        toastError(err);
      }
    }
  });
}
